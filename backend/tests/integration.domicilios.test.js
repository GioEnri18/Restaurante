const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA, SEVERIDADES_AUDITORIA } = require('../src/config/constants');
const { connectDatabase, disconnectDatabase, sequelize } = require('../src/config/database');
const { env } = require('../src/config/env');
const {
  AuditoriaLog,
  CajaMovimiento,
  Categoria,
  Comanda,
  EstadoComanda,
  EstadoFactura,
  EstadoPedidoDomicilio,
  Factura,
  Ingrediente,
  Merma,
  MetodoPago,
  ModalidadPagoDomicilio,
  PedidoDomicilio,
  PedidoDomicilioHistorial,
  Platillo,
  RecetaIngrediente,
  Rol,
  Sucursal,
  TipoMovimientoCaja,
  Usuario,
} = require('../src/models');
const { createApp } = require('../src/app');
const { CajaService } = require('../src/services/caja.service');
const { DomiciliosService } = require('../src/services/domicilios.service');
const { obtenerPermisosEfectivos } = require('../src/services/permisos.service');
const { ZonasEntregaService } = require('../src/services/zonas-entrega.service');

/**
 * Suite de integración integral del módulo de Servicio a Domicilio (PostgreSQL + API HTTP).
 * - Aislada en su propia sucursal y servidor HTTP efímero (puerto 0) para correr en paralelo con CI.
 * - 100% compatible con `pos_app_rol` (nunca usa DELETE ni DDL).
 */
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-domicilios-suite/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const CLAVE_QA = 'QaDomicilios2026!';

