const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');

const { ACCIONES_AUDITORIA, SEVERIDADES_AUDITORIA } = require('../src/config/constants');
const { connectDatabase, disconnectDatabase, sequelize } = require('../src/config/database');
const { env } = require('../src/config/env');
const {
  AuditoriaLog,
  Categoria,
  Ingrediente,
  MetodoPago,
  Platillo,
  Proveedor,
  RecetaIngrediente,
  Rol,
  Sucursal,
  TipoServicio,
  Usuario,
} = require('../src/models');
const { createApp } = require('../src/app');
const { CajaService } = require('../src/services/caja.service');
const { CheckoutService } = require('../src/services/checkout.service');
const { InventarioService } = require('../src/services/inventario.service');
const { obtenerPermisosEfectivos } = require('../src/services/permisos.service');

/**
 * Suite de integración Fase 4: Visibilidad y controles del saldo negativo de inventario.
 * - Corre bajo `pos_app_rol` en su propia sucursal aislada.
 * - Verifica:
 *   1. Constraints `ingredientes_saldos_validos` e `inventario_movimientos_saldo_coherente` VALIDATED.
 *   2. Flag `INVENTARIO_PERMITIR_STOCK_NEGATIVO=false` rechaza venta listando insumos faltantes (rollback limpio).
 *   3. Flag `INVENTARIO_PERMITIR_STOCK_NEGATIVO=true`: audita `STOCK_NEGATIVO_GENERADO` SOLO al cruzar >= 0 -> < 0
 *      con mismo `correlacion_id` que `VENTA_CONFIRMADA`, severidad MEDIA vs ALTA según `AUDIT_STOCK_NEGATIVO_ALTO_OZ`,
 *      y NO repite evento en ventas subsecuentes cuando ya era < 0.
 *   4. Endpoint `GET /api/v1/inventario/en-negativo`, filtro `?soloNegativos=true`, indicador en `GET /api/v1/reportes/resumen`
 *      y compensación automática al registrar una compra.
 */
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-stock-negativo/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();

