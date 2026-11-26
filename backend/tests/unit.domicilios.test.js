const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { ACCIONES_AUDITORIA, SEVERIDADES_AUDITORIA } = require('../src/config/constants');
const { env } = require('../src/config/env');
const { requireFeature } = require('../src/middlewares/featureFlag');
const { EstadoComanda, EstadoPedidoDomicilio, ModalidadPagoDomicilio } = require('../src/models/enums');
const {
  calcularVencimientoTracking,
  esPendienteDeLiquidar,
  esTransicionValida,
  mapearEstadoComanda,
  requiereMermaAlCerrar,
  validarPermisoTransicion,
} = require('../src/services/domicilios-estados');
const { ForbiddenError } = require('../src/shared/errors/AppError');
const { sanitizarUrlParaLog } = require('../src/shared/logger');
const { AuditService, REDACTADO } = require('../src/shared/services/audit.service');
const { verificarCaptcha } = require('../src/shared/services/captcha.service');
const {
  MENSAJE_RECHAZO_ANTI_ABUSO,
  normalizarDireccion,
  obtenerMetricasRechazosPublicos,
  reiniciarMetricasRechazosPublicos,
  validarProteccionesPreviasPublicas,
} = require('../src/shared/services/public-orders-guard.service');
const { calcularSeveridad } = require('../src/shared/utils/auditoriaSeveridad');
const {
  enmascararDireccion,
  enmascararTelefono,
  normalizarTelefono,
  puedeVerDatosContacto,
} = require('../src/shared/utils/privacidadDomicilio');

const { NUEVO, EN_PREPARACION, LISTO, EN_RUTA, ENTREGADO, CANCELADO, FALLIDO } = EstadoPedidoDomicilio;

