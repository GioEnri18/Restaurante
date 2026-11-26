const {
  ACCIONES_AUDITORIA,
  CODIGOS_MOTIVO_AUDITORIA,
  SEVERIDADES_AUDITORIA,
} = require('../../config/constants');
const { env } = require('../../config/env');
const { BadRequestError } = require('../errors/AppError');

const { BAJA, MEDIA, ALTA } = SEVERIDADES_AUDITORIA;

const ORDEN_SEVERIDAD = {
  [BAJA]: 1,
  [MEDIA]: 2,
  [ALTA]: 3,
};

/**
 * Severidad base centralizada por acción de auditoría.
 * Se utiliza tanto al escribir nuevos eventos como al derivar la severidad
 * en tiempo de lectura para registros históricos con `severidad = NULL`.
 */
const SEVERIDAD_BASE_POR_ACCION = Object.freeze({
  [ACCIONES_AUDITORIA.ANULACION_FACTURA]: ALTA,
  [ACCIONES_AUDITORIA.CAMBIO_PERMISOS]: ALTA,
  [ACCIONES_AUDITORIA.GESTION_USUARIO]: ALTA,
  [ACCIONES_AUDITORIA.GESTION_ROL]: ALTA,
  [ACCIONES_AUDITORIA.GESTION_NOMINA]: ALTA,
  [ACCIONES_AUDITORIA.AUTORIZACION_CAJA_RECHAZADA]: ALTA,
  [ACCIONES_AUDITORIA.AUTORIZACION_CORTESIA_RECHAZADA]: ALTA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO]: ALTA,

  [ACCIONES_AUDITORIA.BLOQUEO_CUENTA]: MEDIA,
  [ACCIONES_AUDITORIA.LOGIN_FALLIDO]: MEDIA,
  [ACCIONES_AUDITORIA.REIMPRESION_FACTURA]: MEDIA,
  [ACCIONES_AUDITORIA.REIMPRESION_COMANDA]: MEDIA,
  [ACCIONES_AUDITORIA.CAMBIO_PRECIO]: MEDIA,
  [ACCIONES_AUDITORIA.CAMBIO_RECETA]: MEDIA,
  [ACCIONES_AUDITORIA.CAMBIO_DISPONIBILIDAD_PLATILLO]: MEDIA,
  [ACCIONES_AUDITORIA.AJUSTE_INVENTARIO]: MEDIA,
  [ACCIONES_AUDITORIA.REGISTRO_MERMA]: MEDIA,
  [ACCIONES_AUDITORIA.MOVIMIENTO_CAJA]: MEDIA,
  [ACCIONES_AUDITORIA.REGISTRO_GASTO_OPERATIVO]: MEDIA,
  [ACCIONES_AUDITORIA.EDICION_GASTO_OPERATIVO]: MEDIA,
  [ACCIONES_AUDITORIA.ANULACION_GASTO_OPERATIVO]: MEDIA,
  [ACCIONES_AUDITORIA.CIERRE_CAJA]: BAJA,
  [ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL]: MEDIA,
  [ACCIONES_AUDITORIA.EXPORTAR_AUDITORIA]: MEDIA,
  [ACCIONES_AUDITORIA.CORTESIA_APLICADA]: MEDIA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CANCELADO]: MEDIA,
  [ACCIONES_AUDITORIA.GESTION_ZONA_ENTREGA]: MEDIA,

  [ACCIONES_AUDITORIA.LOGIN_EXITOSO]: BAJA,
  [ACCIONES_AUDITORIA.LOGOUT]: BAJA,
  [ACCIONES_AUDITORIA.VENTA_CONFIRMADA]: BAJA,
  [ACCIONES_AUDITORIA.APERTURA_CAJA]: BAJA,
  [ACCIONES_AUDITORIA.COMPRA_INVENTARIO]: BAJA,
  [ACCIONES_AUDITORIA.CAMBIO_FOTO_PLATILLO]: BAJA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CREADO]: BAJA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_ESTADO]: BAJA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_ASIGNADO]: BAJA,
  [ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO]: BAJA,
});

// Acciones de riesgo financiero que escalan a ALTA cuando |impactoFinanciero| >= AUDIT_IMPACTO_ALTO_Q
const ACCIONES_ESCALABLES_POR_IMPACTO = new Set([
  ACCIONES_AUDITORIA.ANULACION_FACTURA,
  ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
  ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
  ACCIONES_AUDITORIA.REGISTRO_MERMA,
  ACCIONES_AUDITORIA.COMPRA_INVENTARIO,
  ACCIONES_AUDITORIA.CAMBIO_PRECIO,
  ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CANCELADO,
  ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO,
]);

// Flujos que exigen justificación explícita (nota libre o código estandarizado)
const ACCIONES_CON_MOTIVO_OBLIGATORIO = new Set([
  ACCIONES_AUDITORIA.ANULACION_FACTURA,
  ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
  ACCIONES_AUDITORIA.REGISTRO_MERMA,
  ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
  ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CANCELADO,
  ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO,
]);

const CODIGOS_MOTIVO_VALIDOS = new Set(Object.values(CODIGOS_MOTIVO_AUDITORIA));

const MAPA_MOTIVO_MERMA = Object.freeze({
  VENCIMIENTO: CODIGOS_MOTIVO_AUDITORIA.VENCIMIENTO,
  DANO: CODIGOS_MOTIVO_AUDITORIA.PRODUCTO_DANADO,
  ERROR_PREPARACION: CODIGOS_MOTIVO_AUDITORIA.ERROR_PREPARACION,
  ACCIDENTE: CODIGOS_MOTIVO_AUDITORIA.ACCIDENTE_COCINA,
  OTRO: CODIGOS_MOTIVO_AUDITORIA.OTRO,
});

