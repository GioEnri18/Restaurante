const { DateTime } = require('luxon');
const { env } = require('../../config/env');
const { BadRequestError } = require('../errors/AppError');

/**
 * Utilitario centralizado de fechas y zona horaria (Fase 3.1).
 * Todas las operaciones por día calendario utilizan explícitamente `env.DEFAULT_TIMEZONE`
 * (por defecto `America/Guatemala`, UTC-6 sin cambio de horario), evitando depender de la
 * zona horaria local del servidor o contenedor Docker.
 */

function toDateTimeInZone(input, zone = env.DEFAULT_TIMEZONE) {
  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone });
  }
  if (typeof input === 'string') {
    const clean = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const dt = DateTime.fromISO(clean, { zone });
      if (!dt.isValid) throw new BadRequestError(`Fecha inválida: ${input}`);
      return dt;
    }
    const dt = DateTime.fromISO(clean, { zone });
    if (!dt.isValid) throw new BadRequestError(`Fecha inválida: ${input}`);
    return dt;
  }
  return DateTime.now().setZone(zone);
}

/** Instante actual en la zona horaria configurada */
function nowInTimezone(zone = env.DEFAULT_TIMEZONE) {
  return DateTime.now().setZone(zone);
}

/** Inicio del día (00:00:00.000) en la zona horaria del negocio, devuelto como JS Date (UTC) */
function startOfDayInTimezone(input, zone = env.DEFAULT_TIMEZONE) {
  const clean = typeof input === 'string' && input.length >= 10 ? input.slice(0, 10) : input;
  return toDateTimeInZone(clean, zone).startOf('day').toJSDate();
}

/** Fin del día (23:59:59.999) en la zona horaria del negocio, devuelto como JS Date (UTC) */
function endOfDayInTimezone(input, zone = env.DEFAULT_TIMEZONE) {
  const clean = typeof input === 'string' && input.length >= 10 ? input.slice(0, 10) : input;
  return toDateTimeInZone(clean, zone).endOf('day').toJSDate();
}

/** Fecha calendario YYYY-MM-DD en la zona horaria del negocio */
function toIsoDateInTimezone(date = new Date(), zone = env.DEFAULT_TIMEZONE) {
  return toDateTimeInZone(date, zone).toISODate();
}

/** Diferencia exacta en días calendario (enteros) entre targetDate y baseDate en la zona horaria del negocio */
function diffCalendarDaysInTimezone(targetDate, baseDate = new Date(), zone = env.DEFAULT_TIMEZONE) {
  const targetDay = toDateTimeInZone(targetDate, zone).startOf('day');
  const baseDay = toDateTimeInZone(baseDate, zone).startOf('day');
  return Math.round(targetDay.diff(baseDay, 'days').days);
}

/** Resuelve un rango de fechas [desde, hasta] en la zona horaria del negocio con fallback de N días */
function parseDateRangeInTimezone(
  fechaDesde,
  fechaHasta,
  defaultDaysBack = 30,
  zone = env.DEFAULT_TIMEZONE,
) {
  const hoy = nowInTimezone(zone);
  const defaultHasta = hoy.toISODate();
  const defaultDesde = hoy.minus({ days: defaultDaysBack }).toISODate();

  const labelDesde = fechaDesde?.trim() ? fechaDesde.trim().slice(0, 10) : defaultDesde;
  const labelHasta = fechaHasta?.trim() ? fechaHasta.trim().slice(0, 10) : defaultHasta;

  return {
    desde: startOfDayInTimezone(labelDesde, zone),
    hasta: endOfDayInTimezone(labelHasta, zone),
    labelDesde,
    labelHasta,
  };
}

/** Formatea fecha y hora legible para reportes/documentos en la zona horaria de Guatemala */
function formatDateTimeInTimezone(date = new Date(), zone = env.DEFAULT_TIMEZONE) {
  return toDateTimeInZone(date, zone).toFormat('dd/MM/yyyy HH:mm:ss');
}

module.exports = {
  toDateTimeInZone,
  nowInTimezone,
  startOfDayInTimezone,
  endOfDayInTimezone,
  toIsoDateInTimezone,
  diffCalendarDaysInTimezone,
  parseDateRangeInTimezone,
  formatDateTimeInTimezone,
};
