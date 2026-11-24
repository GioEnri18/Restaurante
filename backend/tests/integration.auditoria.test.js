const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  connectDatabase,
  disconnectDatabase,
  sequelize,
  withTransaction,
} = require('../src/config/database');
const {
  ACCIONES_AUDITORIA,
  CODIGOS_MOTIVO_AUDITORIA,
  SEVERIDADES_AUDITORIA,
} = require('../src/config/constants');
const { env } = require('../src/config/env');
const {
  AuditoriaLog,
  CajaSesion,
  Categoria,
  EstadoCaja,
  Ingrediente,
  MetodoPago,
  MotivoMerma,
  Permiso,
  Platillo,
  Rol,
  Sucursal,
  TipoServicio,
  UnidadMedida,
  Usuario,
  UsuarioPermiso,
} = require('../src/models');
const { createApp } = require('../src/app');
const { obtenerPermisosEfectivos } = require('../src/services/permisos.service');
const { AuthService } = require('../src/services/auth.service');
const { CajaService } = require('../src/services/caja.service');
const { FacturasService } = require('../src/services/facturas.service');
const { InventarioService } = require('../src/services/inventario.service');
const { MermasService } = require('../src/services/mermas.service');
const { VentasService } = require('../src/services/ventas.service');
const { AuditService } = require('../src/shared/services/audit.service');
const { toIsoDateInTimezone } = require('../src/shared/utils/dates');

/**
 * Pruebas de integración del módulo de Auditoría de investigación (PostgreSQL + API HTTP).
 * - Usa una sucursal propia aislada para correr en paralelo con las demás suites sin colisiones.
 * - Compatible con `pos_app_rol` (nunca ejecuta DELETE sobre tablas protegidas ni DDL).
 */
const API_BASE_URL = `http://localhost:${env.PORT}${env.API_PREFIX}`;
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-auditoria-suite/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const CLAVE_QA = 'QaAuditoria2026!';

