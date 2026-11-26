const { createHash } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { env } = require('../../config/env');
const { Cliente } = require('../../models');
const { AppError } = require('../errors/AppError');
const { logger } = require('../logger');
const { startOfDayInTimezone } = require('../utils/dates');
const { enmascararTelefono } = require('../utils/privacidadDomicilio');
const { verificarCaptcha } = require('./captcha.service');

/**
 * Mensaje genérico único para rechazos anti-abuso (límites en BD, honeypot,
 * tiempo mínimo y clientes con `bloqueado_pedidos_web = true`).
 * Nunca revela si un teléfono existe, está bloqueado o qué límite exacto se disparó.
 */
const MENSAJE_RECHAZO_ANTI_ABUSO =
  'No fue posible procesar tu pedido en este momento. Intenta nuevamente más tarde o comunícate directamente con la sucursal.';

const MENSAJE_RECHAZO_CAPTCHA =
  'No se pudo completar la verificación de seguridad. Recarga la verificación e intenta nuevamente.';

const metricasRechazos = {
  total: 0,
  porMotivo: Object.create(null),
  desde: new Date().toISOString(),
};

/**
 * Normaliza una dirección para agrupar variantes de espacios y mayúsculas/minúsculas.
 * Coincide exactamente con la expresión del índice parcial en PostgreSQL:
 * `LOWER(REGEXP_REPLACE(TRIM("direccion_snapshot"), '\s+', ' ', 'g'))`.
 */