describe('Visibilidad y controles del saldo negativo de inventario (PostgreSQL + API HTTP)', () => {
  const origPermitirNegativo = env.INVENTARIO_PERMITIR_STOCK_NEGATIVO;
  const origUmbralAltoOz = env.AUDIT_STOCK_NEGATIVO_ALTO_OZ;

  let ephemeralServer = null;
  let apiBaseUrl = '';
  let sucursal;
  let admin;
  let proveedor;
  let ingPequeno;
  let ingGrande;
  let platilloPequeno;
  let platilloGrande;

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

  before(async () => {
    await connectDatabase();

    const app = createApp();
    await new Promise((resolve) => {
      ephemeralServer = app.listen(0, '127.0.0.1', () => {
        const { port } = ephemeralServer.address();
        apiBaseUrl = `http://127.0.0.1:${port}${env.API_PREFIX}`;
        resolve();
      });
    });

    sucursal = await Sucursal.create({
      codigo: `QA-SN-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal Stock Negativo ${RUN_TAG}`,
      nit: '1234567-8',
      direccion: 'Zona 10, Guatemala',
      serieFactura: `SN${RUN_TAG.slice(-3)}`,
      activa: true,
    });

    const rolAdmin = await Rol.findOne({ where: { codigo: env.ADMIN_ROLE_CODE, activo: true } });
    assert.ok(rolAdmin, 'Debe existir el rol ADMIN');
    const u = await Usuario.create({
      sucursalId: sucursal.id,
      rolId: rolAdmin.id,
      nombreCompleto: `QA StockNeg ${RUN_TAG}`,
      username: `qa_sn_${RUN_TAG}`.toLowerCase(),
      email: `qa_sn_${RUN_TAG}@pos-qa.gt`.toLowerCase(),
      passwordHash: await bcrypt.hash('QaStockNeg2026!', 8),
      activo: true,
    });
    const permisos = await obtenerPermisosEfectivos(u.id, rolAdmin.id);
    admin = {
      jwt: jwt.sign(
        { sub: u.id, ver: u.tokenVersion, sucursalId: sucursal.id },
        env.JWT_SECRET,
        { expiresIn: '1h', algorithm: 'HS256' },
      ),
      actor: {
        id: u.id,
        username: u.username,
        nombreCompleto: u.nombreCompleto,
        sucursalId: sucursal.id,
        rolId: rolAdmin.id,
        rolCodigo: rolAdmin.codigo,
        rol: { id: rolAdmin.id, codigo: rolAdmin.codigo },
        permisos,
      },
    };

    await CajaService.abrirCaja(admin.actor, { montoInicial: 200 }, CLIENT_META);

    proveedor = await Proveedor.create({
      sucursalId: sucursal.id,
      nombre: `Proveedor SN ${RUN_TAG}`,
      activo: true,
    });

    const categoria = await Categoria.create({
      sucursalId: sucursal.id,
      nombre: `Cat SN ${RUN_TAG}`,
      orden: 1,
      activa: true,
    });

    // Ingrediente 1: stock inicial 2 oz, receta consume 6 oz -> déficit 4 oz (< umbral 16 oz -> MEDIA)
    ingPequeno = await Ingrediente.create({
      sucursalId: sucursal.id,
      proveedorId: proveedor.id,
      codigo: `SN-P-${RUN_TAG}`.slice(0, 25),
      nombre: `Tomate SN ${RUN_TAG}`,
      stockActualOz: 2,
      stockMinimoOz: 4,
      costoPromedioOz: 1.5,
      activo: true,
    });

    // Ingrediente 2: stock inicial 0 oz, receta consume 20 oz -> déficit 20 oz (>= umbral 16 oz -> ALTA)
    ingGrande = await Ingrediente.create({
      sucursalId: sucursal.id,
      proveedorId: proveedor.id,
      codigo: `SN-G-${RUN_TAG}`.slice(0, 25),
      nombre: `Carne SN ${RUN_TAG}`,
      stockActualOz: 0,
      stockMinimoOz: 8,
      costoPromedioOz: 3,
      activo: true,
    });

    platilloPequeno = await Platillo.create({
      sucursalId: sucursal.id,
      categoriaId: categoria.id,
      sku: `SNP-${RUN_TAG}`.slice(0, 25),
      nombre: `Ensalada SN ${RUN_TAG}`,
      precioVenta: 35,
      disponible: true,
      activo: true,
    });
    await RecetaIngrediente.create({
      platilloId: platilloPequeno.id,
      ingredienteId: ingPequeno.id,
      cantidadOz: 6,
    });

    platilloGrande = await Platillo.create({
      sucursalId: sucursal.id,
      categoriaId: categoria.id,
      sku: `SNG-${RUN_TAG}`.slice(0, 25),
      nombre: `Churrasco SN ${RUN_TAG}`,
      precioVenta: 95,
      disponible: true,
      activo: true,
    });
    await RecetaIngrediente.create({
      platilloId: platilloGrande.id,
      ingredienteId: ingGrande.id,
      cantidadOz: 20,
    });
  });

  after(async () => {
    env.INVENTARIO_PERMITIR_STOCK_NEGATIVO = origPermitirNegativo;
    env.AUDIT_STOCK_NEGATIVO_ALTO_OZ = origUmbralAltoOz;
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(resolve));
    }
    await disconnectDatabase();
  });

  it('confirma que los CHECK constraints de inventario están VALIDATED en PostgreSQL', async () => {
    const rows = await sequelize.query(
      `SELECT conname, convalidated
       FROM pg_constraint
       WHERE conname IN ('ingredientes_saldos_validos', 'inventario_movimientos_saldo_coherente')`,
      { type: QueryTypes.SELECT },
    );
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.convalidated, true, `La restricción ${r.conname} debe estar VALIDATED`);
    }
  });

  it('con INVENTARIO_PERMITIR_STOCK_NEGATIVO=false rechaza la venta listando ingredientes faltantes sin alterar stock', async () => {
    env.INVENTARIO_PERMITIR_STOCK_NEGATIVO = false;

    await assert.rejects(
      () =>
        CheckoutService.confirmarVenta(
          admin.actor,
          {
            idempotencyKey: crypto.randomUUID(),
            tipoServicio: TipoServicio.MOSTRADOR,
            metodoPago: MetodoPago.EFECTIVO,
            montoRecibido: 50,
            items: [{ platilloId: platilloPequeno.id, cantidad: 1 }],
          },
          CLIENT_META,
        ),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.ok(err.message.includes(ingPequeno.nombre), 'Debe listar el ingrediente insuficiente');
        assert.ok(Array.isArray(err.details?.ingredientesInsuficientes));
        assert.equal(err.details.ingredientesInsuficientes[0].ingredienteId, ingPequeno.id);
        return true;
      },
    );

    const recargado = await Ingrediente.findByPk(ingPequeno.id);
    assert.equal(Number(recargado.stockActualOz), 2, 'El stock debe quedar intacto tras el rechazo');
  });

  it('audita STOCK_NEGATIVO_GENERADO solo al cruzar >=0 -> <0 con correlacion_id compartido, severidad MEDIA/ALTA y visibilidad en Inventario y Reportes', async () => {
    env.INVENTARIO_PERMITIR_STOCK_NEGATIVO = true;
    env.AUDIT_STOCK_NEGATIVO_ALTO_OZ = 16;

    // 1. Venta 1: cruza ingPequeno (2 -> -4 oz => déficit 4 oz < 16 => MEDIA) y ingGrande (0 -> -20 oz => déficit 20 oz >= 16 => ALTA)
    const venta1 = await CheckoutService.confirmarVenta(
      admin.actor,
      {
        idempotencyKey: crypto.randomUUID(),
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 150,
        items: [
          { platilloId: platilloPequeno.id, cantidad: 1 },
          { platilloId: platilloGrande.id, cantidad: 1 },
        ],
      },
      CLIENT_META,
    );

    const logVenta1 = await AuditoriaLog.findOne({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.VENTA_CONFIRMADA,
        entidadId: String(venta1.venta.id),
      },
    });
    assert.ok(logVenta1?.correlacionId, 'VENTA_CONFIRMADA debe tener correlacionId');

    const logsNegativos1 = await AuditoriaLog.findAll({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.STOCK_NEGATIVO_GENERADO,
      },
      order: [['id', 'ASC']],
    });
    assert.equal(logsNegativos1.length, 2, 'Debe crearse 1 evento por cada ingrediente que cruzó a < 0');

    const logPeq = logsNegativos1.find((l) => l.entidadId === String(ingPequeno.id));
    const logGrd = logsNegativos1.find((l) => l.entidadId === String(ingGrande.id));
    assert.ok(logPeq && logGrd);
    assert.equal(logPeq.correlacionId, logVenta1.correlacionId);
    assert.equal(logGrd.correlacionId, logVenta1.correlacionId);
    assert.equal(logPeq.severidad, SEVERIDADES_AUDITORIA.MEDIA);
    assert.equal(logGrd.severidad, SEVERIDADES_AUDITORIA.ALTA);

    // 2. Venta 2 sobre ingPequeno (ya está en -4 oz -> pasa a -10 oz): NO debe emitir otro STOCK_NEGATIVO_GENERADO
    await CheckoutService.confirmarVenta(
      admin.actor,
      {
        idempotencyKey: crypto.randomUUID(),
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 50,
        items: [{ platilloId: platilloPequeno.id, cantidad: 1 }],
      },
      CLIENT_META,
    );

    const totalLogsNegativos = await AuditoriaLog.count({
      where: {
        sucursalId: sucursal.id,
        accion: ACCIONES_AUDITORIA.STOCK_NEGATIVO_GENERADO,
      },
    });
    assert.equal(
      totalLogsNegativos,
      2,
      'Vender un ingrediente que YA tenía saldo negativo no debe duplicar STOCK_NEGATIVO_GENERADO',
    );

    // 3. Consultar GET /api/v1/inventario/en-negativo y filtro ?soloNegativos=true
    const resNeg = await api('GET', '/inventario/en-negativo', admin.jwt);
    assert.equal(resNeg.status, 200);
    assert.equal(resNeg.body.resumen.cantidadIngredientes, 2);
    assert.equal(resNeg.body.resumen.totalDeficitOz, 30); // 10 oz + 20 oz
    assert.equal(resNeg.body.resumen.totalDeficitLb, 1.875);
    assert.equal(resNeg.body.data[0].id, ingGrande.id, 'Debe ordenar primero el mayor déficit (-20 oz)');
    assert.equal(resNeg.body.data[0].deficitOz, 20);

    const resFiltro = await api('GET', '/inventario/ingredientes?page=1&soloNegativos=true', admin.jwt);
    assert.equal(resFiltro.status, 200);
    assert.equal(resFiltro.body.data.length, 2);

    // 4. Indicador en GET /api/v1/reportes/resumen
    const resRep = await api('GET', '/reportes/resumen', admin.jwt);
    assert.equal(resRep.status, 200);
    assert.equal(resRep.body.data.kpis.ingredientesEnNegativoCount, 2);
    assert.equal(resRep.body.data.kpis.deficitTotalInventarioOz, 30);
    assert.equal(resRep.body.data.kpis.deficitTotalInventarioLb, 1.875);

    // 5. Compensar déficit mediante compra (1 lb = 16 oz de ingPequeno -> -10 + 16 = +6 oz)
    await InventarioService.registrarCompra(
      admin.actor,
      {
        proveedorId: proveedor.id,
        numeroDocumento: `COMP-${RUN_TAG}`,
        items: [{ ingredienteId: ingPequeno.id, cantidad: 1, unidad: 'lb', precioUnitario: 24 }],
      },
      CLIENT_META,
    );

    const resNegPostCompra = await api('GET', '/inventario/en-negativo', admin.jwt);
    assert.equal(resNegPostCompra.status, 200);
    assert.equal(resNegPostCompra.body.resumen.cantidadIngredientes, 1);
    assert.equal(resNegPostCompra.body.data[0].id, ingGrande.id);
  });
});
