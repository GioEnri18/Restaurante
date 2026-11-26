const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { ACCIONES_AUDITORIA } = require('../src/config/constants');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { env } = require('../src/config/env');
const {
  AuditoriaLog,
  Categoria,
  Cliente,
  EstadoPedidoDomicilio,
  MetodoPago,
  PedidoDomicilio,
  Platillo,
  Rol,
  Sucursal,
  Usuario,
} = require('../src/models');
const { createApp } = require('../src/app');
const { ZonasEntregaService } = require('../src/services/zonas-entrega.service');
const { setCaptchaFetchImpl } = require('../src/shared/services/captcha.service');
const {
  MENSAJE_RECHAZO_ANTI_ABUSO,
  obtenerMetricasRechazosPublicos,
  reiniciarMetricasRechazosPublicos,
} = require('../src/shared/services/public-orders-guard.service');

/**
 * Suite de integración Fase 2: Controles anti-abuso del portal público de pedidos.
 * - Aislada en su propia sucursal y servidor efímero (puerto 0).
 * - Compatible con `pos_app_rol` (nunca ejecuta DELETE ni DDL).
 * - Verifica límites en BD, honeypot, tiempo mínimo, Turnstile (fail-closed),
 *   bloqueo web de clientes por Admin y garantiza 0 filas en `auditoria_logs` por rechazos.
 */
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-anti-abuso/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const CLAVE_QA = 'QaAntiAbuso2026!';