describe('Módulo de Servicio a Domicilio (PostgreSQL + API HTTP)', () => {
  const originalEnableDelivery = env.ENABLE_DELIVERY;
  const originalBloquearCierre = env.DELIVERY_BLOQUEAR_CIERRE_CON_PENDIENTES;

  let ephemeralServer = null;
  let apiBaseUrl = '';
  let sucursal;
  let categoria;
  let ingrediente;
  let platillo;
  let zonaActiva;
  let zonaInactiva;

  let admin;
  let cajero;
  let chef;
  let repartidor1;
  let repartidor2;
  let auditor;

  const usuariosCreados = [];

  function firmarJwt(u) {
    return jwt.sign(
      { sub: u.id, ver: u.tokenVersion, sucursalId: u.sucursalId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
  }

  async function api(method, ruta, token, body) {
    const res = await fetch(`${apiBaseUrl}${ruta}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Requested-With': 'XMLHttpRequest',
        Origin: env.CORS_ORIGIN.split(',')[0].trim(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }

  async function crearUsuario(sufijo, rol) {
    const u = await Usuario.create({
      sucursalId: sucursal.id,
      rolId: rol.id,
      nombreCompleto: `QA Dom ${sufijo} ${RUN_TAG}`,
      username: `qa_dom_${sufijo}_${RUN_TAG}`.toLowerCase(),
      email: `qa_dom_${sufijo}_${RUN_TAG}@pos.local`.toLowerCase(),
      passwordHash: await bcrypt.hash(CLAVE_QA, 8),
      activo: true,
    });
    usuariosCreados.push(u.id);
    const permisos = await obtenerPermisosEfectivos(u.id, rol.id);
    return {
      db: u,
      jwt: firmarJwt(u),
      actor: {
        id: u.id,
        username: u.username,
        nombreCompleto: u.nombreCompleto,
        sucursalId: sucursal.id,
        rolId: rol.id,
        rolCodigo: rol.codigo,
        permisos,
      },
    };
  }

  before(async () => {
    await connectDatabase();

    // Levantamos servidor HTTP efímero propio en puerto 0 para aislar la bandera ENABLE_DELIVERY
    const app = createApp();
    await new Promise((resolve) => {
      ephemeralServer = app.listen(0, '127.0.0.1', () => {
        const { port } = ephemeralServer.address();
        apiBaseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}`;
        resolve();
      });
    });

    sucursal = await Sucursal.create({
      codigo: `QA-DM-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal QA Domicilio ${RUN_TAG}`,
      nit: '10482931-4',
      direccion: 'Zona 10, Ciudad de Guatemala',
      serieFactura: 'DM',
    });

    const [rolAdmin, rolCajero, rolChef, rolRepartidor, rolAuditor] = await Promise.all([
      Rol.findOne({ where: { codigo: env.ADMIN_ROLE_CODE, activo: true } }),
      Rol.findOne({ where: { codigo: 'CAJERO', activo: true } }),
      Rol.findOne({ where: { codigo: 'CHEF', activo: true } }),
      Rol.findOne({ where: { codigo: 'REPARTIDOR', activo: true } }),
      Rol.findOne({ where: { codigo: 'AUDITOR', activo: true } }),
    ]);

    assert.ok(rolAdmin && rolCajero && rolChef && rolRepartidor && rolAuditor, 'Todos los roles (incluyendo REPARTIDOR y CHEF) deben existir');

    [admin, cajero, chef, repartidor1, repartidor2, auditor] = await Promise.all([
      crearUsuario('adm', rolAdmin),
      crearUsuario('caj', rolCajero),
      crearUsuario('chf', rolChef),
      crearUsuario('rep1', rolRepartidor),
      crearUsuario('rep2', rolRepartidor),
      crearUsuario('aud', rolAuditor),
    ]);

    categoria = await Categoria.create({
      sucursalId: sucursal.id,
      nombre: `Cat Dom ${RUN_TAG}`,
      orden: 1,
    });

    ingrediente = await Ingrediente.create({
      sucursalId: sucursal.id,
      codigo: `ING-DM-${RUN_TAG}`.slice(0, 30),
      nombre: `Carne QA Domicilio ${RUN_TAG}`,
      stockActualOz: 100,
      stockMinimoOz: 10,
      costoPromedioOz: 2.5,
      activo: true,
    });

    platillo = await Platillo.create({
      sucursalId: sucursal.id,
      categoriaId: categoria.id,
      sku: `SKU-DM-${RUN_TAG}`.slice(0, 30),
      nombre: `Churrasco Domicilio ${RUN_TAG}`,
      precioVenta: 80,
      disponible: true,
      activo: true,
    });

    await RecetaIngrediente.create({
      platilloId: platillo.id,
      ingredienteId: ingrediente.id,
      cantidadOz: 8,
    });

    // Abrir turno de caja inicial en la sucursal aislada
    await CajaService.abrirCaja(admin.actor, { montoInicial: 500, observaciones: 'Turno QA domicilio' }, CLIENT_META);
  });

  after(async () => {
    env.ENABLE_DELIVERY = originalEnableDelivery;
    env.DELIVERY_BLOQUEAR_CIERRE_CON_PENDIENTES = originalBloquearCierre;
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(resolve));
    }
    if (usuariosCreados.length > 0) {
      await Usuario.update({ activo: false }, { where: { id: usuariosCreados } }).catch(() => {});
    }
    if (sucursal) {
      await Sucursal.update({ activa: false }, { where: { id: sucursal.id } }).catch(() => {});
    }
    await disconnectDatabase();
  });

  it('bloquea todas las rutas de /domicilios con 404 cuando ENABLE_DELIVERY=false y habilita al activar', async () => {
    env.ENABLE_DELIVERY = false;
    const bloqueado = await api('GET', '/domicilios/zonas', admin.jwt);
    assert.equal(bloqueado.status, 404);

    env.ENABLE_DELIVERY = true;
    env.DELIVERY_BLOQUEAR_CIERRE_CON_PENDIENTES = true;

    const z1 = await api('POST', '/domicilios/zonas', admin.jwt, {
      nombre: `Zona 10 ${RUN_TAG}`,
      descripcion: 'Cobertura principal',
      costoEnvio: 15,
      tiempoEstimadoMin: 25,
      pedidoMinimo: 50,
    });
    assert.equal(z1.status, 201);
    zonaActiva = z1.body.data;
    assert.equal(zonaActiva.costoEnvio, 15);

    // Zona duplicada -> 409
    const dup = await api('POST', '/domicilios/zonas', admin.jwt, {
      nombre: `zona 10 ${RUN_TAG}`,
      costoEnvio: 20,
      tiempoEstimadoMin: 30,
      pedidoMinimo: 40,
    });
    assert.equal(dup.status, 409);

    zonaInactiva = await ZonasEntregaService.crear(
      admin.actor,
      { nombre: `Zona Inactiva ${RUN_TAG}`, costoEnvio: 30, tiempoEstimadoMin: 45, pedidoMinimo: 100, activa: false },
      CLIENT_META,
    );

    // Auditor no puede configurar zonas -> 403
    const audZona = await api('POST', '/domicilios/zonas', auditor.jwt, {
      nombre: 'Zona Prohibida',
      costoEnvio: 10,
      tiempoEstimadoMin: 20,
      pedidoMinimo: 0,
    });
    assert.equal(audZona.status, 403);
  });

  it('valida zona activa y pedido mínimo, y ejecuta flujo PREPAGADO idempotente con auditoría sin PII', async () => {
    const stockAntes = Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz);

    // Zona inactiva -> 400
    const resInactiva = await api('POST', '/domicilios/pedidos', cajero.jwt, {
      idempotencyKey: crypto.randomUUID(),
      zonaEntregaId: zonaInactiva.id,
      modalidadPago: ModalidadPagoDomicilio.PREPAGADO,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibido: 200,
      cliente: { nombre: 'Cliente Prueba', telefono: '5511-2233' },
      direccionNueva: { direccion: '5a Av 10-20 Zona 10' },
      items: [{ platilloId: platillo.id, cantidad: 2 }],
    });
    assert.equal(resInactiva.status, 400);

    // Pedido prepagado válido (1 churrasco Q80 + envío Q15 = Q95, descuenta 8 oz)
    const idemKey = crypto.randomUUID();
    const payloadPrepago = {
      idempotencyKey: idemKey,
      zonaEntregaId: zonaActiva.id,
      modalidadPago: ModalidadPagoDomicilio.PREPAGADO,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibido: 100,
      cliente: { nombre: 'Ana Morales', telefono: '+502 5544-8899', nit: '123456-7' },
      direccionNueva: { alias: 'Casa', direccion: '4a Calle 8-12 Zona 10', referencia: 'Portón negro' },
      items: [{ platilloId: platillo.id, cantidad: 1 }],
    };

    const creado = await api('POST', '/domicilios/pedidos', cajero.jwt, payloadPrepago);
    assert.equal(creado.status, 201);
    const pedido = creado.body.data.pedido;
    assert.equal(pedido.modalidadPago, ModalidadPagoDomicilio.PREPAGADO);
    assert.equal(pedido.subtotalPlatillos, 80);
    assert.equal(pedido.costoEnvio, 15);
    assert.equal(pedido.total, 95);
    assert.ok(pedido.ventaId, 'PREPAGADO debe generar venta inmediatamente');
    assert.equal(Number(creado.body.data.ticket.factura.costoEnvio), 15);
    assert.equal(Number(creado.body.data.ticket.factura.total), 95);

    // Reintento idempotente con misma clave y payload -> devuelve mismo pedido sin duplicar cobro
    const reintento = await api('POST', '/domicilios/pedidos', cajero.jwt, payloadPrepago);
    assert.equal(reintento.status, 201);
    assert.equal(reintento.body.data.pedido.id, pedido.id);

    // Misma clave con payload distinto -> 409
    const colision = await api('POST', '/domicilios/pedidos', cajero.jwt, {
      ...payloadPrepago,
      items: [{ platilloId: platillo.id, cantidad: 2 }],
    });
    assert.equal(colision.status, 409);

    const stockDespues = Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz);
    assert.equal(stockDespues, stockAntes - 8);

    // Verificar privacidad PII en auditoria_logs: nunca teléfono ni dirección en claro
    const logsPedido = await AuditoriaLog.findAll({
      where: { sucursalId: sucursal.id, entidad: 'PedidoDomicilio', entidadId: String(pedido.id) },
    });
    assert.ok(logsPedido.length >= 1);
    const serializado = JSON.stringify(logsPedido.map((l) => l.get({ plain: true })));
    assert.ok(!serializado.includes('55448899'), 'Teléfono en claro no debe aparecer en auditoria_logs');
    assert.ok(!serializado.includes('4a Calle 8-12'), 'Dirección en claro no debe aparecer en auditoria_logs');
    assert.ok(serializado.includes('****8899'), 'Debe guardar teléfono enmascarado');

    // Búsqueda de cliente por teléfono devuelve cliente creado con su dirección
    const busqueda = await api('GET', '/domicilios/clientes/buscar?telefono=5544', cajero.jwt);
    assert.equal(busqueda.status, 200);
    assert.equal(busqueda.body.data.length, 1);
    assert.equal(busqueda.body.data[0].telefono, '55448899');
  });

  it('ejecuta ciclo CONTRA_ENTREGA, RBAC por rol, bloqueo de cierre de caja y liquidación con diferencia', async () => {
    const stockAntes = Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz);

    // 1. Crear pedido CONTRA_ENTREGA (no crea venta ni descuenta stock aún)
    const creado = await api('POST', '/domicilios/pedidos', cajero.jwt, {
      idempotencyKey: crypto.randomUUID(),
      zonaEntregaId: zonaActiva.id,
      modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
      metodoPago: MetodoPago.EFECTIVO,
      montoConQuePaga: 100,
      cliente: { nombre: 'Carlos Gómez', telefono: '4433-2211' },
      direccionNueva: { direccion: '12 Calle 5-30 Zona 10', referencia: 'Edificio Gris' },
      items: [{ platilloId: platillo.id, cantidad: 1 }],
    });
    assert.equal(creado.status, 201);
    const pedido = creado.body.data.pedido;
    assert.equal(pedido.ventaId, null);
    assert.equal(pedido.estado, EstadoPedidoDomicilio.NUEVO);
    assert.ok(pedido.comanda, 'CONTRA_ENTREGA debe crear comanda de cocina sin venta');
    const comandaInicialId = pedido.comanda.id;
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), stockAntes);

    // 2. CHEF pasa NUEVO -> EN_PREPARACION -> LISTO y sincroniza comanda (LISTA)
    const rPrep = await api('PATCH', `/domicilios/pedidos/${pedido.id}/estado`, chef.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.EN_PREPARACION,
    });
    assert.equal(rPrep.status, 200);
    const rListo = await api('PATCH', `/domicilios/pedidos/${pedido.id}/estado`, chef.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.LISTO,
    });
    assert.equal(rListo.status, 200);
    const comandaTrasListo = await Comanda.findByPk(comandaInicialId);
    assert.equal(comandaTrasListo.estadoCocina, EstadoComanda.LISTA);

    // CHEF no puede despachar a EN_RUTA -> 403
    const chefRuta = await api('PATCH', `/domicilios/pedidos/${pedido.id}/estado`, chef.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.EN_RUTA,
    });
    assert.equal(chefRuta.status, 403);

    // 3. Asignar repartidor1 y validar aislamiento de repartidor2 (privacidad)
    const rAsig = await api('PATCH', `/domicilios/pedidos/${pedido.id}/asignar`, cajero.jwt, {
      repartidorId: repartidor1.actor.id,
    });
    assert.equal(rAsig.status, 200);

    const rep2Listado = await api('GET', '/domicilios/pedidos', repartidor2.jwt);
    assert.equal(rep2Listado.status, 200);
    assert.equal(rep2Listado.body.data.some((p) => p.id === pedido.id), false);

    const rep2Detalle = await api('GET', `/domicilios/pedidos/${pedido.id}`, repartidor2.jwt);
    assert.equal(rep2Detalle.status, 403);

    // 4. Repartidor1 despacha EN_RUTA -> ENTREGADO
    const rRuta = await api('PATCH', `/domicilios/pedidos/${pedido.id}/estado`, repartidor1.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.EN_RUTA,
    });
    assert.equal(rRuta.status, 200);
    const rEntregado = await api('PATCH', `/domicilios/pedidos/${pedido.id}/estado`, repartidor1.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.ENTREGADO,
    });
    assert.equal(rEntregado.status, 200);
    assert.equal(rEntregado.body.data.pendienteLiquidar, true);

    // 5. Caja muestra 1 pendiente y BLOQUEA el cierre cuando DELIVERY_BLOQUEAR_CIERRE_CON_PENDIENTES=true
    const cajaActual = await CajaService.obtenerCajaActual(sucursal.id, false);
    assert.equal(cajaActual.domiciliosPendientesLiquidar.cantidad, 1);
    assert.equal(cajaActual.domiciliosPendientesLiquidar.montoTotal, 95);

    await assert.rejects(
      () =>
        CajaService.cerrarCaja(
          admin.actor,
          { montoContadoEfectivo: cajaActual.montoEsperadoEfectivo, vouchers: [] },
          CLIENT_META,
        ),
      (err) => err.statusCode === 409 && /pendientes de liquidar/i.test(err.message),
    );

    // 6. Liquidar con faltante de Q10 (repartidor entrega Q85 de Q95)
    const liqKey = crypto.randomUUID();
    const rLiq = await api('POST', `/domicilios/pedidos/${pedido.id}/liquidar`, cajero.jwt, {
      idempotencyKey: liqKey,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibidoRepartidor: 85,
      observaciones: 'Faltante Q10 reconocido por repartidor',
    });
    assert.equal(rLiq.status, 200);
    assert.equal(rLiq.body.data.diferenciaLiquidacion, -10);
    assert.ok(rLiq.body.data.pedido.ventaId);

    // Comanda original fue reutilizada (vinculada a ventaId sin crear otra)
    const comandaFinal = await Comanda.findByPk(comandaInicialId);
    assert.equal(comandaFinal.ventaId, rLiq.body.data.pedido.ventaId);

    // Stock descontado exactamente una vez (8 oz)
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), stockAntes - 8);

    // Movimiento de diferencia de repartidor en caja y auditoría MEDIA (10 < 50)
    const movDiff = await CajaMovimiento.findOne({
      where: {
        sucursalId: sucursal.id,
        ventaId: rLiq.body.data.pedido.ventaId,
        tipo: TipoMovimientoCaja.EGRESO_DIFERENCIA_REPARTIDOR,
      },
    });
    assert.ok(movDiff);
    assert.equal(Number(movDiff.monto), 10);

    const logLiq = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO,
        entidadId: String(pedido.id),
      },
    });
    assert.ok(logLiq);
    assert.equal(logLiq.severidad, SEVERIDADES_AUDITORIA.MEDIA);

    // Doble liquidación con distinta clave -> 409; misma clave -> idempotente 200
    const dobleLiq = await api('POST', `/domicilios/pedidos/${pedido.id}/liquidar`, cajero.jwt, {
      idempotencyKey: crypto.randomUUID(),
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibidoRepartidor: 95,
    });
    assert.equal(dobleLiq.status, 409);

    const idemLiq = await api('POST', `/domicilios/pedidos/${pedido.id}/liquidar`, cajero.jwt, {
      idempotencyKey: liqKey,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibidoRepartidor: 85,
      observaciones: 'Faltante Q10 reconocido por repartidor',
    });
    assert.equal(idemLiq.status, 200);

    // Historial completo registrado (5 estados)
    const historial = await PedidoDomicilioHistorial.findAll({
      where: { pedidoDomicilioId: pedido.id },
      order: [['id', 'ASC']],
    });
    assert.equal(historial.length, 5);
  });

  it('garantiza bloqueo optimista ante transiciones concurrentes, cancelación sin merma en NUEVO y FALLIDO PREPAGADO con supervisor + merma', async () => {
    // 1. Cancelación en NUEVO (CONTRA_ENTREGA) -> NO genera merma
    const pNuevo = await DomiciliosService.crearPedido(
      cajero.actor,
      {
        idempotencyKey: crypto.randomUUID(),
        zonaEntregaId: zonaActiva.id,
        modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
        metodoPago: MetodoPago.EFECTIVO,
        cliente: { nombre: 'Cliente Cancelado', telefono: '5500-9900' },
        direccionNueva: { direccion: '6a Av 1-10 Zona 10' },
        items: [{ platilloId: platillo.id, cantidad: 1 }],
      },
      CLIENT_META,
    );
    const stockAntesCanc = Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz);
    const canceladoNuevo = await DomiciliosService.actualizarEstado(
      cajero.actor,
      pNuevo.pedido.id,
      { estadoNuevo: EstadoPedidoDomicilio.CANCELADO, motivo: 'Cliente canceló de inmediato' },
      CLIENT_META,
    );
    assert.equal(canceladoNuevo.estado, EstadoPedidoDomicilio.CANCELADO);
    assert.equal(canceladoNuevo.mermaGenerada, false);
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), stockAntesCanc);

    // 2. Carrera concurrente (bloqueo optimista): NUEVO -> EN_PREPARACION vs NUEVO -> CANCELADO
    const pCarrera = await DomiciliosService.crearPedido(
      cajero.actor,
      {
        idempotencyKey: crypto.randomUUID(),
        zonaEntregaId: zonaActiva.id,
        modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
        metodoPago: MetodoPago.EFECTIVO,
        cliente: { nombre: 'Cliente Carrera', telefono: '5500-9901' },
        direccionNueva: { direccion: '7a Av 2-20 Zona 10' },
        items: [{ platilloId: platillo.id, cantidad: 1 }],
      },
      CLIENT_META,
    );
    const resultadosCarrera = await Promise.allSettled([
      DomiciliosService.actualizarEstado(
        chef.actor,
        pCarrera.pedido.id,
        { estadoNuevo: EstadoPedidoDomicilio.EN_PREPARACION },
        CLIENT_META,
      ),
      DomiciliosService.actualizarEstado(
        cajero.actor,
        pCarrera.pedido.id,
        { estadoNuevo: EstadoPedidoDomicilio.CANCELADO, motivo: 'Cancelación simultánea' },
        CLIENT_META,
      ),
    ]);
    const ganadoras = resultadosCarrera.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultadosCarrera.filter((r) => r.status === 'rejected');
    assert.equal(ganadoras.length, 1);
    assert.equal(rechazadas.length, 1);
    assert.equal(rechazadas[0].reason.statusCode, 409);

    // 3. PREPAGADO -> EN_RUTA -> FALLIDO con autorización de supervisor:
    // anula factura reintegrando stock + crea merma PEDIDO_NO_ENTREGADO (efecto neto = -8 oz)
    const stockAntesPrep = Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz);
    const pPrep = await DomiciliosService.crearPedido(
      cajero.actor,
      {
        idempotencyKey: crypto.randomUUID(),
        zonaEntregaId: zonaActiva.id,
        modalidadPago: ModalidadPagoDomicilio.PREPAGADO,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 95,
        cliente: { nombre: 'Cliente Fallido', telefono: '5500-9902' },
        direccionNueva: { direccion: '8a Av 3-30 Zona 10' },
        items: [{ platilloId: platillo.id, cantidad: 1 }],
      },
      CLIENT_META,
    );
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), stockAntesPrep - 8);

    await DomiciliosService.asignarRepartidor(cajero.actor, pPrep.pedido.id, repartidor1.actor.id, CLIENT_META);
    await DomiciliosService.actualizarEstado(chef.actor, pPrep.pedido.id, { estadoNuevo: EstadoPedidoDomicilio.EN_PREPARACION }, CLIENT_META);
    await DomiciliosService.actualizarEstado(chef.actor, pPrep.pedido.id, { estadoNuevo: EstadoPedidoDomicilio.LISTO }, CLIENT_META);
    await DomiciliosService.actualizarEstado(repartidor1.actor, pPrep.pedido.id, { estadoNuevo: EstadoPedidoDomicilio.EN_RUTA }, CLIENT_META);

    // Sin credenciales de supervisor (cajero no tiene facturas:anular) -> 400
    const sinSup = await api('PATCH', `/domicilios/pedidos/${pPrep.pedido.id}/estado`, cajero.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.FALLIDO,
      motivo: 'Dirección inexistente y cliente sin respuesta',
    });
    assert.equal(sinSup.status, 400);

    // Con credenciales de supervisor ADMIN -> anula factura + genera merma en la misma transacción
    const conSup = await api('PATCH', `/domicilios/pedidos/${pPrep.pedido.id}/estado`, cajero.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.FALLIDO,
      motivo: 'Dirección inexistente y cliente sin respuesta',
      autorizacionSupervisor: { identifier: admin.actor.username, password: CLAVE_QA },
    });
    assert.equal(conSup.status, 200);
    assert.equal(conSup.body.data.estado, EstadoPedidoDomicilio.FALLIDO);
    assert.equal(conSup.body.data.facturaAnuladaCierre, true);
    assert.equal(conSup.body.data.mermaGenerada, true);

    // Stock neto = stockAntesPrep - 8 (reintegro +8 y merma -8 => sin doble descuento!)
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), stockAntesPrep - 8);

    const facturaAnulada = await Factura.findOne({ where: { ventaId: pPrep.pedido.ventaId } });
    assert.equal(facturaAnulada.estado, EstadoFactura.ANULADA);

    const mermaAuto = await Merma.findOne({ where: { pedidoDomicilioId: pPrep.pedido.id } });
    assert.ok(mermaAuto);
    assert.equal(Number(mermaAuto.cantidadOz), 8);
    assert.equal(Number(mermaAuto.costoEstimado), 20); // 8 oz * Q2.50

    // Verificar misma correlacion_id en auditoría (FALLIDO + ANULACION_FACTURA + REGISTRO_MERMA)
    const logFallido = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO,
        entidadId: String(pPrep.pedido.id),
      },
    });
    assert.ok(logFallido?.correlacionId);
    const logsCorrelacionados = await AuditoriaLog.findAll({
      where: { sucursalId: sucursal.id, correlacionId: logFallido.correlacionId },
    });
    const accionesCorr = new Set(logsCorrelacionados.map((l) => l.accion));
    assert.ok(accionesCorr.has(ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO));
    assert.ok(accionesCorr.has(ACCIONES_AUDITORIA.ANULACION_FACTURA));
    assert.ok(accionesCorr.has(ACCIONES_AUDITORIA.REGISTRO_MERMA));
    const logMerma = logsCorrelacionados.find((l) => l.accion === ACCIONES_AUDITORIA.REGISTRO_MERMA);
    assert.equal(logMerma.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.PEDIDO_NO_ENTREGADO);
  });

  it('permite pedidos desde menú público sin login (Para llevar), seguimiento sin PII, confirmación en POS y liquidación LLEVAR', async () => {
    // 1. Menú público sin JWT (nunca debe exponer costos de receta ni stock real)
    const menuRes = await api('GET', `/public/menu?sucursal=${encodeURIComponent(sucursal.codigo)}`, null);
    assert.equal(menuRes.status, 200);
    assert.equal(menuRes.body.data.sucursal.codigo, sucursal.codigo);
    assert.ok(menuRes.body.data.platillos.some((p) => p.id === platillo.id));
    const platilloPub = menuRes.body.data.platillos.find((p) => p.id === platillo.id);
    assert.equal(platilloPub.costoReceta, undefined);
    assert.equal(platilloPub.receta, undefined);
    assert.equal(platilloPub.stockDisponible, undefined);

    // 2. Crear pedido público PARA LLEVAR (sin dirección ni zona, costo envío Q 0.00)
    const idemPub = crypto.randomUUID();
    const creadoPub = await api('POST', '/public/pedidos', null, {
      idempotencyKey: idemPub,
      codigoSucursal: sucursal.codigo,
      tipoEntrega: 'LLEVAR',
      metodoPagoEsperado: MetodoPago.EFECTIVO,
      cliente: { nombre: 'Sofía Castillo', telefono: '5522-9911', nit: 'CF' },
      items: [{ platilloId: platillo.id, cantidad: 1, notas: 'Bien cocido' }],
      observaciones: 'Paso en 20 min',
    });
    assert.equal(creadoPub.status, 201, `Error crearPedidoPublico: ${JSON.stringify(creadoPub.body)}`);
    const seg = creadoPub.body.data;
    assert.equal(seg.tipoEntrega, 'LLEVAR');
    assert.equal(seg.origen, 'WEB');
    assert.equal(seg.costoEnvio, 0);
    assert.equal(seg.total, 80);
    assert.equal(seg.estado, EstadoPedidoDomicilio.NUEVO);
    assert.ok(seg.trackingToken && seg.trackingToken.length >= 16);

    // 3. Seguimiento público sin JWT y sin PII (nunca teléfono en claro)
    const segRes = await api('GET', `/public/pedidos/${seg.trackingToken}`, null);
    assert.equal(segRes.status, 200);
    assert.equal(segRes.body.data.numeroPedido, seg.numeroPedido);
    assert.ok(!JSON.stringify(segRes.body.data).includes('55229911'), 'Seguimiento público no debe exponer teléfono');

    // 4. Aparece en el tablero del POS con filtro tipoEntrega=LLEVAR&origen=WEB y aún sin comanda
    const tableroWeb = await api('GET', '/domicilios/pedidos?tipoEntrega=LLEVAR&origen=WEB', cajero.jwt);
    assert.equal(tableroWeb.status, 200);
    const pedidoPos = tableroWeb.body.data.find((p) => p.numeroPedido === seg.numeroPedido);
    assert.ok(pedidoPos, 'El pedido web debe aparecer en el tablero POS');
    assert.equal(pedidoPos.comanda, null, 'Pedido web en NUEVO espera confirmación antes de crear comanda');

    // 5. Cajero confirma -> crea Comanda LLEVAR en cocina -> LISTO -> ENTREGADO directo (sin repartidor)
    const rPrep = await api('PATCH', `/domicilios/pedidos/${pedidoPos.id}/estado`, cajero.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.EN_PREPARACION,
    });
    assert.equal(rPrep.status, 200);
    assert.ok(rPrep.body.data.comanda, 'Al confirmar pedido web debe crearse la comanda');

    const rListo = await api('PATCH', `/domicilios/pedidos/${pedidoPos.id}/estado`, chef.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.LISTO,
    });
    assert.equal(rListo.status, 200);

    const rEnt = await api('PATCH', `/domicilios/pedidos/${pedidoPos.id}/estado`, cajero.jwt, {
      estadoNuevo: EstadoPedidoDomicilio.ENTREGADO,
    });
    assert.equal(rEnt.status, 200);

    // 6. Liquidar en caja -> genera venta tipoServicio=LLEVAR y costoEnvio=0
    const rLiq = await api('POST', `/domicilios/pedidos/${pedidoPos.id}/liquidar`, cajero.jwt, {
      idempotencyKey: crypto.randomUUID(),
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibidoRepartidor: 80,
    });
    assert.equal(rLiq.status, 200);
    assert.equal(rLiq.body.data.diferenciaLiquidacion, 0);
    assert.ok(rLiq.body.data.pedido.ventaId);
  });

  it('soporta polling incremental ?desde=, reportes de domicilios y cierre de caja exacto tras liquidar', async () => {
    const lista1 = await api('GET', '/domicilios/pedidos', admin.jwt);
    assert.equal(lista1.status, 200);
    assert.ok(lista1.body.serverTime);

    // Polling inmediato con `desde` = serverTime devuelve 0 cambios
    const listaPoll = await api(
      'GET',
      `/domicilios/pedidos?desde=${encodeURIComponent(lista1.body.serverTime)}`,
      admin.jwt,
    );
    assert.equal(listaPoll.status, 200);
    assert.equal(listaPoll.body.data.length, 0);

    // Reporte analítico de domicilios
    const repDom = await api('GET', '/reportes/domicilios', admin.jwt);
    assert.equal(repDom.status, 200);
    assert.ok(repDom.body.data.kpis.totalPedidos >= 4);
    assert.ok(repDom.body.data.kpis.entregados >= 1);
    assert.ok(repDom.body.data.kpis.fallidos >= 1);
    assert.ok(repDom.body.data.porZona.length >= 1);
    assert.ok(repDom.body.data.porRepartidor.length >= 1);

    // Cierre de caja ahora sí pasa cuadrado exactamente a Q 0.00 de diferencia
    const cajaActual = await CajaService.obtenerCajaActual(sucursal.id, false);
    assert.equal(cajaActual.domiciliosPendientesLiquidar.cantidad, 0);
    const cerrada = await CajaService.cerrarCaja(
      admin.actor,
      { montoContadoEfectivo: cajaActual.montoEsperadoEfectivo, vouchers: [] },
      CLIENT_META,
    );
    assert.equal(cerrada.diferencia, 0);

    // Confirmar integridad de pedido_domicilio_historial y auditoria_logs (conteos intactos)
    const totalPedidosDb = await PedidoDomicilio.count({ where: { sucursalId: sucursal.id } });
    assert.ok(totalPedidosDb >= 4);
    const [okPing] = await sequelize.query('SELECT 1 AS ok');
    assert.equal(okPing[0].ok, 1);
  });
});
