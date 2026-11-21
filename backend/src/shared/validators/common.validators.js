const { z } = require('zod');
const { DateTime } = require('luxon');
const { round4 } = require('../utils/tax');

/**
 * Auditoría P1: esquemas reutilizables para validar `req.params` y `req.query`.
 * Los valores de query se conservan como string (los controladores ya los leen así);
 * solo se garantiza formato y rango para evitar NaN, fechas inválidas o consultas abusivas.
 */

const MAX_RANGO_DIAS = 366;

const enteroPositivoStr = z
  .string()
  .regex(/^\d{1,9}$/, 'Debe ser un número entero positivo')
  .refine((v) => Number(v) > 0, 'Debe ser mayor a 0');

const fechaStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato de fecha YYYY-MM-DD')
  .refine((v) => DateTime.fromISO(v).isValid, 'Fecha inválida');

const montoStr = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Monto inválido (máximo 2 decimales)');

const textoBusqueda = (max = 100) => z.string().trim().max(max);

const numeroDecimal = z.union([
  z.number(),
  z.string().trim().regex(/^\d+(\.\d+)?$/).transform(Number),
]);

const idPositivo = numeroDecimal.pipe(z.number().int().positive().max(2147483647));

const cantidadMovimiento = numeroDecimal
  .pipe(z.number().positive('La cantidad debe ser mayor a 0'))
  .refine((cantidad) => round4(cantidad) === cantidad, 'Usa hasta 4 decimales');

const paginacionQuery = {
  page: enteroPositivoStr.optional(),
  limit: enteroPositivoStr.optional(),
};

const rangoFechasQuery = {
  fechaDesde: fechaStr.optional(),
  fechaHasta: fechaStr.optional(),
};

/** Valida que fechaDesde <= fechaHasta y que el rango no supere MAX_RANGO_DIAS */
function refinarRangoFechas(data, ctx) {
  if (!data.fechaDesde || !data.fechaHasta) return;
  const desde = DateTime.fromISO(data.fechaDesde);
  const hasta = DateTime.fromISO(data.fechaHasta);
  if (desde > hasta) {
    ctx.addIssue({
      code: 'custom',
      path: ['fechaDesde'],
      message: 'fechaDesde no puede ser posterior a fechaHasta',
    });
    return;
  }
  if (hasta.diff(desde, 'days').days > MAX_RANGO_DIAS) {
    ctx.addIssue({
      code: 'custom',
      path: ['fechaHasta'],
      message: `El rango de fechas no puede superar ${MAX_RANGO_DIAS} días`,
    });
  }
}

const idParamsSchema = z.object({ id: enteroPositivoStr });

module.exports = {
  MAX_RANGO_DIAS,
  enteroPositivoStr,
  fechaStr,
  montoStr,
  textoBusqueda,
  numeroDecimal,
  idPositivo,
  cantidadMovimiento,
  paginacionQuery,
  rangoFechasQuery,
  refinarRangoFechas,
  idParamsSchema,
};
