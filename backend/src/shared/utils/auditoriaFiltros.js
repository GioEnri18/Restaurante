const { Op, literal, where: seqWhere } = require('sequelize');
const { ACCIONES_AUDITORIA, SEVERIDADES_AUDITORIA } = require('../../config/constants');
const { env } = require('../../config/env');
const { SEVERIDAD_BASE_POR_ACCION } = require('./auditoriaSeveridad');
const { endOfDayInTimezone, startOfDayInTimezone } = require('./dates');

const ACCIONES_ECONOMICAS = [
  'VENTA_CONFIRMADA', 'ANULACION_FACTURA', 'REIMPRESION_FACTURA', 'REIMPRESION_COMANDA', 'CORTESIA_APLICADA',
  'CAMBIO_PRECIO', 'CAMBIO_DISPONIBILIDAD_PLATILLO', 'COMPRA_INVENTARIO', 'AJUSTE_INVENTARIO', 'REGISTRO_MERMA',
  'APERTURA_CAJA', 'MOVIMIENTO_CAJA', 'CIERRE_CAJA', 'REGISTRO_GASTO_OPERATIVO',
];

// Listas derivadas desde la fuente única `SEVERIDAD_BASE_POR_ACCION` para evaluar filas históricas (severidad IS NULL) en SQL
const ACCIONES_BASE_ALTA = Object.entries(SEVERIDAD_BASE_POR_ACCION)
  .filter(([, sev]) => sev === SEVERIDADES_AUDITORIA.ALTA)
  .map(([accion]) => `'${accion}'`)
  .join(', ');

const ACCIONES_BASE_MEDIA = Object.entries(SEVERIDAD_BASE_POR_ACCION)
  .filter(([, sev]) => sev === SEVERIDADES_AUDITORIA.MEDIA)
  .map(([accion]) => `'${accion}'`)
  .join(', ');

/**
 * Construye una expresión SQL pura para la severidad efectiva de una fila de `auditoria_logs`.
 * - Si `severidad` está persistida, la respeta directamente.
 * - Si `severidad IS NULL` (eventos históricos previos a la migración), la deriva desde `accion`
 *   y los umbrales de diferencia de caja / impacto financiero configurados en `env.js`.
 */
function expresionSqlSeveridadEfectiva(alias = 'a') {
  const diffAlta = Number(env.AUDIT_DIFERENCIA_CAJA_ALTA_Q);
  const impactoAlto = Number(env.AUDIT_IMPACTO_ALTO_Q);
  const p = alias ? `${alias}.` : '';
  return `COALESCE(
    ${p}"severidad",
    CASE
      WHEN ${p}"accion" IN (${ACCIONES_BASE_ALTA}) THEN 'ALTA'
      WHEN ${p}"accion" = '${ACCIONES_AUDITORIA.CIERRE_CAJA}'
        AND (${p}"valor_nuevo"->>'diferencia') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        AND ABS((${p}"valor_nuevo"->>'diferencia')::numeric) >= ${diffAlta} THEN 'ALTA'
      WHEN ${p}"accion" = '${ACCIONES_AUDITORIA.CIERRE_CAJA}'
        AND (${p}"valor_nuevo"->>'diferencia') ~ '^-?[0-9]+(\\.[0-9]+)?$'
        AND ABS((${p}"valor_nuevo"->>'diferencia')::numeric) > 0 THEN 'MEDIA'
      WHEN ${p}"accion" IN ('MOVIMIENTO_CAJA','AJUSTE_INVENTARIO','REGISTRO_MERMA','COMPRA_INVENTARIO','CAMBIO_PRECIO')
        AND ${p}"impacto_financiero" IS NOT NULL
        AND ABS(${p}"impacto_financiero") >= ${impactoAlto} THEN 'ALTA'
      WHEN ${p}"accion" IN (${ACCIONES_BASE_MEDIA}) THEN 'MEDIA'
      ELSE 'BAJA'
    END
  )`;
}

function parseNumeroOpcional(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const num = Number(valor);
  return Number.isFinite(num) ? num : null;
}

