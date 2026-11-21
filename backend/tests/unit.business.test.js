const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { calcularDesgloseIvaIncluido, round2, round4 } = require('../src/shared/utils/tax');
const { UnitConversionService } = require('../src/shared/services/unitConversion.service');
const { CajaService } = require('../src/services/caja.service');
const { sanitizarIdentificadorAuditoria } = require('../src/services/auth.service');
const { parsePagination, buildPaginationMeta } = require('../src/shared/utils/pagination');
const {
  diffCalendarDaysInTimezone,
  endOfDayInTimezone,
  formatDateTimeInTimezone,
  parseDateRangeInTimezone,
  startOfDayInTimezone,
  toIsoDateInTimezone,
} = require('../src/shared/utils/dates');
const { BadRequestError } = require('../src/shared/errors/AppError');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../src/config/constants');

describe('Pruebas unitarias de reglas de negocio (sin base de datos)', () => {
  // =========================================================================
  // 1. Cálculo fiscal de IVA 12% incluido (Guatemala, Decreto 27-92)
  // =========================================================================
  describe('calcularDesgloseIvaIncluido', () => {
    it('desglosa exactamente Q112.00 en base Q100.00 e IVA Q12.00', () => {
      const res = calcularDesgloseIvaIncluido(112, 0.12);

      assert.equal(res.subtotalSinIva, 100);
      assert.equal(res.ivaMonto, 12);
      assert.equal(res.total, 112);
      assert.equal(res.tasaIva, 0.12);
      assert.equal(round2(res.subtotalSinIva + res.ivaMonto), res.total);
    });

    it('desglosa Q95.00 respetando redondeo a 2 decimales y cuadre exacto', () => {
      const res = calcularDesgloseIvaIncluido(95, 0.12);

      assert.equal(res.subtotalSinIva, 84.82);
      assert.equal(res.ivaMonto, 10.18);
      assert.equal(res.total, 95);
      assert.equal(round2(res.subtotalSinIva + res.ivaMonto), 95);
    });

    it('maneja redondeos decimales complejos en Q33.33 y Q10.01 sin descuadre de centavos', () => {
      const res33 = calcularDesgloseIvaIncluido(33.33, 0.12);
      assert.equal(res33.subtotalSinIva, 29.76);
      assert.equal(res33.ivaMonto, 3.57);
      assert.equal(res33.total, 33.33);
      assert.equal(round2(res33.subtotalSinIva + res33.ivaMonto), res33.total);

      const res10 = calcularDesgloseIvaIncluido(10.01, 0.12);
      assert.equal(res10.subtotalSinIva, 8.94);
      assert.equal(res10.ivaMonto, 1.07);
      assert.equal(res10.total, 10.01);
      assert.equal(round2(res10.subtotalSinIva + res10.ivaMonto), res10.total);
    });

    it('devuelve ceros exactos cuando el total es Q0.00', () => {
      const res = calcularDesgloseIvaIncluido(0, 0.12);

      assert.deepEqual(res, {
        subtotalSinIva: 0,
        ivaMonto: 0,
        total: 0,
        tasaIva: 0.12,
      });
    });

    it('redondea correctamente con round2 y round4', () => {
      assert.equal(round2(1.005), 1.01);
      assert.equal(round4(1 / 3), 0.3333);
    });
  });

  // =========================================================================
  // 2. Servicio centralizado de conversión de unidades (lb <-> oz)
  // =========================================================================
  describe('UnitConversionService', () => {
    it('convierte libras a onzas (lbToOz) y onzas a libras (ozToLb) con factor 16', () => {
      assert.equal(UnitConversionService.FACTOR_LB_A_OZ, 16);
      assert.equal(UnitConversionService.lbToOz(1), 16);
      assert.equal(UnitConversionService.lbToOz(2.5), 40);
      assert.equal(UnitConversionService.lbToOz(0), 0);

      assert.equal(UnitConversionService.ozToLb(16), 1);
      assert.equal(UnitConversionService.ozToLb(8), 0.5);
      assert.equal(UnitConversionService.ozToLb(0), 0);
      // En Kardex las salidas pueden ser negativas al mostrarse en libras
      assert.equal(UnitConversionService.ozToLb(-16), -1);
    });

    it('convierte a unidad base en onzas con toBaseOz soportando lb y oz', () => {
      assert.equal(UnitConversionService.toBaseOz(3, 'lb'), 48);
      assert.equal(UnitConversionService.toBaseOz(0.25, 'lb'), 4);
      assert.equal(UnitConversionService.toBaseOz(12.34567, 'oz'), 12.3457);
      assert.equal(UnitConversionService.toBaseOz(0, 'oz'), 0);
    });

    it('convierte costos entre precio por libra y costo por onza', () => {
      assert.equal(UnitConversionService.pricePerLbToCostPerOz(32), 2);
      assert.equal(UnitConversionService.pricePerLbToCostPerOz(40), 2.5);
      assert.equal(UnitConversionService.pricePerLbToCostPerOz(0), 0);

      assert.equal(UnitConversionService.costPerOzToPricePerLb(2), 32);
      assert.equal(UnitConversionService.costPerOzToPricePerLb(1.25), 20);
      assert.equal(UnitConversionService.costPerOzToPricePerLb(0), 0);
    });

    it('lanza BadRequestError ante valores negativos, NaN, Infinity o unidad inválida', () => {
      const esBadRequest = (err) => err instanceof BadRequestError && err.statusCode === 400;

      // Valores negativos
      assert.throws(() => UnitConversionService.lbToOz(-0.1), esBadRequest);
      assert.throws(() => UnitConversionService.toBaseOz(-5, 'oz'), esBadRequest);
      assert.throws(() => UnitConversionService.toBaseOz(-1, 'lb'), esBadRequest);
      assert.throws(() => UnitConversionService.pricePerLbToCostPerOz(-10), esBadRequest);
      assert.throws(() => UnitConversionService.costPerOzToPricePerLb(-0.5), esBadRequest);

      // NaN / Infinity
      assert.throws(() => UnitConversionService.lbToOz(Number.NaN), esBadRequest);
      assert.throws(() => UnitConversionService.lbToOz(Number.POSITIVE_INFINITY), esBadRequest);
      assert.throws(() => UnitConversionService.ozToLb(Number.NaN), esBadRequest);
      assert.throws(() => UnitConversionService.ozToLb(Number.POSITIVE_INFINITY), esBadRequest);
      assert.throws(() => UnitConversionService.toBaseOz(Number.NaN, 'lb'), esBadRequest);
      assert.throws(() => UnitConversionService.pricePerLbToCostPerOz(Number.NaN), esBadRequest);
      assert.throws(() => UnitConversionService.costPerOzToPricePerLb(Number.NaN), esBadRequest);

      // Unidad no soportada
      assert.throws(
        () => UnitConversionService.toBaseOz(10, 'kg'),
        (err) => esBadRequest(err) && /no soportada/i.test(err.message),
      );
      assert.throws(() => UnitConversionService.toBaseOz(10, 'g'), esBadRequest);
      assert.throws(() => UnitConversionService.toBaseOz(10, ''), esBadRequest);
    });
  });

  // =========================================================================
  // 3. Criterio contable unificado de caja (Fase 1.4)
  // =========================================================================
  describe('CajaService.calcularDesgloseCaja', () => {
    it('descuenta en gaveta física únicamente egresos en efectivo y calcula tarjeta neta y total general', () => {
      // Escenario:
      // - Monto inicial: Q500.00
      // - Ventas efectivo: Q1,200.50 | Ventas tarjeta: Q850.00
      // - Ingresos extra (efectivo): Q100.00
      // - Egresos totales: Q275.50 (Q125.50 en efectivo + Q150.00 anulación de tarjeta)
      const desglose = CajaService.calcularDesgloseCaja({
        montoInicial: '500.00',
        totalVentasEfectivo: '1200.50',
        totalVentasTarjeta: '850.00',
        totalIngresosExtra: '100.00',
        totalEgresos: '275.50',
        totalEgresosTarjeta: '150.00',
      });

      assert.equal(desglose.montoInicial, 500);
      assert.equal(desglose.totalVentasEfectivo, 1200.5);
      assert.equal(desglose.totalVentasTarjeta, 850);
      assert.equal(desglose.totalIngresosExtra, 100);
      assert.equal(desglose.totalEgresos, 275.5);
      assert.equal(desglose.totalEgresosTarjeta, 150);

      // Solo egresos en efectivo = 275.50 - 150.00 = 125.50
      assert.equal(desglose.totalEgresosEfectivo, 125.5);
      // Efectivo esperado en gaveta = 500 + 1200.50 + 100 - 125.50 = 1675.00
      assert.equal(desglose.montoEsperadoEfectivo, 1675);
      // Tarjeta neta = 850.00 - 150.00 = 700.00
      assert.equal(desglose.totalTarjetaNeto, 700);
      // Total general esperado = 1675.00 + 700.00 = 2375.00
      assert.equal(desglose.totalGeneralEsperado, 2375);

      // calcularEsperadoEfectivo debe coincidir exactamente con montoEsperadoEfectivo
      assert.equal(
        CajaService.calcularEsperadoEfectivo({
          montoInicial: 500,
          totalVentasEfectivo: 1200.5,
          totalVentasTarjeta: 850,
          totalIngresosExtra: 100,
          totalEgresos: 275.5,
          totalEgresosTarjeta: 150,
        }),
        1675,
      );
    });

    it('asume totalEgresosTarjeta = 0 cuando no se provee y nunca deja totalEgresosEfectivo negativo', () => {
      const sinEgresosTarjeta = CajaService.calcularDesgloseCaja({
        montoInicial: 300,
        totalVentasEfectivo: 200,
        totalVentasTarjeta: 150,
        totalIngresosExtra: 0,
        totalEgresos: 50,
      });

      assert.equal(sinEgresosTarjeta.totalEgresosTarjeta, 0);
      assert.equal(sinEgresosTarjeta.totalEgresosEfectivo, 50);
      assert.equal(sinEgresosTarjeta.montoEsperadoEfectivo, 450);
      assert.equal(sinEgresosTarjeta.totalTarjetaNeto, 150);
      assert.equal(sinEgresosTarjeta.totalGeneralEsperado, 600);

      // Caso defensivo: si totalEgresosTarjeta superara totalEgresos, totalEgresosEfectivo se acota a 0
      const acotado = CajaService.calcularDesgloseCaja({
        montoInicial: 100,
        totalVentasEfectivo: 50,
        totalVentasTarjeta: 200,
        totalIngresosExtra: 0,
        totalEgresos: 80,
        totalEgresosTarjeta: 100,
      });

      assert.equal(acotado.totalEgresosEfectivo, 0);
      assert.equal(acotado.montoEsperadoEfectivo, 150);
      assert.equal(acotado.totalTarjetaNeto, 100);
      assert.equal(acotado.totalGeneralEsperado, 250);
    });
  });

  // =========================================================================
  // 4. Sanitización de identificador en auditoría de login fallido (Fase 2.2)
  // =========================================================================
  describe('sanitizarIdentificadorAuditoria', () => {
    it('enmascara el identificador y genera hash SHA-256 corto (12 hex) sin exponer texto plano', () => {
      const secretoAccidental = 'MiClaveUltraSecreta2026!';
      const resultado = sanitizarIdentificadorAuditoria(secretoAccidental);

      const hashEsperado = crypto
        .createHash('sha256')
        .update(secretoAccidental.toLowerCase())
        .digest('hex')
        .slice(0, 12);

      assert.equal(resultado.identifierMasked, 'Mi***');
      assert.equal(resultado.identifierHash, hashEsperado);
      assert.match(resultado.identifierHash, /^[0-9a-f]{12}$/);
      assert.ok(!resultado.identifierMasked.includes('Clave'));
      assert.ok(!resultado.identifierHash.includes('Clave'));
    });

    it('normaliza espacios y mayúsculas para el hash y oculta completamente textos de <= 2 caracteres', () => {
      const a = sanitizarIdentificadorAuditoria('  Admin@POS.gt  ');
      const b = sanitizarIdentificadorAuditoria('admin@pos.gt');

      assert.equal(a.identifierHash, b.identifierHash);
      assert.equal(a.identifierMasked, 'Ad***');

      assert.equal(sanitizarIdentificadorAuditoria('ab').identifierMasked, '**');
      assert.equal(sanitizarIdentificadorAuditoria('x').identifierMasked, '**');
      assert.equal(sanitizarIdentificadorAuditoria('').identifierMasked, '**');
      assert.equal(sanitizarIdentificadorAuditoria(null).identifierMasked, '**');
    });
  });

  // =========================================================================
  // 5. Utilidades de paginación (parsePagination y buildPaginationMeta)
  // =========================================================================
  describe('parsePagination y buildPaginationMeta', () => {
    it('parsea página y límite válidos incluyendo cadenas numéricas y calcula skip', () => {
      assert.deepEqual(parsePagination(1, 10), { page: 1, limit: 10, skip: 0 });
      assert.deepEqual(parsePagination(3, 15), { page: 3, limit: 15, skip: 30 });
      assert.deepEqual(parsePagination('2', '25'), { page: 2, limit: 25, skip: 25 });
    });

    it('aplica valores por defecto ante entradas negativas, cero, decimales, NaN o vacías', () => {
      assert.deepEqual(parsePagination(-5, -10), {
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        skip: 0,
      });
      assert.deepEqual(parsePagination(0, 0), {
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        skip: 0,
      });
      assert.deepEqual(parsePagination('abc', Number.NaN, 12, 50), {
        page: 1,
        limit: 12,
        skip: 0,
      });
      assert.deepEqual(parsePagination(1.5, 10.7, 15, 50), {
        page: 1,
        limit: 15,
        skip: 0,
      });
      assert.deepEqual(parsePagination(undefined, null, 10, 50), {
        page: 1,
        limit: 10,
        skip: 0,
      });
    });

    it('respeta maxLimit por defecto y personalizado', () => {
      const conMaxDefault = parsePagination(2, 9999);
      assert.equal(conMaxDefault.limit, MAX_PAGE_SIZE);
      assert.equal(conMaxDefault.skip, MAX_PAGE_SIZE);

      const conMaxCustom = parsePagination(4, 200, 10, 50);
      assert.deepEqual(conMaxCustom, { page: 4, limit: 50, skip: 150 });
    });

    it('construye metadatos de paginación con mínimo 1 página incluso cuando total es 0', () => {
      assert.deepEqual(buildPaginationMeta(0, 1, 10), {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      });

      assert.deepEqual(buildPaginationMeta(25, 2, 10), {
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });

      assert.deepEqual(buildPaginationMeta(30, 3, 10), {
        page: 3,
        limit: 10,
        total: 30,
        totalPages: 3,
      });
    });
  });

  // =========================================================================
  // 6. Zona horaria explícita America/Guatemala (Fase 3.1)
  // =========================================================================
  describe('dates.js (America/Guatemala, UTC-6)', () => {
    it('calcula inicio y fin del día exactos en UTC-6 sin depender de la zona del servidor', () => {
      const inicio = startOfDayInTimezone('2026-11-20', 'America/Guatemala');
      const fin = endOfDayInTimezone('2026-11-20', 'America/Guatemala');

      // 2026-11-20 00:00:00.000 GT (UTC-6) = 2026-11-20T06:00:00.000Z
      assert.equal(inicio.toISOString(), '2026-11-20T06:00:00.000Z');
      // 2026-11-20 23:59:59.999 GT (UTC-6) = 2026-11-21T05:59:59.999Z
      assert.equal(fin.toISOString(), '2026-11-21T05:59:59.999Z');
    });

    it('agrupa una venta nocturna de las 21:30 GT (03:30 UTC del día siguiente) en el día correcto de Guatemala', () => {
      const ventaNocturnaUtc = new Date('2026-11-21T03:30:00.000Z');
      assert.equal(toIsoDateInTimezone(ventaNocturnaUtc, 'America/Guatemala'), '2026-11-20');
      assert.equal(
        formatDateTimeInTimezone(ventaNocturnaUtc, 'America/Guatemala'),
        '20/11/2026 21:30:00',
      );
    });

    it('calcula diferencia exacta de días calendario y rangos de fecha en America/Guatemala', () => {
      const base = new Date('2026-11-21T04:00:00.000Z'); // 20/11/2026 22:00 GT
      const target = startOfDayInTimezone('2026-11-23', 'America/Guatemala');
      assert.equal(diffCalendarDaysInTimezone(target, base, 'America/Guatemala'), 3);

      const rango = parseDateRangeInTimezone('2026-11-01', '2026-11-15', 30, 'America/Guatemala');
      assert.equal(rango.labelDesde, '2026-11-01');
      assert.equal(rango.labelHasta, '2026-11-15');
      assert.equal(rango.desde.toISOString(), '2026-11-01T06:00:00.000Z');
      assert.equal(rango.hasta.toISOString(), '2026-11-16T05:59:59.999Z');
    });
  });
});