describe('Módulo de Auditoría de investigación (PostgreSQL + API HTTP)', () => {
  let apiBaseUrl = API_BASE_URL;
  let ephemeralServer = null;
  let sucursal;
  let categoria;
  let ingrediente;
  let platillo;

  let adminActor;
  let adminJwt;
  let auditorActor;
  let auditorJwt;
  let cajeroActor;
  let cajeroJwt;
  let meseroJwt;
  let chefJwt;
  let auditorSinExportJwt;

  let rolChefTemporalId = null;
  const usuariosTemporalesIds = [];

  function firmarJwt(usuarioDb) {
    return jwt.sign(
      { sub: usuarioDb.id, ver: usuarioDb.tokenVersion, sucursalId: usuarioDb.sucursalId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
  }

  async function apiGet(ruta, token) {
    const response = await fetch(`${apiBaseUrl}${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text();
    return { status: response.status, contentType, body, headers: response.headers };
  }

  async function crearUsuarioConRol(sufijo, rol) {
    const u = await Usuario.create({
      sucursalId: sucursal.id,
      rolId: rol.id,
      nombreCompleto: `QA Auditoria ${sufijo} ${RUN_TAG}`,
      username: `qa_aud_${sufijo}_${RUN_TAG}`.toLowerCase(),
      email: `qa_aud_${sufijo}_${RUN_TAG}@pos.local`.toLowerCase(),
      passwordHash: await bcrypt.hash(CLAVE_QA, 8),
      activo: true,
    });
    usuariosTemporalesIds.push(u.id);
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

    // Si no hay un servidor levantado en env.PORT (ejecución local aislada), levantamos uno efímero
    let apiDisponible = false;
    try {
      const probe = await fetch(`${API_BASE_URL}/health/ready`);
      apiDisponible = probe.ok;
    } catch {
      apiDisponible = false;
    }
    if (!apiDisponible) {
      const app = createApp();
      await new Promise((resolve) => {
        ephemeralServer = app.listen(0, '127.0.0.1', () => {
          const { port } = ephemeralServer.address();
          apiBaseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}`;
          resolve();
        });
      });
    }

    sucursal = await Sucursal.create({
      codigo: `QA-AU-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal QA Auditoría ${RUN_TAG}`,
      nit: 'CF',
      direccion: 'Sucursal aislada para pruebas de auditoría',
      serieFactura: 'QA',
    });

    const [rolAdmin, rolAuditor, rolCajero, rolMesero] = await Promise.all([
      Rol.findOne({ where: { codigo: env.ADMIN_ROLE_CODE, activo: true } }),
      Rol.findOne({ where: { codigo: 'AUDITOR', activo: true } }),
      Rol.findOne({ where: { codigo: 'CAJERO', activo: true } }),
      Rol.findOne({ where: { codigo: 'MESERO', activo: true } }),
    ]);
    assert.ok(rolAdmin && rolAuditor && rolCajero && rolMesero, 'Los roles base deben existir (npm run db:seed)');

    let rolChef = await Rol.findOne({ where: { codigo: 'CHEF', activo: true } });
    if (!rolChef) {
      rolChef = await Rol.create({
        codigo: `CHEF_${RUN_TAG}`.slice(0, 30),
        nombre: `Chef QA ${RUN_TAG}`,
        descripcion: 'Rol temporal de cocina sin permisos de auditoría',
        vistaInicial: '/mermas',
        esSistema: false,
        activo: true,
      });
      rolChefTemporalId = rolChef.id;
    }

    const [admin, auditor, cajero, mesero, chef, auditorSinExport] = await Promise.all([
      crearUsuarioConRol('admin', rolAdmin),
      crearUsuarioConRol('auditor', rolAuditor),
      crearUsuarioConRol('cajero', rolCajero),
      crearUsuarioConRol('mesero', rolMesero),
      crearUsuarioConRol('chef', rolChef),
      crearUsuarioConRol('audnoexp', rolAuditor),
    ]);

    // Revocar únicamente auditoria:exportar en auditorSinExport
    const permisoExportar = await Permiso.findOne({ where: { codigo: 'auditoria:exportar' } });
    assert.ok(permisoExportar, 'El permiso auditoria:exportar debe existir tras migración');
    await UsuarioPermiso.create({
      usuarioId: auditorSinExport.db.id,
      permisoId: permisoExportar.id,
      permitido: false,
    });

    adminActor = admin.actor;
    adminJwt = admin.jwt;
    auditorActor = auditor.actor;
    auditorJwt = auditor.jwt;
    cajeroActor = cajero.actor;
    cajeroJwt = cajero.jwt;
    meseroJwt = mesero.jwt;
    chefJwt = chef.jwt;
    auditorSinExportJwt = auditorSinExport.jwt;

    categoria = await Categoria.create({
      sucursalId: sucursal.id,
      nombre: `Cat QA Auditoría ${RUN_TAG}`,
    });

    ingrediente = await InventarioService.crearIngrediente(
      adminActor,
      {
        codigo: `QAA-ING-${RUN_TAG}`.slice(0, 30),
        nombre: `Ingrediente QA Auditoría ${RUN_TAG}`,
        stockMinimo: 2,
        unidadStockMinimo: UnidadMedida.oz,
        stockInicial: 200,
        unidadStockInicial: UnidadMedida.oz,
        precioPorLb: 32, // Q2.00/oz
      },
      CLIENT_META,
    );

    platillo = await VentasService.crearPlatillo(
      adminActor,
      {
        categoriaId: categoria.id,
        sku: `QAA-PLT-${RUN_TAG}`.slice(0, 30),
        nombre: `Platillo QA Auditoría ${RUN_TAG}`,
        precioVenta: 50,
        disponible: true,
        receta: [{ ingredienteId: ingrediente.id, cantidadOz: 2 }],
      },
      CLIENT_META,
    );
  });

  after(async () => {
    if (sucursal) {
      await CajaSesion.update(
        { estado: EstadoCaja.CERRADA, fechaCierre: new Date() },
        { where: { sucursalId: sucursal.id, estado: EstadoCaja.ABIERTA } },
      );
      await Platillo.update({ activo: false, disponible: false }, { where: { sucursalId: sucursal.id } });
      await Ingrediente.update({ activo: false }, { where: { sucursalId: sucursal.id } });
      await Sucursal.update({ activa: false }, { where: { id: sucursal.id } });
    }
    if (usuariosTemporalesIds.length) {
      await Usuario.update({ activo: false }, { where: { id: usuariosTemporalesIds } });
    }
    if (rolChefTemporalId) {
      await Rol.update({ activo: false }, { where: { id: rolChefTemporalId } });
    }
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(() => resolve()));
    }
    await disconnectDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. Instrumentación completa, contexto, correlación, rollback e inmutabilidad
  // ---------------------------------------------------------------------------
  it('registra contexto completo, impacto financiero, aprobador, severidad y correlacion_id en eventos críticos', async () => {
    // 1. Apertura de caja del cajero autorizada por el auditor (control dual real)
    const sesion = await CajaService.abrirCaja(
      cajeroActor,
      {
        montoInicial: 1000,
        autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
      },
      CLIENT_META,
    );

    const logApertura = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id, accion: ACCIONES_AUDITORIA.APERTURA_CAJA, cajaSesionId: sesion.id },
      order: [['id', 'DESC']],
    });
    assert.ok(logApertura, 'Debe registrar APERTURA_CAJA');
    assert.equal(logApertura.actorRolCodigo, 'CAJERO');
    assert.equal(logApertura.aprobadorId, auditorActor.id);
    assert.equal(logApertura.cajaSesionId, sesion.id);
    assert.equal(logApertura.severidad, SEVERIDADES_AUDITORIA.BAJA);
    assert.equal(logApertura.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.AUTORIZACION_SUPERVISOR);

    // 2. Egreso manual alto (Q600 >= AUDIT_IMPACTO_ALTO_Q) -> severidad ALTA e impacto negativo
    await CajaService.registrarMovimiento(
      adminActor,
      {
        tipo: 'EGRESO_MANUAL',
        metodoPago: MetodoPago.EFECTIVO,
        monto: 600,
        descripcion: 'Pago a proveedor de emergencia',
        codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.OTRO,
      },
      CLIENT_META,
    );
    const logEgreso = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id, accion: ACCIONES_AUDITORIA.MOVIMIENTO_CAJA, cajaSesionId: sesion.id },
      order: [['id', 'DESC']],
    });
    assert.ok(logEgreso, 'Debe registrar MOVIMIENTO_CAJA');
    assert.equal(logEgreso.severidad, SEVERIDADES_AUDITORIA.ALTA);
    assert.equal(Number(logEgreso.impactoFinanciero), -600);
    assert.equal(logEgreso.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.OTRO);

    // 3. Venta + Anulación con reintegro de stock -> mismo correlacion_id entre anulación, caja e inventario
    const venta = await VentasService.confirmarVenta(
      cajeroActor,
      {
        idempotencyKey: crypto.randomUUID(),
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 100,
        items: [{ platilloId: platillo.id, cantidad: 2 }], // Q100.00
      },
      CLIENT_META,
    );

    // Reimpresión x3 del mismo cajero en el turno -> la 3ra escala a ALTA por repetición
    await FacturasService.reimprimir(cajeroActor, venta.factura.id, CLIENT_META);
    await FacturasService.reimprimir(cajeroActor, venta.factura.id, CLIENT_META);
    await FacturasService.reimprimir(cajeroActor, venta.factura.id, CLIENT_META);
    const reimpresiones = await AuditoriaLog.findAll({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.REIMPRESION_FACTURA,
        entidadId: String(venta.factura.id),
      },
      order: [['id', 'ASC']],
    });
    assert.equal(reimpresiones.length, 3);
    assert.equal(reimpresiones[0].severidad, SEVERIDADES_AUDITORIA.MEDIA);
    assert.equal(reimpresiones[2].severidad, SEVERIDADES_AUDITORIA.ALTA);

    // Anular factura (con reintegro de inventario)
    await FacturasService.anular(
      adminActor,
      venta.factura.id,
      {
        motivo: 'Error de digitación en pedido',
        codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.ERROR_DE_CAPTURA,
        reintegrarInventario: true,
      },
      CLIENT_META,
    );
    const logAnulacion = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
        entidadId: String(venta.factura.id),
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logAnulacion, 'Debe registrar ANULACION_FACTURA');
    assert.equal(logAnulacion.severidad, SEVERIDADES_AUDITORIA.ALTA);
    assert.equal(Number(logAnulacion.impactoFinanciero), -100);
    assert.equal(logAnulacion.cajaSesionId, sesion.id);
    assert.equal(logAnulacion.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.ERROR_DE_CAPTURA);
    assert.ok(logAnulacion.correlacionId, 'La anulación debe asignar correlacion_id');
    assert.ok(logAnulacion.valorNuevo.cajaMovimientoId, 'Debe vincular el movimiento de egreso en caja');
    assert.equal(logAnulacion.valorNuevo.ingredientesReintegrados, 1);

    // 4. Merma + cambio simultáneo de precio y disponibilidad de platillo (eventos correlacionados)
    await MermasService.registrar(
      adminActor,
      {
        ingredienteId: ingrediente.id,
        cantidad: 5,
        unidad: UnidadMedida.oz,
        motivo: MotivoMerma.DANO,
        observacion: 'Producto golpeado en cocina',
      },
      CLIENT_META,
    );
    const logMerma = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id, accion: ACCIONES_AUDITORIA.REGISTRO_MERMA },
      order: [['id', 'DESC']],
    });
    assert.ok(logMerma);
    assert.equal(Number(logMerma.impactoFinanciero), -10); // 5 oz * Q2/oz
    assert.equal(logMerma.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.PRODUCTO_DANADO);

    await VentasService.actualizarPlatillo(
      adminActor,
      platillo.id,
      { precioVenta: 55, disponible: false },
      CLIENT_META,
    );
    const logDisp = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.CAMBIO_DISPONIBILIDAD_PLATILLO,
        entidadId: String(platillo.id),
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logDisp, 'Debe registrar CAMBIO_DISPONIBILIDAD_PLATILLO');
    assert.equal(logDisp.valorAnterior.disponible, true);
    assert.equal(logDisp.valorNuevo.disponible, false);
    assert.ok(logDisp.correlacionId, 'Cambios compuestos de platillo deben llevar correlacion_id');

    const correlacionadosPlatillo = await AuditoriaLog.findAll({
      where: { sucursalId: sucursal.id, correlacionId: logDisp.correlacionId },
    });
    const accionesPlatillo = new Set(correlacionadosPlatillo.map((r) => r.accion));
    assert.ok(accionesPlatillo.has(ACCIONES_AUDITORIA.CAMBIO_PRECIO));
    assert.ok(accionesPlatillo.has(ACCIONES_AUDITORIA.CAMBIO_DISPONIBILIDAD_PLATILLO));

    // Reactivar platillo con precio original Q50 para pruebas posteriores
    await VentasService.actualizarPlatillo(
      adminActor,
      platillo.id,
      { precioVenta: 50, disponible: true },
      CLIENT_META,
    );

    // 5. Cierre de caja exige cuadre exacto (bloquea excedente y faltante) y registra aprobador al cuadrar
    const estadoCaja = await CajaService.obtenerCajaActual(sucursal.id, false);
    const esperadoEfectivo = Number(estadoCaja.montoEsperadoEfectivo);

    // Excedente (+Q25) -> rechazado con 400
    await assert.rejects(
      () =>
        CajaService.cerrarCaja(
          cajeroActor,
          {
            montoContadoEfectivo: Number((esperadoEfectivo + 25).toFixed(2)),
            autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
          },
          CLIENT_META,
        ),
      (err) => err.statusCode === 400 && /excedente/i.test(err.message),
    );

    // Faltante (-Q75) -> rechazado con 400
    await assert.rejects(
      () =>
        CajaService.cerrarCaja(
          cajeroActor,
          {
            montoContadoEfectivo: Math.max(0, Number((esperadoEfectivo - 75).toFixed(2))),
            autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
          },
          CLIENT_META,
        ),
      (err) => err.statusCode === 400 && /faltante/i.test(err.message),
    );

    // Cuadre exacto -> cierra correctamente y registra aprobador
    await CajaService.cerrarCaja(
      cajeroActor,
      {
        montoContadoEfectivo: esperadoEfectivo,
        observaciones: 'Arqueo exacto para QA',
        autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
      },
      CLIENT_META,
    );
    const logCierre = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id, accion: ACCIONES_AUDITORIA.CIERRE_CAJA, cajaSesionId: sesion.id },
      order: [['id', 'DESC']],
    });
    assert.ok(logCierre);
    assert.equal(logCierre.aprobadorId, auditorActor.id);
    assert.equal(logCierre.severidad, SEVERIDADES_AUDITORIA.BAJA);
    assert.equal(Number(logCierre.impactoFinanciero), 0);
    assert.equal(logCierre.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.AUTORIZACION_SUPERVISOR);
  });

  it('garantiza rollback atómico (sin logs huérfanos) y mantiene inmutabilidad APPEND-ONLY', async () => {
    const marcador = `ROLLBACK_TEST_${RUN_TAG}`;
    await assert.rejects(
      () =>
        withTransaction(async (tx) => {
          await AuditService.registrarEvento(
            { user: adminActor, clientMeta: CLIENT_META },
            {
              accion: ACCIONES_AUDITORIA.CAMBIO_PRECIO,
              entidad: 'Platillo',
              entidadId: platillo.id,
              motivo: marcador,
            },
            tx,
          );
          throw new Error('Fallo controlado para verificar rollback de auditoría');
        }),
      /Fallo controlado/,
    );

    const huerfanos = await AuditoriaLog.count({
      where: { sucursalId: sucursal.id, motivo: marcador },
    });
    assert.equal(huerfanos, 0, 'Un rollback no debe dejar registros huérfanos en auditoria_logs');

    // Inmutabilidad: UPDATE y DELETE deben ser bloqueados por trigger o privilegios
    for (const sql of [
      `UPDATE auditoria_logs SET motivo = 'alterado' WHERE sucursal_id = ${Number(sucursal.id)}`,
      `DELETE FROM auditoria_logs WHERE sucursal_id = ${Number(sucursal.id)}`,
    ]) {
      const tx = await sequelize.transaction();
      try {
        await assert.rejects(
          () => sequelize.query(sql, { transaction: tx }),
          (err) => {
            const code = err?.parent?.code ?? err?.original?.code;
            return ['55000', '42501'].includes(code);
          },
        );
      } finally {
        await tx.rollback();
      }
    }
  });

  it('registra LOGIN_FALLIDO y BLOQUEO_CUENTA sin exponer contraseñas en claro', async () => {
    const rolCajero = await Rol.findOne({ where: { codigo: 'CAJERO', activo: true } });
    const bloqueable = await crearUsuarioConRol('lockaud', rolCajero);

    for (let i = 0; i < env.AUTH_LOCKOUT_MAX_ATTEMPTS; i++) {
      await assert.rejects(() => AuthService.login(bloqueable.db.username, 'ClaveMala999!', CLIENT_META));
    }

    const logBloqueo = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        usuarioId: bloqueable.db.id,
        accion: ACCIONES_AUDITORIA.BLOQUEO_CUENTA,
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logBloqueo, 'Debe registrar BLOQUEO_CUENTA al alcanzar el límite de intentos');
    assert.equal(logBloqueo.severidad, SEVERIDADES_AUDITORIA.MEDIA);
    assert.ok(!JSON.stringify(logBloqueo.valorNuevo).includes('ClaveMala999!'));
  });

  // ---------------------------------------------------------------------------
  // 2. Filtros, /auditoria/resumen (agregaciones SQL + alertas), /:id, RBAC y CSV
  // ---------------------------------------------------------------------------
  it('calcula /auditoria/resumen con alertas repetitivas, expone /:id correlacionado, aplica RBAC y exporta CSV', async () => {
    // Abrir un nuevo turno y disparar 3 anulaciones del mismo actor para activar alerta ANULACIONES_REPETIDAS_TURNO
    // y 3 eventos con mismo aprobador sobre el mismo usuario para activar alerta APROBADOR_RECURRENTE
    const sesion2 = await CajaService.abrirCaja(
      cajeroActor,
      {
        montoInicial: 200,
        autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
      },
      CLIENT_META,
    );

    let ultimaFacturaId = null;
    for (let i = 0; i < env.AUDIT_REPETICION_UMBRAL; i++) {
      const v = await VentasService.confirmarVenta(
        cajeroActor,
        {
          idempotencyKey: crypto.randomUUID(),
          tipoServicio: TipoServicio.MOSTRADOR,
          metodoPago: MetodoPago.EFECTIVO,
          montoRecibido: 50,
          items: [{ platilloId: platillo.id, cantidad: 1 }],
        },
        CLIENT_META,
      );
      ultimaFacturaId = v.factura.id;
      await FacturasService.anular(
        adminActor,
        v.factura.id,
        {
          motivo: `Anulación repetitiva QA #${i + 1}`,
          codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.CLIENTE_CAMBIO_OPINION,
          reintegrarInventario: false,
        },
        CLIENT_META,
      );
    }

    // Cerrar sesion2 con el mismo supervisor -> ya lleva 4 aprobaciones del mismo auditor sobre el mismo cajero
    await CajaService.cerrarCaja(
      cajeroActor,
      {
        montoContadoEfectivo: 200,
        autorizacion: { identifier: auditorActor.username, password: CLAVE_QA },
      },
      CLIENT_META,
    );

    // Registrar un evento de GESTION_NOMINA en esta sucursal para verificar aislamiento
    await withTransaction(async (tx) => {
      await AuditService.registrarEvento(
        { user: adminActor, clientMeta: CLIENT_META },
        {
          accion: ACCIONES_AUDITORIA.GESTION_NOMINA,
          entidad: 'Nomina',
          entidadId: '999',
          valorNuevo: { montoNeto: 4500 },
          motivo: 'Pago de planilla confidencial QA',
        },
        tx,
      );
    });
    const logNomina = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id, accion: ACCIONES_AUDITORIA.GESTION_NOMINA },
      order: [['id', 'DESC']],
    });
    assert.ok(logNomina);

    const logAnulacionDetalle = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
        entidadId: String(ultimaFacturaId),
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logAnulacionDetalle);

    // --- A) RBAC: CAJERO, MESERO y CHEF reciben 403 en todos los endpoints de auditoría ---
    for (const [rolNombre, token] of [
      ['CAJERO', cajeroJwt],
      ['MESERO', meseroJwt],
      ['CHEF', chefJwt],
    ]) {
      for (const ruta of [
        '/auditoria',
        '/auditoria/resumen',
        '/auditoria/acciones',
        `/auditoria/${logAnulacionDetalle.id}`,
        '/auditoria/exportar',
        '/auditoria/nomina',
      ]) {
        const res = await apiGet(ruta, token);
        assert.equal(res.status, 403, `${rolNombre} debe recibir 403 en ${ruta} (recibió ${res.status})`);
      }
    }

    // --- B) AUDITOR: acceso de investigación, pero nómina totalmente aislada ---
    const hoyGt = toIsoDateInTimezone(new Date());
    const resumenRes = await apiGet(`/auditoria/resumen?fechaDesde=${hoyGt}&fechaHasta=${hoyGt}`, auditorJwt);
    assert.equal(resumenRes.status, 200);
    const resumen = resumenRes.body.data;
    assert.ok(resumen.totalEventos > 0);
    assert.equal(
      resumen.porSeveridad.ALTA + resumen.porSeveridad.MEDIA + resumen.porSeveridad.BAJA,
      resumen.totalEventos,
      'La suma de severidades debe cuadrar con totalEventos',
    );
    assert.ok(resumen.impactoTotalAnulado >= 250, 'Debe reflejar al menos Q250 anulados (100 + 3*50)');
    assert.ok(resumen.cantidadReimpresiones >= 3, 'Debe contar al menos 3 reimpresiones');
    assert.ok(resumen.rankingUsuariosRiesgo.length > 0);
    assert.ok(
      resumen.rankingAprobadores.some((a) => a.aprobadorId === auditorActor.id && a.totalAutorizaciones >= 4),
      'El auditor debe aparecer en el ranking de aprobadores',
    );
    assert.ok(
      resumen.alertas.some((a) => a.tipo === 'ANULACIONES_REPETIDAS_TURNO' && a.cajaSesionId === sesion2.id),
      'Debe detectar la alerta de anulaciones repetidas en el turno',
    );
    assert.ok(
      resumen.alertas.some(
        (a) => a.tipo === 'APROBADOR_RECURRENTE'
          && a.aprobadorId === auditorActor.id
          && a.usuarioId === cajeroActor.id,
      ),
      'Debe detectar la alerta de aprobador recurrente sobre el mismo usuario',
    );

    // Filtros en GET /auditoria
    const filtrado = await apiGet(
      `/auditoria?severidad=ALTA&cajaSesionId=${sesion2.id}&impactoMin=50`,
      auditorJwt,
    );
    assert.equal(filtrado.status, 200);
    assert.ok(filtrado.body.data.length >= env.AUDIT_REPETICION_UMBRAL);
    assert.ok(filtrado.body.data.every((item) => item.severidad === 'ALTA'));
    assert.ok(filtrado.body.data.every((item) => item.accion !== ACCIONES_AUDITORIA.GESTION_NOMINA));

    // Detalle GET /auditoria/:id con entidadOrigen y eventosCorrelacionados
    const detalleRes = await apiGet(`/auditoria/${logAnulacionDetalle.id}`, auditorJwt);
    assert.equal(detalleRes.status, 200);
    assert.equal(detalleRes.body.data.id, logAnulacionDetalle.id);
    assert.equal(detalleRes.body.data.entidadOrigen?.tipo, 'Factura');

    const logPlatilloCompuesto = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.CAMBIO_DISPONIBILIDAD_PLATILLO,
        entidadId: String(platillo.id),
      },
      order: [['id', 'DESC']],
    });
    const detalleCorrelacion = await apiGet(`/auditoria/${logPlatilloCompuesto.id}`, auditorJwt);
    assert.equal(detalleCorrelacion.status, 200);
    assert.equal(detalleCorrelacion.body.data.entidadOrigen?.tipo, 'Platillo');
    assert.ok(
      detalleCorrelacion.body.data.eventosCorrelacionados.some(
        (ev) => ev.accion === ACCIONES_AUDITORIA.CAMBIO_PRECIO,
      ),
      'El detalle debe incluir el evento hermano correlacionado por correlacion_id',
    );

    // Aislamiento de nómina para AUDITOR
    assert.equal((await apiGet('/auditoria/nomina', auditorJwt)).status, 403);
    assert.equal((await apiGet(`/auditoria/${logNomina.id}`, auditorJwt)).status, 404);
    assert.equal((await apiGet('/auditoria/nomina', adminJwt)).status, 200);

    // --- C) Exportación CSV: requiere permiso auditoria:exportar y audita su propia ejecución ---
    const sinPermisoExport = await apiGet('/auditoria/exportar', auditorSinExportJwt);
    assert.equal(sinPermisoExport.status, 403, 'Sin permiso auditoria:exportar debe responder 403');

    const csvRes = await apiGet(`/auditoria/exportar?cajaSesionId=${sesion2.id}`, auditorJwt);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.contentType, /text\/csv/i);
    assert.ok(csvRes.body.includes('ID,Fecha_Hora_ISO,Severidad,Accion'));
    assert.ok(csvRes.body.includes('ANULACION_FACTURA'));
    assert.ok(!csvRes.body.includes('GESTION_NOMINA'), 'El CSV de un auditor nunca debe incluir nómina');

    const logExport = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        usuarioId: auditorActor.id,
        accion: ACCIONES_AUDITORIA.EXPORTAR_AUDITORIA,
      },
      order: [['id', 'DESC']],
    });
    assert.ok(logExport, 'Exportar CSV debe registrar su propio evento EXPORTAR_AUDITORIA');
    assert.equal(logExport.severidad, SEVERIDADES_AUDITORIA.MEDIA);
  });

  it('descuenta alquiler y gastos indirectos una vez y permite su consulta al auditor económico', async () => {
    const fecha = '2025-07-19';
    const rango = `?fechaDesde=${fecha}&fechaHasta=${fecha}`;
    await Usuario.update({ fechaIngreso: fecha }, { where: { id: adminActor.id } });
    await sequelize.query(
      'INSERT INTO nomina_vigencias (usuario_id, desde, sueldo_mensual) VALUES (:id, :fecha, 3100)',
      { replacements: { id: adminActor.id, fecha } },
    );
    const previo = await apiGet(`/reportes/balance${rango}`, auditorJwt);
    assert.equal(previo.status, 200);
    assert.equal(previo.body.data.sueldos, 100);
    const alquiler = { registroId: crypto.randomUUID(), categoria: 'ALQUILER', monto: '300.25', fecha, concepto: 'Alquiler QA' };
    const indirecto = { registroId: crypto.randomUUID(), categoria: 'OTRO', monto: '24.50', fecha, concepto: 'Papel y platos QA' };
    const registrar = (gasto, token = adminJwt) => fetch(`${apiBaseUrl}/reportes/gastos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(gasto),
    });

    assert.equal((await registrar(alquiler, auditorJwt)).status, 403);
    assert.equal((await registrar({ ...alquiler, monto: '0.00' })).status, 400);
    const registros = await Promise.all([registrar(alquiler), registrar(alquiler)]);
    assert.deepEqual(registros.map((respuesta) => respuesta.status).sort(), [200, 201]);
    const gastosAlquiler = await Promise.all(registros.map((respuesta) => respuesta.json()));
    assert.equal(gastosAlquiler[0].data.id, gastosAlquiler[1].data.id);
    assert.equal((await registrar({ ...alquiler, monto: '30.00' })).status, 409);
    assert.equal((await registrar(indirecto)).status, 201);

    const gastos = await apiGet(`/reportes/gastos${rango}`, auditorJwt);
    assert.equal(gastos.status, 200);
    assert.deepEqual(gastos.body.data.map((gasto) => gasto.monto), [24.50, 300.25]);
    assert.equal(gastos.body.meta.limit, 15);
    assert.equal((await apiGet(`/reportes/gastos${rango}`, cajeroJwt)).status, 403);
    assert.equal((await apiGet('/reportes/gastos?fechaDesde=2025-07-20&fechaHasta=2025-07-20', auditorJwt)).body.meta.total, 0);

    const balance = (await apiGet(`/reportes/balance${rango}`, auditorJwt)).body.data;
    assert.equal(balance.alquiler, 300.25);
    assert.equal(balance.otrosGastos, 24.50);
    assert.equal(balance.sueldos, previo.body.data.sueldos);
    assert.equal(balance.gastosTotales, previo.body.data.gastosTotales + 324.75);
    assert.equal(balance.resultado, previo.body.data.resultado - 324.75);
    const eventos = await apiGet('/auditoria?ambito=economica&accion=REGISTRO_GASTO_OPERATIVO', auditorJwt);
    assert.equal(eventos.body.meta.total, 2);

    const contrato = {
      registroId: crypto.randomUUID(), categoria: 'ALQUILER', recurrente: true,
      monto: '2800.00', fecha: '2025-07-01', concepto: 'Alquiler mensual QA',
    };
    assert.equal((await registrar({ ...contrato, hastaMes: '2025-06-01' })).status, 400);
    assert.equal((await registrar(contrato)).status, 201);
    assert.equal((await registrar(contrato)).status, 200);
    assert.equal((await registrar({
      ...contrato, registroId: crypto.randomUUID(), fecha: '2025-08-01',
      hastaMes: '2025-08-01', monto: '3100.00',
    })).status, 201);

    const balanceRango = async (desde, hasta) =>
      (await apiGet(`/reportes/balance?fechaDesde=${desde}&fechaHasta=${hasta}`, auditorJwt)).body.data;
    const julio = await balanceRango('2025-07-01', '2025-07-31');
    assert.equal(julio.alquiler, 300.25);
    assert.equal(julio.sueldos, 3100, 'El cuadre mensual aplica el sueldo completo aunque el ingreso sea a mitad de mes');
    const agosto = await balanceRango('2025-08-01', '2025-08-31');
    assert.equal(agosto.alquilerMensual, 3100);
    assert.equal(agosto.sueldos, 3100);
    assert.equal(agosto.otrosGastos, 0);
    assert.equal(agosto.resultado, -6200);
    assert.equal((await balanceRango('2025-08-02', '2025-08-02')).alquiler, 100);
    assert.equal((await balanceRango('2025-09-01', '2025-09-30')).alquiler, 0);
    const gastosAgosto = await apiGet('/reportes/gastos?fechaDesde=2025-08-01&fechaHasta=2025-08-31', auditorJwt);
    assert.equal(gastosAgosto.body.meta.total, 0);
  });

  it('permite corregir y anular un gasto manual y recalcula el resultado con trazabilidad', async () => {
    const fecha = '2025-09-18';
    const rango = `?fechaDesde=${fecha}&fechaHasta=${fecha}`;
    const operacion = (ruta, method, body, token = adminJwt) => fetch(`${apiBaseUrl}${ruta}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const antes = await apiGet(`/reportes/balance${rango}`, auditorJwt);
    const creado = await operacion('/reportes/gastos', 'POST', {
      registroId: crypto.randomUUID(), fecha, monto: '50.00', concepto: 'Papel QA',
    });
    assert.equal(creado.status, 201);
    const { id } = (await creado.json()).data;
    const ruta = `/reportes/gastos/${id}`;
    const corregido = { fecha, monto: '75.00', concepto: 'Papel y platos QA', version: 1 };
    assert.equal((await operacion(ruta, 'PUT', corregido, auditorJwt)).status, 403);
    assert.equal((await operacion(ruta, 'PUT', corregido)).status, 200);
    assert.equal((await operacion(ruta, 'PUT', { ...corregido, monto: '80.00' })).status, 409);
    assert.equal((await operacion(ruta, 'PUT', corregido)).status, 200);
    const editados = (await apiGet(`/reportes/gastos${rango}`, auditorJwt)).body.data;
    assert.equal(editados[0].monto, 75);
    assert.equal(editados[0].version, 2);
    assert.equal(
      Math.round((await apiGet(`/reportes/balance${rango}`, auditorJwt)).body.data.resultado * 100),
      Math.round(antes.body.data.resultado * 100) - 7500,
    );
    assert.equal((await operacion(`${ruta}/anular`, 'POST', { version: 1, motivo: 'Duplicado QA' })).status, 409);
    const anulacion = { version: 2, motivo: 'Duplicado QA' };
    assert.equal((await operacion(`${ruta}/anular`, 'POST', anulacion)).status, 200);
    assert.equal((await operacion(`${ruta}/anular`, 'POST', anulacion)).status, 200);
    assert.equal((await apiGet(`/reportes/gastos${rango}`, auditorJwt)).body.meta.total, 0);
    assert.equal((await apiGet(`/reportes/balance${rango}`, auditorJwt)).body.data.resultado, antes.body.data.resultado);
    const eventos = await AuditoriaLog.findAll({ where: { sucursalId: sucursal.id, entidad: 'GastoOperativo', entidadId: String(id) } });
    assert.equal(eventos.length, 3);
    assert.equal(eventos.find((evento) => evento.accion === 'ANULACION_GASTO_OPERATIVO').motivo, 'Duplicado QA');
  });

  it('incluye en el mes actual el sueldo guardado cuando aún falta su vigencia', async () => {
    const hoy = toIsoDateInTimezone();
    const mes = hoy.slice(0, 7);
    const fin = new Date(`${mes}-01T00:00:00Z`);
    fin.setUTCMonth(fin.getUTCMonth() + 1, 0);
    const ruta = `/reportes/balance?fechaDesde=${mes}-01&fechaHasta=${fin.toISOString().slice(0, 10)}`;
    const antes = (await apiGet(ruta, auditorJwt)).body.data;
    await Usuario.update({ fechaIngreso: hoy, sueldoMensual: 4000 }, { where: { id: cajeroActor.id } });
    const despues = (await apiGet(ruta, auditorJwt)).body.data;
    assert.equal(despues.sueldos - antes.sueldos, 4000);
    assert.equal(despues.personalConDatosPendientes, antes.personalConDatosPendientes - 1);
  });
});