function normalizarDireccion(direccion) {
  if (typeof direccion !== 'string') return '';
  return direccion.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Genera un hash SHA-256 corto (12 hex) para correlacionar eventos en logs sin guardar PII */
function hashCortoSinPii(valor) {
  if (!valor) return null;
  return createHash('sha256').update(String(valor)).digest('hex').slice(0, 12);
}

/**
 * Registra un rechazo anti-abuso únicamente en logs estructurados (Pino nivel warn, sin PII)
 * y actualiza el contador en memoria. NUNCA escribe en `auditoria_logs` (tabla inmutable).
 */
function registrarRechazoAntiAbuso({
  motivo,
  sucursalId = null,
  ip = null,
  telefonoNorm = null,
  direccionNorm = null,
  extra = {},
}) {
  metricasRechazos.total += 1;
  metricasRechazos.porMotivo[motivo] = (metricasRechazos.porMotivo[motivo] ?? 0) + 1;

  logger.warn(
    {
      evento: 'PUBLIC_ORDER_ANTI_ABUSE_REJECTED',
      motivo,
      sucursalId,
      ipHash: hashCortoSinPii(ip),
      telefonoEnmascarado: telefonoNorm ? enmascararTelefono(telefonoNorm) : null,
      telefonoHash: hashCortoSinPii(telefonoNorm),
      direccionHash: hashCortoSinPii(direccionNorm),
      ...extra,
    },
    'Pedido público rechazado por control anti-abuso',
  );
}

/** Devuelve una copia segura de los contadores de rechazos anti-abuso (para métricas futuras) */
function obtenerMetricasRechazosPublicos() {
  return {
    total: metricasRechazos.total,
    porMotivo: { ...metricasRechazos.porMotivo },
    desde: metricasRechazos.desde,
  };
}

/** Reinicia contadores en memoria (uso exclusivo en pruebas) */
function reiniciarMetricasRechazosPublicos() {
  metricasRechazos.total = 0;
  metricasRechazos.porMotivo = Object.create(null);
  metricasRechazos.desde = new Date().toISOString();
}

function crearErrorGenericoAntiAbuso() {
  return new AppError(MENSAJE_RECHAZO_ANTI_ABUSO, 429, 'PUBLIC_ORDER_RESTRICTED');
}

/**
 * Validaciones previas a base de datos (sin tocar PostgreSQL):
 * 1. Honeypot oculto: si trae texto, se rechaza silenciosamente con respuesta genérica.
 * 2. Tiempo mínimo de llenado del formulario (`PUBLIC_ORDERS_MIN_FORM_SECONDS`).
 * 3. Verificación anti-bot (`PUBLIC_ORDERS_CAPTCHA_PROVIDER`: `none` | `turnstile`, fail-closed).
 */
async function validarProteccionesPreviasPublicas(input, clientMeta = {}) {
  const ip = clientMeta?.ipAddress ?? null;

  // 1. Honeypot (los humanos nunca ven ni llenan este campo)
  if (typeof input.empresaWeb === 'string' && input.empresaWeb.trim().length > 0) {
    registrarRechazoAntiAbuso({
      motivo: 'HONEYPOT_TRIGGERED',
      ip,
    });
    throw crearErrorGenericoAntiAbuso();
  }

  // 2. Tiempo mínimo de llenado del formulario (en segundos)
  const minSegundos = Number(env.PUBLIC_ORDERS_MIN_FORM_SECONDS ?? 0);
  if (minSegundos > 0) {
    const iniciadoEn = Number(input.formIniciadoEn);
    const ahoraMs = Date.now();
    const transcurridoMs = Number.isFinite(iniciadoEn) ? ahoraMs - iniciadoEn : -1;

    if (!Number.isFinite(iniciadoEn) || transcurridoMs < minSegundos * 1000) {
      registrarRechazoAntiAbuso({
        motivo: 'MIN_FORM_TIME_NOT_MET',
        ip,
        extra: {
          minSegundos,
          transcurridoMs: Number.isFinite(iniciadoEn) ? Math.max(0, Math.round(transcurridoMs)) : null,
        },
      });
      throw crearErrorGenericoAntiAbuso();
    }
  }

  // 3. Verificación Captcha (Turnstile u otro proveedor futuro; fail-closed)
  const captchaRes = await verificarCaptcha({
    token: input.captchaToken,
    ip,
  });
  if (!captchaRes.ok) {
    registrarRechazoAntiAbuso({
      motivo: captchaRes.reason || 'CAPTCHA_FAILED',
      ip,
      extra: {
        provider: captchaRes.provider,
        ...(Array.isArray(captchaRes.errorCodes) && captchaRes.errorCodes.length > 0
          ? { errorCodes: captchaRes.errorCodes }
          : {}),
      },
    });
    throw new AppError(MENSAJE_RECHAZO_CAPTCHA, 400, 'CAPTCHA_VERIFICATION_FAILED');
  }
}

/**
 * Validaciones anti-abuso respaldadas por PostgreSQL (consultas indexadas sobre `pedidos_domicilio` y `clientes`):
 * 1. Bloqueo manual del cliente (`clientes.bloqueado_pedidos_web = true`) -> misma respuesta genérica.
 * 2. Tope global de pedidos web pendientes (`NUEVO`) por sucursal (protege el tablero POS).
 * 3. Tope de pedidos web sin confirmar por teléfono normalizado en la ventana configurada.
 * 4. Tope diario de pedidos web por teléfono normalizado (día calendario en zona de Guatemala).
 * 5. Tope diario de pedidos web a domicilio por dirección normalizada.
 */
async function validarLimitesDbPedidoPublico({
  tx,
  sucursalId,
  telefonoNorm,
  tipoEntrega,
  direccionRaw,
  clientMeta = {},
}) {
  const ip = clientMeta?.ipAddress ?? null;
  const direccionNorm = tipoEntrega === 'DELIVERY' ? normalizarDireccion(direccionRaw) : null;
  const ahora = new Date();
  const ventanaDesde = new Date(
    ahora.getTime() - env.PUBLIC_ORDERS_VENTANA_PENDIENTES_MIN * 60 * 1000,
  );
  const inicioDia = startOfDayInTimezone(ahora, env.DEFAULT_TIMEZONE);

  // 1. Verificar bloqueo manual de pedidos web para el cliente (sin revelar si el teléfono existe)
  const clienteExistente = await Cliente.findOne({
    where: { sucursalId, telefono: telefonoNorm },
    attributes: ['id', 'bloqueadoPedidosWeb'],
    transaction: tx,
  });
  if (clienteExistente?.bloqueadoPedidosWeb) {
    registrarRechazoAntiAbuso({
      motivo: 'CLIENTE_BLOQUEADO_WEB',
      sucursalId,
      ip,
      telefonoNorm,
    });
    throw crearErrorGenericoAntiAbuso();
  }

  // 2. Tope global de pedidos web sin confirmar por sucursal (índice parcial idx_pedidos_domicilio_web_sucursal_pendientes)
  const [globalRow] = await sequelize.query(
    `SELECT COUNT(*)::int AS "total"
     FROM "pedidos_domicilio"
     WHERE "sucursal_id" = :sucursalId
       AND "origen" = 'WEB'
       AND "estado" = 'NUEVO'`,
    {
      replacements: { sucursalId },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  if (Number(globalRow?.total ?? 0) >= env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL) {
    registrarRechazoAntiAbuso({
      motivo: 'LIMITE_GLOBAL_PENDIENTES_SUCURSAL',
      sucursalId,
      ip,
      telefonoNorm,
      extra: {
        pendientesActuales: Number(globalRow?.total ?? 0),
        limite: env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL,
      },
    });
    throw crearErrorGenericoAntiAbuso();
  }

  // 3. Tope de pedidos web sin confirmar por teléfono en la ventana configurada
  const [pendientesTelRow] = await sequelize.query(
    `SELECT COUNT(*)::int AS "total"
     FROM "pedidos_domicilio"
     WHERE "sucursal_id" = :sucursalId
       AND "origen" = 'WEB'
       AND "estado" = 'NUEVO'
       AND "cliente_telefono_snapshot" = :telefonoNorm
       AND "created_at" >= ((:ventanaDesde)::timestamptz AT TIME ZONE 'UTC')`,
    {
      replacements: {
        sucursalId,
        telefonoNorm,
        ventanaDesde: ventanaDesde.toISOString(),
      },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  if (Number(pendientesTelRow?.total ?? 0) >= env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO) {
    registrarRechazoAntiAbuso({
      motivo: 'LIMITE_PENDIENTES_POR_TELEFONO',
      sucursalId,
      ip,
      telefonoNorm,
      extra: {
        pendientesActuales: Number(pendientesTelRow?.total ?? 0),
        limite: env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO,
        ventanaMin: env.PUBLIC_ORDERS_VENTANA_PENDIENTES_MIN,
      },
    });
    throw crearErrorGenericoAntiAbuso();
  }

  // 4. Tope diario de pedidos web por teléfono normalizado (día calendario en America/Guatemala)
  const [telDiaRow] = await sequelize.query(
    `SELECT COUNT(*)::int AS "total"
     FROM "pedidos_domicilio"
     WHERE "sucursal_id" = :sucursalId
       AND "origen" = 'WEB'
       AND "cliente_telefono_snapshot" = :telefonoNorm
       AND "created_at" >= ((:inicioDia)::timestamptz AT TIME ZONE 'UTC')`,
    {
      replacements: {
        sucursalId,
        telefonoNorm,
        inicioDia: inicioDia.toISOString(),
      },
      type: QueryTypes.SELECT,
      transaction: tx,
    },
  );
  if (Number(telDiaRow?.total ?? 0) >= env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA) {
    registrarRechazoAntiAbuso({
      motivo: 'LIMITE_POR_TELEFONO_DIA',
      sucursalId,
      ip,
      telefonoNorm,
      extra: {
        pedidosHoy: Number(telDiaRow?.total ?? 0),
        limite: env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA,
      },
    });
    throw crearErrorGenericoAntiAbuso();
  }

  // 5. Tope diario de pedidos web a domicilio por dirección normalizada
  if (tipoEntrega === 'DELIVERY' && direccionNorm) {
    const [dirDiaRow] = await sequelize.query(
      `SELECT COUNT(*)::int AS "total"
       FROM "pedidos_domicilio"
       WHERE "sucursal_id" = :sucursalId
         AND "origen" = 'WEB'
         AND "tipo_entrega" = 'DELIVERY'
         AND LOWER(REGEXP_REPLACE(TRIM("direccion_snapshot"), '\\s+', ' ', 'g')) = :direccionNorm
         AND "created_at" >= ((:inicioDia)::timestamptz AT TIME ZONE 'UTC')`,
      {
        replacements: {
          sucursalId,
          direccionNorm,
          inicioDia: inicioDia.toISOString(),
        },
        type: QueryTypes.SELECT,
        transaction: tx,
      },
    );
    if (Number(dirDiaRow?.total ?? 0) >= env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA) {
      registrarRechazoAntiAbuso({
        motivo: 'LIMITE_POR_DIRECCION_DIA',
        sucursalId,
        ip,
        telefonoNorm,
        direccionNorm,
        extra: {
          pedidosHoy: Number(dirDiaRow?.total ?? 0),
          limite: env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA,
        },
      });
      throw crearErrorGenericoAntiAbuso();
    }
  }
}

module.exports = {
  MENSAJE_RECHAZO_ANTI_ABUSO,
  MENSAJE_RECHAZO_CAPTCHA,
  normalizarDireccion,
  hashCortoSinPii,
  registrarRechazoAntiAbuso,
  obtenerMetricasRechazosPublicos,
  reiniciarMetricasRechazosPublicos,
  validarProteccionesPreviasPublicas,
  validarLimitesDbPedidoPublico,
};
