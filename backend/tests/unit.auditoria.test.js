const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const {
  ACCIONES_AUDITORIA,
  CODIGOS_MOTIVO_AUDITORIA,
  SEVERIDADES_AUDITORIA,
} = require('../src/config/constants');
const {
  calcularSeveridad,
  mapearMotivoMermaACodigo,
  normalizarCodigoMotivo,
  validarMotivoObligatorio,
} = require('../src/shared/utils/auditoriaSeveridad');
const {
  construirFiltrosAuditoria,
  escaparCeldaCsv,
  expresionSqlSeveridadEfectiva,
} = require('../src/shared/utils/auditoriaFiltros');
const { AuditService, REDACTADO } = require('../src/shared/services/audit.service');
const { BadRequestError } = require('../src/shared/errors/AppError');

const UMBRALES_TEST = {
  impactoAltoQ: 500,
  diferenciaCajaAltaQ: 50,
  repeticionUmbral: 3,
};

describe('Pruebas unitarias del módulo de Auditoría de investigación (sin base de datos)', () => {
  // =========================================================================
  // 1. Cálculo centralizado de severidad (eventos nuevos e históricos)
  // =========================================================================
  describe('calcularSeveridad', () => {
    it('asigna severidades base esperadas según el tipo de acción', () => {
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.ANULACION_FACTURA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.ALTA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.CAMBIO_PERMISOS, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.ALTA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.GESTION_USUARIO, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.ALTA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.AUTORIZACION_CAJA_RECHAZADA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.ALTA);

      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.BLOQUEO_CUENTA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.MEDIA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.LOGIN_FALLIDO, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.MEDIA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.REIMPRESION_FACTURA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.MEDIA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.CAMBIO_DISPONIBILIDAD_PLATILLO, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.MEDIA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.EXPORTAR_AUDITORIA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.MEDIA);

      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.VENTA_CONFIRMADA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.BAJA);
      assert.equal(calcularSeveridad(ACCIONES_AUDITORIA.APERTURA_CAJA, {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.BAJA);
      assert.equal(calcularSeveridad('ACCION_NO_CATALOGADA', {}, UMBRALES_TEST), SEVERIDADES_AUDITORIA.BAJA);
    });

    it('evalúa CIERRE_CAJA según diferencia: exacto=BAJA, menor al umbral=MEDIA, >=umbral=ALTA', () => {
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.CIERRE_CAJA, { diferencia: 0 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.BAJA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.CIERRE_CAJA, { diferencia: -12.5 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.MEDIA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.CIERRE_CAJA, { diferencia: 49.99 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.MEDIA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.CIERRE_CAJA, { diferencia: -50 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.CIERRE_CAJA, { diferencia: 120 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
    });

    it('deriva severidad correctamente para filas históricas usando valorNuevo (sin severidad persistida)', () => {
      assert.equal(
        calcularSeveridad(
          ACCIONES_AUDITORIA.CIERRE_CAJA,
          { valorNuevo: { diferencia: -65.25 } },
          UMBRALES_TEST,
        ),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(
          ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
          { valorNuevo: { monto: 750 } },
          UMBRALES_TEST,
        ),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(
          ACCIONES_AUDITORIA.REGISTRO_MERMA,
          { valorNuevo: { costoEstimado: 120 } },
          UMBRALES_TEST,
        ),
        SEVERIDADES_AUDITORIA.MEDIA,
      );
    });

    it('escala a ALTA por impacto financiero alto (positivo o negativo) solo en acciones de riesgo financiero', () => {
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.MOVIMIENTO_CAJA, { impactoFinanciero: -500 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.REGISTRO_MERMA, { impactoFinanciero: -620.5 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.COMPRA_INVENTARIO, { impactoFinanciero: -1200 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      // Una venta normal alta NO debe escalar a ALTA por monto
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.VENTA_CONFIRMADA, { impactoFinanciero: 2500 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.BAJA,
      );
    });

    it('escala a ALTA cuando las repeticiones en el turno alcanzan el umbral configurado', () => {
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.REIMPRESION_FACTURA, { repeticionesEnTurno: 2 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.MEDIA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.REIMPRESION_FACTURA, { repeticionesEnTurno: 3 }, UMBRALES_TEST),
        SEVERIDADES_AUDITORIA.ALTA,
      );
    });

    it('normaliza códigos de motivo y valida obligatoriedad en acciones críticas', () => {
      assert.equal(normalizarCodigoMotivo('  error_de_captura '), CODIGOS_MOTIVO_AUDITORIA.ERROR_DE_CAPTURA);
      assert.equal(normalizarCodigoMotivo('NO_EXISTE', CODIGOS_MOTIVO_AUDITORIA.OTRO), CODIGOS_MOTIVO_AUDITORIA.OTRO);
      assert.equal(mapearMotivoMermaACodigo('DANO'), CODIGOS_MOTIVO_AUDITORIA.PRODUCTO_DANADO);
      assert.equal(mapearMotivoMermaACodigo('DESCONOCIDO'), CODIGOS_MOTIVO_AUDITORIA.OTRO);

      // Falla si no hay texto ni código válido en acción obligatoria
      assert.throws(
        () => validarMotivoObligatorio(ACCIONES_AUDITORIA.ANULACION_FACTURA, '   ', null),
        (err) => err instanceof BadRequestError && err.statusCode === 400,
      );
      // Pasa con texto o con código válido
      assert.doesNotThrow(() =>
        validarMotivoObligatorio(ACCIONES_AUDITORIA.ANULACION_FACTURA, 'Cliente canceló pedido', null),
      );
      assert.doesNotThrow(() =>
        validarMotivoObligatorio(ACCIONES_AUDITORIA.ANULACION_FACTURA, '', CODIGOS_MOTIVO_AUDITORIA.ERROR_DE_CAPTURA),
      );
      // Acciones sin obligatoriedad no lanzan
      assert.doesNotThrow(() =>
        validarMotivoObligatorio(ACCIONES_AUDITORIA.VENTA_CONFIRMADA, '', null),
      );
    });
  });

  // =========================================================================
  // 2. Sanitización y redacción centralizada de datos sensibles
  // =========================================================================
  describe('AuditService.sanitizeJson y AuditService.sanitizeText', () => {
    it('redacta claves sensibles (anidadas y en arreglos) y preserva banderas seguras como passwordActualizado', () => {
      const limpio = AuditService.sanitizeJson({
        username: 'cajero1',
        password: 'SuperSecret123!',
        passwordHash: '$2a$10$hashfalso',
        passwordActualizado: true,
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
        autorizacion: {
          supervisor: 'admin',
          clave: 'ClaveSupervisor99',
          cvv: '123',
        },
        intentos: [
          { cookie: 'pos_session=abc123', monto: 85.5 },
          { numeroTarjeta: '4532-1111-2222-3333', referencia: 'AUT-991' },
        ],
      });

      assert.equal(limpio.username, 'cajero1');
      assert.equal(limpio.password, REDACTADO);
      assert.equal(limpio.passwordHash, REDACTADO);
      assert.equal(limpio.passwordActualizado, true);
      assert.equal(limpio.accessToken, REDACTADO);
      assert.equal(limpio.autorizacion.supervisor, 'admin');
      assert.equal(limpio.autorizacion.clave, REDACTADO);
      assert.equal(limpio.autorizacion.cvv, REDACTADO);
      assert.equal(limpio.intentos[0].cookie, REDACTADO);
      assert.equal(limpio.intentos[0].monto, 85.5);
      assert.equal(limpio.intentos[1].numeroTarjeta, REDACTADO);
      assert.equal(limpio.intentos[1].referencia, 'AUT-991');
    });

    it('redacta tokens Bearer y números de tarjeta PAN dentro de textos libres sin dañar NITs ni montos', () => {
      const texto = AuditService.sanitizeText(
        'Header Bearer eyJhbGciOiJIUzI1NiJ9.abc.def con tarjeta 4532 1234 5678 9012 NIT 10482931-4 total Q250.00',
      );
      assert.ok(texto.includes(`Bearer ${REDACTADO}`));
      assert.ok(!texto.includes('eyJhbGci'));
      assert.ok(!texto.includes('4532 1234'));
      assert.ok(texto.includes('NIT 10482931-4'));
      assert.ok(texto.includes('Q250.00'));
    });

    it('maneja referencias circulares, BigInt, Date y vacíos de forma segura', () => {
      const circular = { nombre: 'test', idBig: 1234567890123456789n, fecha: new Date('2026-11-23T12:00:00.000Z') };
      circular.self = circular;

      const limpio = AuditService.sanitizeJson(circular);
      assert.equal(limpio.idBig, '1234567890123456789');
      assert.equal(limpio.fecha, '2026-11-23T12:00:00.000Z');
      assert.equal(limpio.self, '[CIRCULAR]');
      assert.equal(AuditService.sanitizeJson(null), null);
      assert.equal(AuditService.sanitizeText('   '), null);
    });
  });

  // =========================================================================
  // 3. Constructor único de filtros SQL/Sequelize y protección CSV
  // =========================================================================
  describe('construirFiltrosAuditoria y escaparCeldaCsv', () => {
    it('excluye GESTION_NOMINA cuando conNomina=false y la incluye cuando conNomina=true', () => {
      const sinNomina = construirFiltrosAuditoria(1, {}, false);
      assert.match(sinNomina.sqlWhere, /a\."accion" <> :accionNomina/);
      assert.equal(sinNomina.replacements.accionNomina, ACCIONES_AUDITORIA.GESTION_NOMINA);
      assert.ok(
        sinNomina.whereSequelize[Op.and].some(
          (c) => c.accion && c.accion[Op.ne] === ACCIONES_AUDITORIA.GESTION_NOMINA,
        ),
      );

      const conNomina = construirFiltrosAuditoria(1, {}, true);
      assert.ok(!conNomina.sqlWhere.includes('accionNomina'));
      assert.equal(conNomina.replacements.accionNomina, undefined);
    });

    it('aplica rango de fechas en America/Guatemala (UTC-6) y severidad efectiva para filas históricas', () => {
      const f = construirFiltrosAuditoria(2, {
        fechaDesde: '2026-11-20',
        fechaHasta: '2026-11-20',
        severidad: 'alta',
        aprobadorId: 7,
        cajaSesionId: 12,
      }, false);

      assert.equal(f.replacements.sucursalId, 2);
      assert.equal(f.replacements.aprobadorId, 7);
      assert.equal(f.replacements.cajaSesionId, 12);
      assert.equal(f.replacements.severidad, 'ALTA');
      assert.equal(f.replacements.fechaDesde.toISOString(), '2026-11-20T06:00:00.000Z');
      assert.equal(f.replacements.fechaHasta.toISOString(), '2026-11-21T05:59:59.999Z');
      assert.match(f.sqlWhere, /COALESCE\(/);
      assert.match(expresionSqlSeveridadEfectiva('a'), /a\."severidad"/);
    });

    it('filtra impacto por magnitud ABS cuando los límites son >= 0 y con signo cuando alguno es negativo', () => {
      const magnitud = construirFiltrosAuditoria(1, { impactoMin: '100', impactoMax: '500' }, false);
      assert.match(magnitud.sqlWhere, /ABS\(a\."impacto_financiero"\) >= :impactoMin/);
      assert.match(magnitud.sqlWhere, /ABS\(a\."impacto_financiero"\) <= :impactoMax/);

      const conSigno = construirFiltrosAuditoria(1, { impactoMin: '-500', impactoMax: '-50' }, false);
      assert.match(conSigno.sqlWhere, /a\."impacto_financiero" >= :impactoMin/);
      assert.match(conSigno.sqlWhere, /a\."impacto_financiero" <= :impactoMax/);
      assert.ok(!conSigno.sqlWhere.includes('ABS('));
    });

    it('escapa celdas CSV contra formula injection sin alterar montos negativos legítimos', () => {
      assert.equal(escaparCeldaCsv('=SUM(A1:A10)'), "'=SUM(A1:A10)");
      assert.equal(escaparCeldaCsv('+1+1'), "'+1+1");
      assert.equal(escaparCeldaCsv('@cmd'), "'@cmd");
      assert.equal(escaparCeldaCsv('-cmd|calc'), "'-cmd|calc");
      // Números negativos contables se conservan intactos
      assert.equal(escaparCeldaCsv('-85.00'), '-85.00');
      assert.equal(escaparCeldaCsv(-125.5), '-125.5');
      // Comas, comillas y saltos de línea se envuelven en comillas dobles
      assert.equal(escaparCeldaCsv('Hola, "mundo"'), '"Hola, ""mundo"""');
      assert.equal(escaparCeldaCsv('Línea 1\nLínea 2'), '"Línea 1\nLínea 2"');
      assert.equal(escaparCeldaCsv(null), '');
    });
  });
});