describe('Pruebas unitarias del módulo Servicio a Domicilio (sin base de datos)', () => {
  describe('Máquina de estados y transiciones válidas', () => {
    it('acepta únicamente el flujo lineal y salidas permitidas', () => {
      assert.equal(esTransicionValida(NUEVO, EN_PREPARACION), true);
      assert.equal(esTransicionValida(NUEVO, CANCELADO), true);
      assert.equal(esTransicionValida(EN_PREPARACION, LISTO), true);
      assert.equal(esTransicionValida(EN_PREPARACION, CANCELADO), true);
      assert.equal(esTransicionValida(LISTO, EN_RUTA), true);
      assert.equal(esTransicionValida(LISTO, CANCELADO), true);
      assert.equal(esTransicionValida(EN_RUTA, ENTREGADO), true);
      assert.equal(esTransicionValida(EN_RUTA, FALLIDO), true);

      // Transiciones prohibidas
      assert.equal(esTransicionValida(NUEVO, LISTO), false);
      assert.equal(esTransicionValida(NUEVO, ENTREGADO), false);
      assert.equal(esTransicionValida(EN_RUTA, CANCELADO), false);
      assert.equal(esTransicionValida(LISTO, FALLIDO), false);
      assert.equal(esTransicionValida(ENTREGADO, CANCELADO), false);
      assert.equal(esTransicionValida(CANCELADO, NUEVO), false);
      assert.equal(esTransicionValida(FALLIDO, EN_RUTA), false);
    });

    it('sincroniza correctamente el estado de cocina de la comanda (LISTO <-> LISTA)', () => {
      assert.equal(mapearEstadoComanda(NUEVO), EstadoComanda.PENDIENTE);
      assert.equal(mapearEstadoComanda(EN_PREPARACION), EstadoComanda.EN_PREPARACION);
      assert.equal(mapearEstadoComanda(LISTO), EstadoComanda.LISTA);
      assert.equal(mapearEstadoComanda(EN_RUTA), EstadoComanda.ENTREGADA);
      assert.equal(mapearEstadoComanda(ENTREGADO), EstadoComanda.ENTREGADA);
      assert.equal(mapearEstadoComanda(CANCELADO), null);
    });

    it('exige merma automática solo en cancelación tras iniciar preparación o en FALLIDO', () => {
      assert.equal(requiereMermaAlCerrar(NUEVO, CANCELADO), false);
      assert.equal(requiereMermaAlCerrar(EN_PREPARACION, CANCELADO), true);
      assert.equal(requiereMermaAlCerrar(LISTO, CANCELADO), true);
      assert.equal(requiereMermaAlCerrar(EN_RUTA, FALLIDO), true);
      assert.equal(requiereMermaAlCerrar(EN_RUTA, ENTREGADO), false);
    });

    it('identifica exactamente pedidos pendientes de liquidar (ENTREGADO + CONTRA_ENTREGA + sin venta)', () => {
      assert.equal(
        esPendienteDeLiquidar({
          modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
          estado: ENTREGADO,
          ventaId: null,
        }),
        true,
      );
      assert.equal(
        esPendienteDeLiquidar({
          modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
          estado: ENTREGADO,
          ventaId: 42,
        }),
        false,
      );
      assert.equal(
        esPendienteDeLiquidar({
          modalidadPago: ModalidadPagoDomicilio.PREPAGADO,
          estado: ENTREGADO,
          ventaId: null,
        }),
        false,
      );
      assert.equal(
        esPendienteDeLiquidar({
          modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
          estado: EN_RUTA,
          ventaId: null,
        }),
        false,
      );
    });
  });

  describe('Permisos por rol en transiciones (RBAC fino)', () => {
    const pedidoDeRepartidor5 = { id: 10, repartidorId: 5, estado: LISTO };

    it('permite al CHEF únicamente EN_PREPARACION y LISTO', () => {
      const chef = { id: 2, rolCodigo: 'CHEF', permisos: ['domicilios:ver', 'domicilios:actualizar_estado'] };
      assert.doesNotThrow(() => validarPermisoTransicion(chef, pedidoDeRepartidor5, EN_PREPARACION));
      assert.doesNotThrow(() => validarPermisoTransicion(chef, pedidoDeRepartidor5, LISTO));
      assert.throws(() => validarPermisoTransicion(chef, pedidoDeRepartidor5, EN_RUTA), ForbiddenError);
      assert.throws(() => validarPermisoTransicion(chef, pedidoDeRepartidor5, CANCELADO), ForbiddenError);
    });

    it('restringe al REPARTIDOR a sus propios pedidos y solo EN_RUTA, ENTREGADO o FALLIDO', () => {
      const rep5 = {
        id: 5,
        rolCodigo: 'REPARTIDOR',
        permisos: ['domicilios:ver_propios', 'domicilios:actualizar_estado'],
      };
      const rep9 = { ...rep5, id: 9 };

      assert.doesNotThrow(() => validarPermisoTransicion(rep5, pedidoDeRepartidor5, EN_RUTA));
      assert.doesNotThrow(() => validarPermisoTransicion(rep5, pedidoDeRepartidor5, ENTREGADO));
      assert.doesNotThrow(() => validarPermisoTransicion(rep5, pedidoDeRepartidor5, FALLIDO));

      assert.throws(() => validarPermisoTransicion(rep5, pedidoDeRepartidor5, LISTO), ForbiddenError);
      assert.throws(() => validarPermisoTransicion(rep5, pedidoDeRepartidor5, CANCELADO), ForbiddenError);
      assert.throws(() => validarPermisoTransicion(rep9, pedidoDeRepartidor5, EN_RUTA), ForbiddenError);
    });

    it('bloquea al AUDITOR en cualquier transición', () => {
      const auditor = { id: 3, rolCodigo: 'AUDITOR', permisos: ['domicilios:ver'] };
      assert.throws(() => validarPermisoTransicion(auditor, pedidoDeRepartidor5, EN_PREPARACION), ForbiddenError);
      assert.throws(() => validarPermisoTransicion(auditor, pedidoDeRepartidor5, CANCELADO), ForbiddenError);
    });
  });

  describe('Privacidad PII, redacción en logs y auditoría', () => {
    it('normaliza y enmascara teléfonos de Guatemala y direcciones', () => {
      assert.equal(normalizarTelefono('+502 5512-3456'), '55123456');
      assert.equal(normalizarTelefono('5512 3456'), '55123456');
      assert.equal(enmascararTelefono('55123456'), '****3456');
      assert.equal(enmascararTelefono('1234'), '****');
      assert.equal(enmascararDireccion('4a Avenida 12-45 Zona 10'), '[DIRECCION_PROTEGIDA]');
    });

    it('controla visibilidad de contacto para repartidor solo en sus pedidos activos', () => {
      const rep = { id: 5, permisos: ['domicilios:ver_propios'] };
      const cajero = { id: 2, permisos: ['domicilios:ver'] };

      assert.equal(puedeVerDatosContacto(cajero, { repartidorId: 9, estado: ENTREGADO }), true);
      assert.equal(puedeVerDatosContacto(rep, { repartidorId: 5, estado: EN_RUTA }), true);
      assert.equal(puedeVerDatosContacto(rep, { repartidorId: 5, estado: ENTREGADO }), false);
      assert.equal(puedeVerDatosContacto(rep, { repartidorId: 9, estado: EN_RUTA }), false);
    });

    it('redacta teléfono y dirección en AuditService y en URLs de Pino sin dañar referencias de pago', () => {
      const sanitizado = AuditService.sanitizeJson({
        clienteId: 12,
        telefono: '55123456',
        direccion: '4a Av Zona 10',
        direccionEntrega: 'Casa 5',
        referenciaEntrega: 'Portón azul',
        referencia: 'VOUCHER-1234',
      });

      assert.equal(sanitizado.clienteId, 12);
      assert.equal(sanitizado.telefono, REDACTADO);
      assert.equal(sanitizado.direccion, REDACTADO);
      assert.equal(sanitizado.direccionEntrega, REDACTADO);
      assert.equal(sanitizado.referenciaEntrega, REDACTADO);
      assert.equal(sanitizado.referencia, 'VOUCHER-1234');

      assert.equal(
        sanitizarUrlParaLog('/api/v1/domicilios/clientes/buscar?telefono=55123456&page=1'),
        '/api/v1/domicilios/clientes/buscar?telefono=[OCULTO]&page=1',
      );
    });

    it('escala severidad de PEDIDO_DOMICILIO_LIQUIDADO según AUDIT_DIFERENCIA_CAJA_ALTA_Q', () => {
      const umbrales = { impactoAltoQ: 500, diferenciaCajaAltaQ: 50, repeticionUmbral: 3 };
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO, { diferencia: 0 }, umbrales),
        SEVERIDADES_AUDITORIA.BAJA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO, { diferencia: -15 }, umbrales),
        SEVERIDADES_AUDITORIA.MEDIA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO, { diferencia: -50 }, umbrales),
        SEVERIDADES_AUDITORIA.ALTA,
      );
      assert.equal(
        calcularSeveridad(ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO, {}, umbrales),
        SEVERIDADES_AUDITORIA.ALTA,
      );
    });

    it('calcula vencimiento del enlace de seguimiento tras finalizar (TTL) y en pedidos activos olvidados', () => {
      const base = new Date('2026-11-26T12:00:00.000Z');
      // Activo reciente -> vigente y sin fecha fija de expiración aún
      const activo = calcularVencimientoTracking(
        { estado: EN_PREPARACION, createdAt: new Date('2026-11-26T10:00:00.000Z') },
        base,
        24,
      );
      assert.equal(activo.vencido, false);
      assert.equal(activo.expiraEn, null);

      // Entregado hace 10 horas con TTL 24h -> vigente con fecha exacta de vencimiento
      const entregadoVigente = calcularVencimientoTracking(
        { estado: ENTREGADO, entregadoEn: new Date('2026-11-26T02:00:00.000Z') },
        base,
        24,
      );
      assert.equal(entregadoVigente.vencido, false);
      assert.equal(entregadoVigente.expiraEn, '2026-11-27T02:00:00.000Z');

      // Entregado hace 25 horas con TTL 24h -> vencido
      const entregadoVencido = calcularVencimientoTracking(
        { estado: ENTREGADO, entregadoEn: new Date('2026-11-25T11:00:00.000Z') },
        base,
        24,
      );
      assert.equal(entregadoVencido.vencido, true);

      // Pedido LLEVAR puede pasar directo de LISTO a ENTREGADO sin EN_RUTA
      assert.equal(esTransicionValida(LISTO, ENTREGADO, 'LLEVAR'), true);
      assert.equal(esTransicionValida(LISTO, EN_RUTA, 'LLEVAR'), false);
    });

    it('requireFeature exige todas las banderas cuando recibe un arreglo (ENABLE_DELIVERY + ENABLE_PUBLIC_ORDERS)', () => {
      const origDelivery = env.ENABLE_DELIVERY;
      const origPublic = env.ENABLE_PUBLIC_ORDERS;
      const mw = requireFeature(['ENABLE_DELIVERY', 'ENABLE_PUBLIC_ORDERS'], 'Portal apagado');
      const ejecutar = () => {
        let capturado = null;
        mw({}, {}, (err) => {
          capturado = err ?? null;
        });
        return capturado;
      };
      try {
        env.ENABLE_DELIVERY = false;
        env.ENABLE_PUBLIC_ORDERS = true;
        assert.equal(ejecutar()?.statusCode, 404);

        env.ENABLE_DELIVERY = true;
        env.ENABLE_PUBLIC_ORDERS = false;
        assert.equal(ejecutar()?.statusCode, 404);

        env.ENABLE_DELIVERY = true;
        env.ENABLE_PUBLIC_ORDERS = true;
        assert.equal(ejecutar(), null);
      } finally {
        env.ENABLE_DELIVERY = origDelivery;
        env.ENABLE_PUBLIC_ORDERS = origPublic;
      }
    });
  });

  describe('Anti-abuso del portal público (Turnstile, honeypot, tiempo mínimo y métricas)', () => {
    it('normaliza direcciones eliminando espacios extra y mayúsculas de forma consistente con PostgreSQL', () => {
      assert.equal(
        normalizarDireccion('  4a   Avenida 12-45,   Zona 10  '),
        '4a avenida 12-45, zona 10',
      );
      assert.equal(normalizarDireccion(''), '');
    });

    it('verificarCaptcha permite siempre en modo none y falla cerrado en turnstile ante error, timeout o ausencia', async () => {
      const resNone = await verificarCaptcha({ provider: 'none', token: '' });
      assert.equal(resNone.ok, true);

      // Falta secreto -> falla cerrado
      const sinSecreto = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: '',
        token: 'tok-123',
      });
      assert.equal(sinSecreto.ok, false);
      assert.equal(sinSecreto.reason, 'CAPTCHA_NOT_CONFIGURED');

      // Falta token -> falla cerrado
      const sinToken = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: 'sec-test',
        token: '   ',
      });
      assert.equal(sinToken.ok, false);
      assert.equal(sinToken.reason, 'CAPTCHA_TOKEN_MISSING');

      // Respuesta inválida de Cloudflare -> falla cerrado
      const invalido = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: 'sec-test',
        token: 'tok-bad',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
        }),
      });
      assert.equal(invalido.ok, false);
      assert.equal(invalido.reason, 'CAPTCHA_INVALID');

      // Proveedor caído (excepción de red) -> falla cerrado
      const caido = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: 'sec-test',
        token: 'tok-123',
        fetchImpl: async () => {
          throw new Error('ECONNREFUSED');
        },
      });
      assert.equal(caido.ok, false);
      assert.equal(caido.reason, 'CAPTCHA_PROVIDER_ERROR');

      // Timeout -> falla cerrado
      const timeout = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: 'sec-test',
        token: 'tok-123',
        timeoutMs: 30,
        fetchImpl: async (_url, opts) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      });
      assert.equal(timeout.ok, false);
      assert.equal(timeout.reason, 'CAPTCHA_PROVIDER_TIMEOUT');

      // Respuesta exitosa -> ok
      const valido = await verificarCaptcha({
        provider: 'turnstile',
        secretKey: 'sec-test',
        token: 'tok-ok',
        ip: '203.0.113.10',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({ success: true }),
        }),
      });
      assert.equal(valido.ok, true);
    });

    it('rechaza honeypot lleno y tiempo mínimo no cumplido con respuesta genérica e incrementa métricas', async () => {
      const origMin = env.PUBLIC_ORDERS_MIN_FORM_SECONDS;
      const origProv = env.PUBLIC_ORDERS_CAPTCHA_PROVIDER;
      reiniciarMetricasRechazosPublicos();
      try {
        env.PUBLIC_ORDERS_MIN_FORM_SECONDS = 3;
        env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = 'none';

        await assert.rejects(
          () =>
            validarProteccionesPreviasPublicas(
              { empresaWeb: 'https://bot.example', formIniciadoEn: Date.now() - 10_000 },
              { ipAddress: '127.0.0.1' },
            ),
          (err) => err.statusCode === 429 && err.message === MENSAJE_RECHAZO_ANTI_ABUSO,
        );

        await assert.rejects(
          () =>
            validarProteccionesPreviasPublicas(
              { empresaWeb: '', formIniciadoEn: Date.now() - 500 },
              { ipAddress: '127.0.0.1' },
            ),
          (err) => err.statusCode === 429 && err.message === MENSAJE_RECHAZO_ANTI_ABUSO,
        );

        await assert.doesNotReject(() =>
          validarProteccionesPreviasPublicas(
            { empresaWeb: '', formIniciadoEn: Date.now() - 5000 },
            { ipAddress: '127.0.0.1' },
          ),
        );

        const metricas = obtenerMetricasRechazosPublicos();
        assert.equal(metricas.total, 2);
        assert.equal(metricas.porMotivo.HONEYPOT_TRIGGERED, 1);
        assert.equal(metricas.porMotivo.MIN_FORM_TIME_NOT_MET, 1);
      } finally {
        env.PUBLIC_ORDERS_MIN_FORM_SECONDS = origMin;
        env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = origProv;
      }
    });
  });
});