function elevarSeveridad(actual, candidata) {
  return ORDEN_SEVERIDAD[candidata] > ORDEN_SEVERIDAD[actual] ? candidata : actual;
}

function obtenerUmbralesAuditoria() {
  return {
    impactoAltoQ: env.AUDIT_IMPACTO_ALTO_Q,
    diferenciaCajaAltaQ: env.AUDIT_DIFERENCIA_CAJA_ALTA_Q,
    repeticionUmbral: env.AUDIT_REPETICION_UMBRAL,
  };
}

function numeroFinito(val) {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Función pura que determina la severidad final ('BAJA' | 'MEDIA' | 'ALTA') de un evento de auditoría.
 * Funciona tanto al registrar eventos nuevos como al leer registros antiguos con `severidad = NULL`.
 *
 * @param {string} accion Código de acción (ACCIONES_AUDITORIA)
 * @param {object} [contexto] Contexto financiero/operativo del evento
 * @param {number|null} [contexto.impactoFinanciero] Monto en Q (positivo o negativo)
 * @param {number|null} [contexto.diferencia] Diferencia de caja (contado - esperado)
 * @param {number|null} [contexto.repeticionesEnTurno] Ocurrencias de la misma acción por el usuario en el turno
 * @param {object|null} [contexto.valorNuevo] Payload nuevo (útil para inferir montos en eventos históricos)
 * @param {object} [umbrales] Umbrales configurables (por defecto desde `config/env.js`)
 * @returns {'BAJA' | 'MEDIA' | 'ALTA'}
 */
function calcularSeveridad(accion, contexto = {}, umbrales = obtenerUmbralesAuditoria()) {
  let severidad = SEVERIDAD_BASE_POR_ACCION[accion] ?? BAJA;

  const valorNuevo = contexto?.valorNuevo && typeof contexto.valorNuevo === 'object'
    ? contexto.valorNuevo
    : null;

  // 1. Regla específica para cierres de caja y liquidación de repartidor:
  // exacto = BAJA, con diferencia = MEDIA, diferencia >= AUDIT_DIFERENCIA_CAJA_ALTA_Q = ALTA
  if (
    accion === ACCIONES_AUDITORIA.CIERRE_CAJA
    || accion === ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO
  ) {
    const diff = numeroFinito(
      contexto?.diferencia
        ?? contexto?.impactoFinanciero
        ?? valorNuevo?.diferencia
        ?? valorNuevo?.diferenciaLiquidacion,
    );
    if (diff !== null) {
      const absDiff = Math.abs(diff);
      if (absDiff >= umbrales.diferenciaCajaAltaQ) {
        severidad = elevarSeveridad(severidad, ALTA);
      } else if (absDiff > 0) {
        severidad = elevarSeveridad(severidad, MEDIA);
      }
    }
  }

  // 2. Regla por impacto financiero alto (en quetzales)
  if (ACCIONES_ESCALABLES_POR_IMPACTO.has(accion)) {
    const impacto = numeroFinito(
      contexto?.impactoFinanciero
        ?? valorNuevo?.monto
        ?? valorNuevo?.costoEstimado
        ?? valorNuevo?.total,
    );
    if (impacto !== null && Math.abs(impacto) >= umbrales.impactoAltoQ) {
      severidad = elevarSeveridad(severidad, ALTA);
    }
  }

  // 3. Regla por repetición en un mismo turno (ej. N+ reimpresiones, mermas o anulaciones del mismo actor)
  const repeticiones = numeroFinito(contexto?.repeticionesEnTurno);
  if (repeticiones !== null && repeticiones >= umbrales.repeticionUmbral) {
    severidad = elevarSeveridad(severidad, ALTA);
  }

  return severidad;
}

/**
 * Normaliza y valida un código de motivo estandarizado contra el catálogo maestro.
 */
function normalizarCodigoMotivo(codigoMotivo, fallback = null) {
  if (!codigoMotivo) return fallback;
  const limpio = String(codigoMotivo).trim().toUpperCase();
  if (CODIGOS_MOTIVO_VALIDOS.has(limpio)) {
    return limpio;
  }
  return fallback;
}

function mapearMotivoMermaACodigo(motivoMerma) {
  return MAPA_MOTIVO_MERMA[motivoMerma] ?? CODIGOS_MOTIVO_AUDITORIA.OTRO;
}

/**
 * Verifica que las acciones críticas que exigen justificación reciban un motivo no vacío.
 */
function validarMotivoObligatorio(accion, motivo, codigoMotivo) {
  if (!ACCIONES_CON_MOTIVO_OBLIGATORIO.has(accion)) return;
  const tieneTexto = typeof motivo === 'string' && motivo.trim().length > 0;
  const tieneCodigo = Boolean(normalizarCodigoMotivo(codigoMotivo));
  if (!tieneTexto && !tieneCodigo) {
    throw new BadRequestError(`La acción ${accion} requiere indicar un motivo de auditoría`);
  }
}

module.exports = {
  SEVERIDAD_BASE_POR_ACCION,
  ACCIONES_CON_MOTIVO_OBLIGATORIO,
  CODIGOS_MOTIVO_AUDITORIA,
  obtenerUmbralesAuditoria,
  calcularSeveridad,
  normalizarCodigoMotivo,
  mapearMotivoMermaACodigo,
  validarMotivoObligatorio,
};