/**
 * Constructor ÚNICO y reutilizable de filtros para Auditoría.
 * Garantiza que `GET /auditoria`, `GET /auditoria/resumen` y `GET /auditoria/exportar`
 * apliquen exactamente los mismos criterios de sucursal, nómina, fechas (America/Guatemala),
 * severidad efectiva y rango de impacto financiero.
 *
 * Convención para impactoMin / impactoMax:
 * - Si ambos límites provistos son >= 0 (caso habitual en UI: "impacto mínimo Q 100"),
 *   filtra por magnitud `ABS(impacto_financiero)` para incluir tanto egresos/anulaciones (-Q200)
 *   como sobrantes/ingresos (+Q200).
 * - Si alguno de los límites es negativo, filtra por valor con signo (`impacto_financiero`).
 */
function construirFiltrosAuditoria(sucursalId, query = {}, conNomina = false) {
  const andSequelize = [
    { [Op.or]: [{ sucursalId }, { sucursalId: null }] },
  ];
  const sqlClauses = ['(a."sucursal_id" = :sucursalId OR a."sucursal_id" IS NULL)'];
  const replacements = { sucursalId };
  const filtrosAplicados = {};

  if (conNomina === 'economica' || conNomina === 'sistema') {
    andSequelize.push({ sucursalId });
    sqlClauses.push('a."sucursal_id" = :sucursalId');
  }
  if (conNomina === 'economica') {
    andSequelize.push({ accion: { [Op.in]: ACCIONES_ECONOMICAS } });
    sqlClauses.push('a."accion" IN (:accionesEconomicas)');
    replacements.accionesEconomicas = ACCIONES_ECONOMICAS;
  } else if (!conNomina) {
    andSequelize.push({ accion: { [Op.ne]: ACCIONES_AUDITORIA.GESTION_NOMINA } });
    sqlClauses.push('a."accion" <> :accionNomina');
    replacements.accionNomina = ACCIONES_AUDITORIA.GESTION_NOMINA;
  }

  if (query.usuarioId) {
    const usuarioId = Number(query.usuarioId);
    andSequelize.push({ usuarioId });
    sqlClauses.push('a."usuario_id" = :usuarioId');
    replacements.usuarioId = usuarioId;
    filtrosAplicados.usuarioId = usuarioId;
  }

  if (query.aprobadorId) {
    const aprobadorId = Number(query.aprobadorId);
    andSequelize.push({ aprobadorId });
    sqlClauses.push('a."aprobador_id" = :aprobadorId');
    replacements.aprobadorId = aprobadorId;
    filtrosAplicados.aprobadorId = aprobadorId;
  }

  if (query.cajaSesionId) {
    const cajaSesionId = Number(query.cajaSesionId);
    andSequelize.push({ cajaSesionId });
    sqlClauses.push('a."caja_sesion_id" = :cajaSesionId');
    replacements.cajaSesionId = cajaSesionId;
    filtrosAplicados.cajaSesionId = cajaSesionId;
  }

  if (query.accion?.trim()) {
    const accion = query.accion.trim();
    andSequelize.push({ accion });
    sqlClauses.push('a."accion" = :accion');
    replacements.accion = accion;
    filtrosAplicados.accion = accion;
  }

  if (query.severidad?.trim()) {
    const severidad = query.severidad.trim().toUpperCase();
    // Evalúa tanto filas nuevas (severidad persistida) como filas históricas (severidad IS NULL)
    andSequelize.push(
      seqWhere(literal(expresionSqlSeveridadEfectiva('"AuditoriaLog"')), severidad),
    );
    sqlClauses.push(`(${expresionSqlSeveridadEfectiva('a')}) = :severidad`);
    replacements.severidad = severidad;
    filtrosAplicados.severidad = severidad;
  }

  if (query.entidad?.trim()) {
    const entidad = query.entidad.trim();
    andSequelize.push({ entidad });
    sqlClauses.push('a."entidad" = :entidad');
    replacements.entidad = entidad;
    filtrosAplicados.entidad = entidad;
  }

  if (query.entidadId?.trim()) {
    const entidadId = query.entidadId.trim();
    andSequelize.push({ entidadId });
    sqlClauses.push('a."entidad_id" = :entidadId');
    replacements.entidadId = entidadId;
    filtrosAplicados.entidadId = entidadId;
  }

  if (query.fechaDesde || query.fechaHasta) {
    const rango = {};
    if (query.fechaDesde) {
      const desde = startOfDayInTimezone(query.fechaDesde);
      rango[Op.gte] = desde;
      sqlClauses.push('a."created_at" >= :fechaDesde');
      replacements.fechaDesde = desde;
      filtrosAplicados.fechaDesde = query.fechaDesde;
    }
    if (query.fechaHasta) {
      const hasta = endOfDayInTimezone(query.fechaHasta);
      rango[Op.lte] = hasta;
      sqlClauses.push('a."created_at" <= :fechaHasta');
      replacements.fechaHasta = hasta;
      filtrosAplicados.fechaHasta = query.fechaHasta;
    }
    andSequelize.push({ createdAt: rango });
  }

  const impactoMin = parseNumeroOpcional(query.impactoMin);
  const impactoMax = parseNumeroOpcional(query.impactoMax);
  if (impactoMin !== null || impactoMax !== null) {
    const usarConSigno = (impactoMin !== null && impactoMin < 0)
      || (impactoMax !== null && impactoMax < 0);

    andSequelize.push({ impactoFinanciero: { [Op.ne]: null } });
    sqlClauses.push('a."impacto_financiero" IS NOT NULL');

    if (usarConSigno) {
      const rango = {};
      if (impactoMin !== null) {
        rango[Op.gte] = impactoMin;
        sqlClauses.push('a."impacto_financiero" >= :impactoMin');
        replacements.impactoMin = impactoMin;
        filtrosAplicados.impactoMin = impactoMin;
      }
      if (impactoMax !== null) {
        rango[Op.lte] = impactoMax;
        sqlClauses.push('a."impacto_financiero" <= :impactoMax');
        replacements.impactoMax = impactoMax;
        filtrosAplicados.impactoMax = impactoMax;
      }
      andSequelize.push({ impactoFinanciero: rango });
    } else {
      if (impactoMin !== null) {
        andSequelize.push(
          seqWhere(literal('ABS("AuditoriaLog"."impacto_financiero")'), { [Op.gte]: impactoMin }),
        );
        sqlClauses.push('ABS(a."impacto_financiero") >= :impactoMin');
        replacements.impactoMin = impactoMin;
        filtrosAplicados.impactoMin = impactoMin;
      }
      if (impactoMax !== null) {
        andSequelize.push(
          seqWhere(literal('ABS("AuditoriaLog"."impacto_financiero")'), { [Op.lte]: impactoMax }),
        );
        sqlClauses.push('ABS(a."impacto_financiero") <= :impactoMax');
        replacements.impactoMax = impactoMax;
        filtrosAplicados.impactoMax = impactoMax;
      }
    }
  }

  return {
    whereSequelize: { [Op.and]: andSequelize },
    sqlWhere: sqlClauses.join(' AND '),
    replacements,
    filtrosAplicados,
  };
}

/**
 * Escapa un valor para CSV evitando ruptura de columnas e inyección de fórmulas en Excel.
 */
function escaparCeldaCsv(valor) {
  if (valor === undefined || valor === null) return '';
  let texto = String(valor);
  // Protege contra CSV Formula Injection (sin alterar números negativos legítimos como -85.00)
  const pareceFormula = /^[=+@\t\r]/.test(texto)
    || (texto.startsWith('-') && !/^-\d+(\.\d+)?$/.test(texto));
  if (pareceFormula) {
    texto = `'${texto}`;
  }
  if (/[",\r\n]/.test(texto)) {
    return `"${texto.replaceAll('"', '""')}"`;
  }
  return texto;
}

module.exports = {
  ACCIONES_ECONOMICAS,
  expresionSqlSeveridadEfectiva,
  construirFiltrosAuditoria,
  escaparCeldaCsv,
};