describe('Anti-abuso del portal público de pedidos (PostgreSQL + API HTTP)', () => {
  const envSnapshot = {
    ENABLE_DELIVERY: env.ENABLE_DELIVERY,
    ENABLE_PUBLIC_ORDERS: env.ENABLE_PUBLIC_ORDERS,
    PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO: env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO,
    PUBLIC_ORDERS_VENTANA_PENDIENTES_MIN: env.PUBLIC_ORDERS_VENTANA_PENDIENTES_MIN,
    PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA: env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA,
    PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA: env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA,
    PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL: env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL,
    PUBLIC_ORDERS_MIN_FORM_SECONDS: env.PUBLIC_ORDERS_MIN_FORM_SECONDS,
    PUBLIC_ORDERS_CAPTCHA_PROVIDER: env.PUBLIC_ORDERS_CAPTCHA_PROVIDER,
    TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY,
    PUBLIC_ORDERS_CAPTCHA_TIMEOUT_MS: env.PUBLIC_ORDERS_CAPTCHA_TIMEOUT_MS,
  };

  let ephemeralServer = null;
  let apiBaseUrl = '';
  let sucursal;
  let platillo;
  let zona;
  let admin;
  let cajero;

  async function api(method, path, token, body) {
    const headers = {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: env.CORS_ORIGIN.split(',')[0].trim(),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  }

  function construirPayloadPedido(overrides = {}) {
    return {
      idempotencyKey: crypto.randomUUID(),
      codigoSucursal: sucursal.codigo,
      tipoEntrega: 'DELIVERY',
      zonaEntregaId: zona.id,
      direccion: '6a Avenida 10-25 Zona 10',
      metodoPagoEsperado: MetodoPago.EFECTIVO,
      formIniciadoEn: Date.now() - 10_000,
      empresaWeb: '',
      cliente: {
        nombre: 'Cliente Prueba',
        telefono: '5511-0001',
        nit: 'CF',
      },
      items: [{ platilloId: platillo.id, cantidad: 1 }],
      ...overrides,
    };
  }

  async function crearUsuarioConRol(rolCodigo, sufijo) {
    const rol = await Rol.findOne({ where: { codigo: rolCodigo } });
    assert.ok(rol, `Debe existir el rol ${rolCodigo}`);
    const passwordHash = await bcrypt.hash(CLAVE_QA, 10);
    const usuario = await Usuario.create({
      sucursalId: sucursal.id,
      rolId: rol.id,
      nombreCompleto: `QA ${sufijo} ${RUN_TAG}`,
      username: `qa_ab_${sufijo}_${RUN_TAG}`.toLowerCase(),
      email: `qa_ab_${sufijo}_${RUN_TAG}@pos-qa.gt`.toLowerCase(),
      passwordHash,
      activo: true,
    });
    const token = jwt.sign(
      { sub: usuario.id, ver: usuario.tokenVersion, sucursalId: sucursal.id },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '2h' },
    );
    return {
      usuario,
      jwt: token,
      actor: { id: usuario.id, sucursalId: sucursal.id, rol: { id: rol.id, codigo: rolCodigo } },
    };
  }

  before(async () => {
    await connectDatabase();

    env.ENABLE_DELIVERY = true;
    env.ENABLE_PUBLIC_ORDERS = true;
    env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = 'none';
    env.PUBLIC_ORDERS_MIN_FORM_SECONDS = 3;
    env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO = 2;
    env.PUBLIC_ORDERS_VENTANA_PENDIENTES_MIN = 120;
    env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA = 5;
    env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA = 6;
    env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL = 25;
    reiniciarMetricasRechazosPublicos();

    const app = createApp();
    await new Promise((resolve) => {
      ephemeralServer = app.listen(0, '127.0.0.1', () => {
        const { port } = ephemeralServer.address();
        apiBaseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}`;
        resolve();
      });
    });

    sucursal = await Sucursal.create({
      codigo: `QA-AB-${RUN_TAG}`,
      nombre: `Sucursal Anti-Abuso ${RUN_TAG}`,
      nit: '1234567-8',
      direccion: 'Zona 10, Guatemala',
      serieFactura: `AB${RUN_TAG.slice(-3)}`,
      activa: true,
    });

    admin = await crearUsuarioConRol('ADMIN', 'adm');
    cajero = await crearUsuarioConRol('CAJERO', 'caj');

    const categoria = await Categoria.create({
      sucursalId: sucursal.id,
      nombre: `Cat AntiAbuso ${RUN_TAG}`,
      orden: 1,
      activa: true,
    });

    platillo = await Platillo.create({
      sucursalId: sucursal.id,
      categoriaId: categoria.id,
      sku: `AB-PLT-${RUN_TAG}`,
      nombre: `Combo QA ${RUN_TAG}`,
      precioVenta: 60,
      disponible: true,
      activo: true,
    });

    zona = await ZonasEntregaService.crear(
      admin.actor,
      { nombre: `Zona AB ${RUN_TAG}`, costoEnvio: 10, tiempoEstimadoMin: 25, pedidoMinimo: 40 },
      CLIENT_META,
    );
  });

  after(async () => {
    setCaptchaFetchImpl(null);
    Object.assign(env, envSnapshot);
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(resolve));
    }
    await disconnectDatabase();
  });

  it('rechaza honeypot lleno y tiempo mínimo incumplido con 429 genérico sin crear auditoría', async () => {
    reiniciarMetricasRechazosPublicos();
    const auditAntes = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });

    // Honeypot lleno
    const rHp = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({ empresaWeb: 'https://bot-spam.example' }),
    );
    assert.equal(rHp.status, 429);
    assert.equal(rHp.body.error.code, 'PUBLIC_ORDER_RESTRICTED');
    assert.equal(rHp.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // Tiempo mínimo incumplido (enviado en 0.2s < 3s)
    const rRapido = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({ formIniciadoEn: Date.now() - 200 }),
    );
    assert.equal(rRapido.status, 429);
    assert.equal(rRapido.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // Ninguno de los rechazos debe escribir en auditoria_logs
    const auditDespues = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });
    assert.equal(auditDespues, auditAntes, 'Los rechazos anti-abuso NUNCA deben escribir en auditoria_logs');

    const metricas = obtenerMetricasRechazosPublicos();
    assert.equal(metricas.porMotivo.HONEYPOT_TRIGGERED, 1);
    assert.equal(metricas.porMotivo.MIN_FORM_TIME_NOT_MET, 1);
  });

  it('verifica Turnstile (fail-closed ante token ausente, inválido y proveedor caído) y conserva none', async () => {
    const auditAntes = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });

    try {
      env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = 'turnstile';
      env.TURNSTILE_SECRET_KEY = 'turnstile-secret-qa';

      // 1. Token ausente -> 400 fail-closed
      const rSinToken = await api('POST', '/public/pedidos', null, construirPayloadPedido());
      assert.equal(rSinToken.status, 400);
      assert.equal(rSinToken.body.error.code, 'CAPTCHA_VERIFICATION_FAILED');

      // 2. Token inválido -> 400 fail-closed
      setCaptchaFetchImpl(async () => ({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      }));
      const rInvalido = await api(
        'POST',
        '/public/pedidos',
        null,
        construirPayloadPedido({ captchaToken: 'token-invalido' }),
      );
      assert.equal(rInvalido.status, 400);
      assert.equal(rInvalido.body.error.code, 'CAPTCHA_VERIFICATION_FAILED');

      // 3. Proveedor Cloudflare caído -> 400 fail-closed
      setCaptchaFetchImpl(async () => {
        throw new Error('ECONNRESET');
      });
      const rCaido = await api(
        'POST',
        '/public/pedidos',
        null,
        construirPayloadPedido({ captchaToken: 'token-valido-pero-caido' }),
      );
      assert.equal(rCaido.status, 400);
      assert.equal(rCaido.body.error.code, 'CAPTCHA_VERIFICATION_FAILED');

      // Ningún rechazo de Turnstile debe crear filas de auditoría
      const auditTrasRechazos = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });
      assert.equal(auditTrasRechazos, auditAntes, 'Rechazos de captcha no deben escribir en auditoria_logs');

      // 4. Token válido -> 201
      setCaptchaFetchImpl(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      }));
      const rValido = await api(
        'POST',
        '/public/pedidos',
        null,
        construirPayloadPedido({
          captchaToken: 'token-ok',
          cliente: { nombre: 'Ana Turnstile', telefono: '5511-1001', nit: 'CF' },
          direccion: '1a Calle 1-01 Zona 1',
        }),
      );
      assert.equal(rValido.status, 201, `Esperado 201 con Turnstile válido: ${JSON.stringify(rValido.body)}`);
    } finally {
      setCaptchaFetchImpl(null);
      env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = 'none';
      env.TURNSTILE_SECRET_KEY = undefined;
    }
  });

  it('aplica límites indexados en BD (teléfono pendientes, teléfono/día, dirección/día, global) sin escribir auditoría', async () => {
    env.PUBLIC_ORDERS_CAPTCHA_PROVIDER = 'none';
    env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO = 1;
    env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA = 1;
    env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA = 1;
    env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL = 50;

    // 1. Primer pedido del teléfono 5511-2002 (y dirección "5a Ave 8-10 Zona 4") -> 201
    const rOk1 = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Luis Limite', telefono: '5511-2002', nit: 'CF' },
        direccion: '5a Ave 8-10 Zona 4',
      }),
    );
    assert.equal(rOk1.status, 201);

    const auditAntesRechazos = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });

    // 2. Exceder límite de pendientes por teléfono normalizado (+502 5511 2002) -> 429 genérico
    const rLimPendTel = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Luis Limite', telefono: '+502 5511 2002', nit: 'CF' },
        direccion: 'Otra Calle 99 Zona 9',
      }),
    );
    assert.equal(rLimPendTel.status, 429);
    assert.equal(rLimPendTel.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // 3. Confirmar el pedido anterior (pasa a EN_PREPARACION, ya no es NUEVO) y probar límite diario por teléfono
    const pedido1 = await PedidoDomicilio.findOne({
      where: { sucursalId: sucursal.id, numeroPedido: rOk1.body.data.numeroPedido },
    });
    await PedidoDomicilio.update(
      { estado: EstadoPedidoDomicilio.EN_PREPARACION },
      { where: { id: pedido1.id } },
    );

    const rLimDiaTel = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Luis Limite', telefono: '5511-2002', nit: 'CF' },
        direccion: 'Otra Calle 100 Zona 9',
      }),
    );
    assert.equal(rLimDiaTel.status, 429);
    assert.equal(rLimDiaTel.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // 4. Exceder límite diario por dirección normalizada (teléfono DISTINTO, misma dirección con espacios/mayúsculas)
    const rLimDir = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Otro Cliente', telefono: '5511-3003', nit: 'CF' },
        direccion: '  5A   AVE   8-10   ZONA 4  ',
      }),
    );
    assert.equal(rLimDir.status, 429);
    assert.equal(rLimDir.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // 5. Exceder límite global de pendientes por sucursal (tenemos al menos 1 NUEVO de Ana Turnstile)
    env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL = 1;
    const rLimGlobal = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Cliente Nuevo', telefono: '5511-4004', nit: 'CF' },
        direccion: 'Boulevard Vista Hermosa 12-00',
      }),
    );
    assert.equal(rLimGlobal.status, 429);
    assert.equal(rLimGlobal.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    // Confirmar que ninguno de los 4 rechazos de límites escribió en auditoria_logs
    const auditDespuesRechazos = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });
    assert.equal(
      auditDespuesRechazos,
      auditAntesRechazos,
      'Los rechazos por límites en BD NUNCA deben escribir en auditoria_logs',
    );

    const metricas = obtenerMetricasRechazosPublicos();
    assert.ok(metricas.porMotivo.LIMITE_PENDIENTES_POR_TELEFONO >= 1);
    assert.ok(metricas.porMotivo.LIMITE_POR_TELEFONO_DIA >= 1);
    assert.ok(metricas.porMotivo.LIMITE_POR_DIRECCION_DIA >= 1);
    assert.ok(metricas.porMotivo.LIMITE_GLOBAL_PENDIENTES_SUCURSAL >= 1);
  });

  it('permite a Admin bloquear/desbloquear pedidos web de un cliente (con auditoría) y rechaza con respuesta genérica', async () => {
    env.PUBLIC_ORDERS_MAX_PENDIENTES_POR_TELEFONO = 10;
    env.PUBLIC_ORDERS_MAX_POR_TELEFONO_DIA = 10;
    env.PUBLIC_ORDERS_MAX_POR_DIRECCION_DIA = 10;
    env.PUBLIC_ORDERS_MAX_PENDIENTES_SUCURSAL = 50;

    const cliente = await Cliente.create({
      sucursalId: sucursal.id,
      nombre: 'Cliente Bloqueable',
      telefono: '55115005',
      nit: 'CF',
      activo: true,
    });

    // 1. Cajero sin permiso domicilios:configurar recibe 403
    const rCajero = await api('PATCH', `/domicilios/clientes/${cliente.id}/bloqueo-web`, cajero.jwt, {
      bloqueado: true,
      motivo: 'Intento sin permiso',
    });
    assert.equal(rCajero.status, 403);

    // 2. Admin bloquea al cliente -> 200 y genera auditoría CLIENTE_BLOQUEO_WEB sin teléfono en claro
    const rBloq = await api('PATCH', `/domicilios/clientes/${cliente.id}/bloqueo-web`, admin.jwt, {
      bloqueado: true,
      motivo: 'Pedidos falsos reiterados en portal web',
    });
    assert.equal(rBloq.status, 200);
    assert.equal(rBloq.body.data.bloqueadoPedidosWeb, true);

    const logBloqueo = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.CLIENTE_BLOQUEO_WEB,
        entidadId: String(cliente.id),
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logBloqueo, 'El cambio manual de bloqueo web debe auditarse en auditoria_logs');
    assert.equal(logBloqueo.valorNuevo.bloqueadoPedidosWeb, true);
    assert.ok(
      !JSON.stringify(logBloqueo.valorNuevo).includes('55115005'),
      'La auditoría de bloqueo no debe exponer teléfono en texto plano',
    );

    // 3. Cliente bloqueado intenta pedir -> 429 genérico (sin crear fila de auditoría)
    const auditAntesIntento = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });
    const rRechazado = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Cliente Bloqueable', telefono: '5511-5005', nit: 'CF' },
        direccion: 'Calzada Roosevelt 10-10',
      }),
    );
    assert.equal(rRechazado.status, 429);
    assert.equal(rRechazado.body.error.code, 'PUBLIC_ORDER_RESTRICTED');
    assert.equal(rRechazado.body.error.message, MENSAJE_RECHAZO_ANTI_ABUSO);

    const auditDespuesIntento = await AuditoriaLog.count({ where: { sucursalId: sucursal.id } });
    assert.equal(
      auditDespuesIntento,
      auditAntesIntento,
      'El intento rechazado de un cliente bloqueado NO debe crear filas en auditoria_logs',
    );

    // 4. Admin consulta listado filtrado por soloBloqueados=true
    const rListaBloq = await api('GET', '/domicilios/clientes?soloBloqueados=true', admin.jwt);
    assert.equal(rListaBloq.status, 200);
    assert.ok(rListaBloq.body.data.some((c) => c.id === cliente.id && c.bloqueadoPedidosWeb === true));

    // 5. Admin desbloquea -> el cliente puede pedir nuevamente
    const rDesbloq = await api('PATCH', `/domicilios/clientes/${cliente.id}/bloqueo-web`, admin.jwt, {
      bloqueado: false,
      motivo: 'Cliente aclaró situación con administración',
    });
    assert.equal(rDesbloq.status, 200);
    assert.equal(rDesbloq.body.data.bloqueadoPedidosWeb, false);

    const rPermitido = await api(
      'POST',
      '/public/pedidos',
      null,
      construirPayloadPedido({
        cliente: { nombre: 'Cliente Bloqueable', telefono: '5511-5005', nit: 'CF' },
        direccion: 'Calzada Roosevelt 10-10',
      }),
    );
    assert.equal(rPermitido.status, 201);
  });
});
