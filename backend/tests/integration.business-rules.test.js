const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { connectDatabase, disconnectDatabase, getPgErrorCode, sequelize } = require('../src/config/database');
const { env } = require('../src/config/env');
const {
  Categoria,
  AuditoriaLog,
  EstadoCaja,
  EstadoFactura,
  EstadoMesa,
  Ingrediente,
  InventarioMovimiento,
  Mesa,
  Merma,
  MetodoPago,
  MotivoMerma,
  Platillo,
  Proveedor,
  Rol,
  Sucursal,
  TipoServicio,
  UnidadMedida,
  Usuario,
} = require('../src/models');
const { obtenerPermisosEfectivos } = require('../src/services/permisos.service');
const { AuthService } = require('../src/services/auth.service');
const { CajaService } = require('../src/services/caja.service');
const { FacturasService } = require('../src/services/facturas.service');
const { InventarioService } = require('../src/services/inventario.service');
const { MermasService } = require('../src/services/mermas.service');
const { VentasService } = require('../src/services/ventas.service');
const { AuditService } = require('../src/shared/services/audit.service');
const {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} = require('../src/shared/errors/AppError');

const API_BASE_URL = `http://localhost:${env.PORT}${env.API_PREFIX}`;
const CLIENT_META = {
  ipAddress: '127.0.0.1',
  userAgent: 'qa-integration-suite/1.0',
};

// Etiqueta única por ejecución para evitar colisiones de códigos/SKU/usernames
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();

describe('Pruebas de integración de reglas de negocio reales (PostgreSQL + API HTTP)', () => {
  let adminUser;
  let adminJwt;
  let categoriaId;
  let cajaAbiertaPorTest = false;

  // Registro de entidades temporales creadas durante la suite para desactivarlas en after()
  const ingredientesTemporalesIds = [];
  const platillosTemporalesIds = [];
  const mesasTemporalesIds = [];
  const usuariosTemporalesIds = [];

  /** Helper para crear ingrediente temporal con stock exacto en onzas */
  async function crearIngredienteTemporal(sufijo, stockInicialOz) {
    const ing = await InventarioService.crearIngrediente(
      adminUser,
      {
        codigo: `QAI-${sufijo}-${RUN_TAG}`.slice(0, 30),
        nombre: `Ingrediente QA ${sufijo} ${RUN_TAG}`,
        stockMinimo: 1,
        unidadStockMinimo: UnidadMedida.oz,
        stockInicial: stockInicialOz,
        unidadStockInicial: UnidadMedida.oz,
        precioPorLb: 32, // Q2.00 por onza
      },
      CLIENT_META,
    );
    ingredientesTemporalesIds.push(ing.id);
    return ing;
  }

  /** Helper para crear platillo temporal vinculado a un ingrediente temporal */
  async function crearPlatilloTemporal(sufijo, ingredienteId, cantidadOz, precioVenta = 56) {
    const platillo = await VentasService.crearPlatillo(
      adminUser,
      {
        categoriaId,
        sku: `QAP-${sufijo}-${RUN_TAG}`.slice(0, 30),
        nombre: `Platillo QA ${sufijo} ${RUN_TAG}`,
        descripcion: 'Platillo temporal generado por suite automatizada QA',
        precioVenta,
        disponible: true,
        receta: [{ ingredienteId, cantidadOz }],
      },
      CLIENT_META,
    );
    platillosTemporalesIds.push(platillo.id);
    return platillo;
  }

  /** Helper para leer stock actual en onzas directamente desde PostgreSQL */
  async function leerStockOz(ingredienteId) {
    const row = await Ingrediente.findByPk(ingredienteId);
    assert.ok(row, `El ingrediente ID ${ingredienteId} debe existir en BD`);
    return Number(row.stockActualOz);
  }

  before(async () => {
    await connectDatabase();

    // 1. Obtener usuario administrador activo con su rol y sucursal
    const adminDb = await Usuario.findOne({
      where: { activo: true },
      include: [
        { model: Rol, as: 'rol', where: { codigo: env.ADMIN_ROLE_CODE, activo: true } },
        { model: Sucursal, as: 'sucursal', where: { activa: true } },
      ],
      order: [['id', 'ASC']],
    });

    assert.ok(
      adminDb,
      `Debe existir un usuario activo con rol ${env.ADMIN_ROLE_CODE} en PostgreSQL para ejecutar las pruebas`,
    );

    const permisos = await obtenerPermisosEfectivos(adminDb.id, adminDb.rolId);
    adminUser = {
      id: adminDb.id,
      username: adminDb.username,
      nombreCompleto: adminDb.nombreCompleto,
      email: adminDb.email,
      sucursalId: adminDb.sucursalId,
      sucursalNombre: adminDb.sucursal.nombre,
      rolId: adminDb.rolId,
      rolCodigo: adminDb.rol.codigo,
      rolNombre: adminDb.rol.nombre,
      vistaInicial: adminDb.rol.vistaInicial,
      permisos,
    };

    // Token JWT firmado localmente con env.JWT_SECRET para evitar consumir rate-limit de /auth/login
    adminJwt = jwt.sign(
      {
        sub: adminUser.id,
        // P0.3: el token debe llevar la token_version vigente del usuario
        ver: adminDb.tokenVersion,
        username: adminUser.username,
        rolCodigo: adminUser.rolCodigo,
        sucursalId: adminUser.sucursalId,
      },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );

    // 2. Obtener una categoría activa para asociar los platillos temporales
    const categoria = await Categoria.findOne({
      where: { activa: true },
      order: [['id', 'ASC']],
    });
    assert.ok(categoria, 'Debe existir al menos una categoría activa en BD');
    categoriaId = categoria.id;

    // 3. Verificar caja abierta en la sucursal (NO cerrar si ya existía abierta)
    const cajaActual = await CajaService.obtenerCajaActual(adminUser.sucursalId);
    if (!cajaActual) {
      await CajaService.abrirCaja(
        adminUser,
        { montoInicial: 500, observaciones: `Caja temporal QA ${RUN_TAG}` },
        CLIENT_META,
      );
      cajaAbiertaPorTest = true;
    }
  });

  after(async () => {
    try {
      // Desactivar platillos temporales para no contaminar el menú visible
      if (platillosTemporalesIds.length > 0) {
        await Platillo.update(
          { activo: false, disponible: false },
          { where: { id: platillosTemporalesIds } },
        );
      }

      // Desactivar ingredientes temporales para no contaminar el inventario visible
      if (ingredientesTemporalesIds.length > 0) {
        await Ingrediente.update(
          { activo: false },
          { where: { id: ingredientesTemporalesIds } },
        );
      }

      // Desactivar mesas temporales creadas por la suite
      if (mesasTemporalesIds.length > 0) {
        await Mesa.update(
          { activa: false, estado: EstadoMesa.DISPONIBLE },
          { where: { id: mesasTemporalesIds } },
        );
      }

      // Asegurar que el usuario temporal quede desactivado
      if (usuariosTemporalesIds.length > 0) {
        await Usuario.update(
          { activo: false },
          { where: { id: usuariosTemporalesIds } },
        );
      }

      // Solo cerrar la caja si la abrió esta propia suite; jamás cerrar una caja preexistente
      if (cajaAbiertaPorTest && adminUser) {
        const cajaActual = await CajaService.obtenerCajaActual(adminUser.sucursalId);
        if (cajaActual && cajaActual.estado === EstadoCaja.ABIERTA) {
          await CajaService.cerrarCaja(
            adminUser,
            {
              montoContadoEfectivo: cajaActual.montoEsperadoEfectivo,
              observacionesCierre: `Cierre automático caja temporal QA ${RUN_TAG}`,
            },
            CLIENT_META,
          );
        }
      }
    } finally {
      await disconnectDatabase();
    }
  });

  // =========================================================================
  // 1. No vender más stock del existente + rollback intacto
  // =========================================================================
  it('vende solo platillos con receta valorizada y descuenta las onzas por unidad al cobrar', async () => {
    async function enviar(path, body, method = 'POST') {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    }

    const ingredienteBase = {
      codigo: `QAI-SINCOSTO-${RUN_TAG}`.slice(0, 30),
      nombre: 'Ingrediente sin costo',
      stockMinimo: 0,
      unidadStockMinimo: UnidadMedida.oz,
      unidadStockInicial: UnidadMedida.oz,
      precioPorLb: 0,
    };
    assert.equal((await enviar('/inventario/ingredientes', { ...ingredienteBase, stockInicial: 5 })).status, 400);
    assert.equal((await enviar('/inventario/ingredientes', ingredienteBase)).status, 400);
    const sinCosto = await Ingrediente.findOne({
      where: { sucursalId: adminUser.sucursalId, stockActualOz: 0, costoPromedioOz: 0, activo: true },
    });
    assert.ok(sinCosto, 'El menú precargado incluye ingredientes por valorar');
    assert.equal((await enviar(`/inventario/ingredientes/${sinCosto.id}/ajustar`, {
      tipoAjuste: 'ENTRADA', cantidad: 2, unidad: UnidadMedida.oz, motivo: 'Prueba sin costo',
    })).status, 400);

    const entrada = { categoriaId, sku: `QA-RECETA-${RUN_TAG}`.slice(0, 30), nombre: 'Platillo QA con receta' };
    assert.equal((await enviar('/ventas/platillos', { ...entrada, precioVenta: 0.001 })).status, 400);
    const sinReceta = await enviar('/ventas/platillos', { ...entrada, precioVenta: 25 });
    assert.equal(sinReceta.status, 201);
    const platillo = sinReceta.body.data;
    platillosTemporalesIds.push(platillo.id);
    assert.equal(platillo.disponible, false);

    const pedido = {
      idempotencyKey: crypto.randomUUID(),
      tipoServicio: TipoServicio.MOSTRADOR,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibido: 100,
      items: [{ platilloId: platillo.id, cantidad: 2 }],
    };
    assert.equal((await enviar('/ventas/confirmar', pedido)).status, 400);
    assert.equal((await enviar(`/ventas/platillos/${platillo.id}`, {
      disponible: true, receta: [{ ingredienteId: sinCosto.id, cantidadOz: 3 }],
    }, 'PUT')).status, 400);

    const conCosto = await enviar('/inventario/ingredientes', {
      ...ingredienteBase, nombre: 'Ingrediente de compra QA', stockInicial: 16, precioPorLb: 16,
    });
    assert.equal(conCosto.status, 201);
    const idCompraIngrediente = conCosto.body.data.id;
    ingredientesTemporalesIds.push(idCompraIngrediente);
    const proveedor = await Proveedor.findOne({ where: { sucursalId: adminUser.sucursalId, activo: true } });
    assert.ok(proveedor);
    const compra = await enviar('/inventario/compras', {
      proveedorId: proveedor.id,
      items: [{ ingredienteId: idCompraIngrediente, cantidadLb: 1, precioPorLb: 32 }],
    });
    assert.equal(compra.status, 201);
    const comprado = await Ingrediente.findByPk(idCompraIngrediente);
    assert.equal(Number(comprado.stockActualOz), 32);
    assert.equal(Number(comprado.costoPromedioOz), 1.5);

    const borrador = await enviar('/ventas/platillos', {
      categoriaId,
      sku: `QA-BORRADOR-${RUN_TAG}`.slice(0, 30),
      nombre: 'Platillo QA desde inventario',
      precioVenta: 28,
      disponible: false,
      receta: [{ ingredienteId: idCompraIngrediente, cantidadOz: 4 }],
    });
    assert.equal(borrador.status, 201);
    platillosTemporalesIds.push(borrador.body.data.id);
    assert.equal(borrador.body.data.disponible, false);
    assert.equal(borrador.body.data.receta[0].ingredienteId, idCompraIngrediente);
    assert.equal(Number(borrador.body.data.receta[0].cantidadOz), 4);
    assert.equal(Number((await comprado.reload()).stockActualOz), 32);

    const ingrediente = await crearIngredienteTemporal('PRECIO', 20);
    const configurado = await enviar(`/ventas/platillos/${platillo.id}`, {
      disponible: true, receta: [{ ingredienteId: ingrediente.id, cantidadOz: 3 }],
    }, 'PUT');
    assert.equal(configurado.status, 200);
    const antes = await Ingrediente.findByPk(ingrediente.id);
    assert.equal(Number(antes.stockActualOz), 20, 'Configurar una receta no consume existencias');

    const confirmado = await enviar('/ventas/confirmar', pedido);
    assert.equal(confirmado.status, 201, JSON.stringify(confirmado.body.error));
    const venta = confirmado.body.data.venta;
    assert.equal(Number(venta.total), 50);
    assert.equal(Number(venta.costoTotalReceta), 12);
    assert.equal((await enviar('/ventas/confirmar', pedido)).body.data.venta.id, venta.id);
    const despues = await Ingrediente.findByPk(ingrediente.id);
    assert.equal(Number(despues.stockActualOz), 14, 'Dos porciones consumen seis onzas una sola vez');
    const movimiento = await InventarioMovimiento.findOne({
      where: { referenciaTipo: 'VENTA', referenciaId: venta.id, ingredienteId: ingrediente.id },
    });
    assert.equal(Number(movimiento.cantidadOz), -6);
  });

  it('impide vender más stock del existente (ConflictError 409) y mantiene el stock intacto tras rollback', async () => {
    const ing = await crearIngredienteTemporal('STK', 10);
    const platillo = await crearPlatilloTemporal('STK', ing.id, 6, 56);

    // Primera venta: consume 6 oz -> deben quedar 4 oz
    const primeraVenta = await VentasService.confirmarVenta(
      adminUser,
      {
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 60,
        items: [{ platilloId: platillo.id, cantidad: 1 }],
      },
      CLIENT_META,
    );

    assert.ok(primeraVenta.factura.id > 0);
    assert.equal(await leerStockOz(ing.id), 4);

    // Segunda venta: requiere 6 oz pero solo hay 4 oz -> debe lanzar ConflictError (409)
    await assert.rejects(
      () =>
        VentasService.confirmarVenta(
          adminUser,
          {
            tipoServicio: TipoServicio.MOSTRADOR,
            metodoPago: MetodoPago.EFECTIVO,
            montoRecibido: 60,
            items: [{ platilloId: platillo.id, cantidad: 1 }],
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof ConflictError, `Esperado ConflictError, recibido ${err?.name}`);
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Inventario insuficiente/i);
        assert.ok(Array.isArray(err.details?.faltantes) && err.details.faltantes.length === 1);
        assert.equal(err.details.faltantes[0].requeridoOz, 6);
        assert.equal(err.details.faltantes[0].disponibleOz, 4);
        return true;
      },
    );

    // Verificar rollback intacto: el stock debe permanecer exactamente en 4 oz
    assert.equal(await leerStockOz(ing.id), 4);
  });

  // =========================================================================
  // 2. Concurrencia sin sobreventa (Race Condition - Fase 1.1)
  // =========================================================================
  it('garantiza concurrencia sin sobreventa (Fase 1.1): de 5 ventas simultáneas solo 1 triunfa y el stock queda en 0 oz', async () => {
    const ing = await crearIngredienteTemporal('CONC', 6);
    const platillo = await crearPlatilloTemporal('CONC', ing.id, 6, 45);

    const promesas = Array.from({ length: 5 }, () =>
      VentasService.confirmarVenta(
        adminUser,
        {
          idempotencyKey: crypto.randomUUID(),
          tipoServicio: TipoServicio.MOSTRADOR,
          metodoPago: MetodoPago.EFECTIVO,
          montoRecibido: 50,
          items: [{ platilloId: platillo.id, cantidad: 1 }],
        },
        CLIENT_META,
      ),
    );

    const resultados = await Promise.allSettled(promesas);
    const exitosas = resultados.filter((r) => r.status === 'fulfilled');
    const fallidas = resultados.filter((r) => r.status === 'rejected');

    assert.equal(exitosas.length, 1, `Debe triunfar exactamente 1 venta, triunfaron ${exitosas.length}`);
    assert.equal(fallidas.length, 4, `Deben fallar exactamente 4 ventas, fallaron ${fallidas.length}`);

    for (const rechazo of fallidas) {
      assert.ok(
        rechazo.reason instanceof ConflictError,
        `Cada rechazo debe ser ConflictError, recibido: ${rechazo.reason?.name}: ${rechazo.reason?.message}`,
      );
      assert.equal(rechazo.reason.statusCode, 409);
    }

    const stockFinal = await leerStockOz(ing.id);
    assert.equal(stockFinal, 0, `El stock final debe ser exactamente 0 oz, obtenido ${stockFinal}`);
  });

  // =========================================================================
  // 3. Idempotencia en confirmación de venta (Fase 1.5)
  // =========================================================================
  it('mantiene idempotencia (Fase 1.5): repetir idempotencyKey devuelve la misma factura y descuenta stock una sola vez', async () => {
    const ing = await crearIngredienteTemporal('IDEM', 20);
    const platillo = await crearPlatilloTemporal('IDEM', ing.id, 5, 40);
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      idempotencyKey,
      tipoServicio: TipoServicio.MOSTRADOR,
      metodoPago: MetodoPago.EFECTIVO,
      montoRecibido: 50,
      items: [{ platilloId: platillo.id, cantidad: 1 }],
    };

    const primera = await VentasService.confirmarVenta(adminUser, payload, CLIENT_META);
    const segunda = await VentasService.confirmarVenta(adminUser, payload, CLIENT_META);

    assert.equal(segunda.factura.id, primera.factura.id);
    assert.equal(segunda.factura.numeroCompleto, primera.factura.numeroCompleto);
    assert.equal(segunda.venta.id, primera.venta.id);
    assert.equal(await leerStockOz(ing.id), 15, 'El inventario debe descontarse únicamente una vez');
  });

  // =========================================================================
  // 4. Efectivo recibido menor al total
  // =========================================================================
  it('rechaza venta en EFECTIVO cuando montoRecibido es menor al total (BadRequestError 400)', async () => {
    const ing = await crearIngredienteTemporal('EFEC', 12);
    const platillo = await crearPlatilloTemporal('EFEC', ing.id, 4, 80);

    await assert.rejects(
      () =>
        VentasService.confirmarVenta(
          adminUser,
          {
            tipoServicio: TipoServicio.MOSTRADOR,
            metodoPago: MetodoPago.EFECTIVO,
            montoRecibido: 50, // menor que Q80.00
            items: [{ platilloId: platillo.id, cantidad: 1 }],
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /efectivo recibido.*menor al total/i);
        return true;
      },
    );

    // El stock no debe haber sido tocado
    assert.equal(await leerStockOz(ing.id), 12);
  });

  // =========================================================================
  // 5. Validaciones HTTP Zod en POST /api/v1/ventas/confirmar (Fase 1.6)
  // =========================================================================
  describe('Validaciones HTTP Zod contra POST /api/v1/ventas/confirmar (Fase 1.6)', () => {
    let platilloHttpId;

    before(async () => {
      const ing = await crearIngredienteTemporal('ZOD', 10);
      const platillo = await crearPlatilloTemporal('ZOD', ing.id, 2, 35);
      platilloHttpId = platillo.id;
    });

    // P0.4: idempotencyKey es obligatoria; se genera una por llamada salvo que el test la controle
    async function postConfirmarVenta(body, { sinIdempotencyKey = false } = {}) {
      const payload = sinIdempotencyKey
        ? body
        : { idempotencyKey: crypto.randomUUID(), ...body };
      const response = await fetch(`${API_BASE_URL}/ventas/confirmar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminJwt}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      return { status: response.status, json };
    }

    it('rechaza con HTTP 400 una venta sin idempotencyKey (P0.4)', async () => {
      const { status, json } = await postConfirmarVenta(
        {
          tipoServicio: TipoServicio.MOSTRADOR,
          metodoPago: MetodoPago.EFECTIVO,
          montoRecibido: 100,
          items: [{ platilloId: platilloHttpId, cantidad: 1 }],
        },
        { sinIdempotencyKey: true },
      );
      assert.equal(status, 400);
      assert.ok(json.error.details.some((d) => d.campo === 'idempotencyKey'));
    });

    it('rechaza con HTTP 400 metodoPago = TARJETA sin referenciaPago', async () => {
      const { status, json } = await postConfirmarVenta({
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.TARJETA,
        items: [{ platilloId: platilloHttpId, cantidad: 1 }],
      });

      assert.equal(status, 400);
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      assert.ok(
        json.error.details.some((d) => d.campo === 'referenciaPago'),
        `Se esperaba error en campo referenciaPago, recibido: ${JSON.stringify(json.error.details)}`,
      );
    });

    it('rechaza con HTTP 400 tipoServicio = MESA sin mesaId', async () => {
      const { status, json } = await postConfirmarVenta({
        tipoServicio: TipoServicio.MESA,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 50,
        items: [{ platilloId: platilloHttpId, cantidad: 1 }],
      });

      assert.equal(status, 400);
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      assert.ok(
        json.error.details.some((d) => d.campo === 'mesaId'),
        `Se esperaba error en campo mesaId, recibido: ${JSON.stringify(json.error.details)}`,
      );
    });

    it('rechaza con HTTP 400 datosDeliveryJson con más de 20 claves', async () => {
      const payloadMuchasClaves = {};
      for (let i = 1; i <= 21; i++) {
        payloadMuchasClaves[`k${i}`] = `v${i}`;
      }

      const { status, json } = await postConfirmarVenta({
        tipoServicio: TipoServicio.DELIVERY,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 50,
        datosDeliveryJson: payloadMuchasClaves,
        items: [{ platilloId: platilloHttpId, cantidad: 1 }],
      });

      assert.equal(status, 400);
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      assert.ok(
        json.error.details.some(
          (d) => d.campo === 'datosDeliveryJson' && /20 claves/i.test(d.mensaje),
        ),
        `Se esperaba error de máximo de claves en datosDeliveryJson, recibido: ${JSON.stringify(json.error.details)}`,
      );
    });

    it('rechaza con HTTP 400 datosDeliveryJson con profundidad mayor a 2 niveles', async () => {
      const { status, json } = await postConfirmarVenta({
        tipoServicio: TipoServicio.DELIVERY,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 50,
        datosDeliveryJson: {
          nivel1: {
            nivel2: {
              nivel3: 'profundidad-invalida',
            },
          },
        },
        items: [{ platilloId: platilloHttpId, cantidad: 1 }],
      });

      assert.equal(status, 400);
      assert.equal(json.ok, false);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      assert.ok(
        json.error.details.some(
          (d) => d.campo === 'datosDeliveryJson' && /profundidad máxima/i.test(d.mensaje),
        ),
        `Se esperaba error de profundidad máxima en datosDeliveryJson, recibido: ${JSON.stringify(json.error.details)}`,
      );
    });
  });

  // =========================================================================
  // 6 y 7. Flujo completo de MESA + Anulación con reintegro + Doble anulación prohibida
  // =========================================================================
  it('ocupa mesa al vender en MESA, la libera y reintegra stock al anular, y prohíbe doble anulación (409)', async () => {
    const ing = await crearIngredienteTemporal('MESA', 12);
    const platillo = await crearPlatilloTemporal('MESA', ing.id, 4, 65);

    // Crear mesa temporal en estado DISPONIBLE para no interferir con mesas reales
    const mesaTemp = await Mesa.create({
      sucursalId: adminUser.sucursalId,
      numero: `QA-${RUN_TAG}`.slice(0, 20),
      capacidad: 4,
      estado: EstadoMesa.DISPONIBLE,
      activa: true,
    });
    mesasTemporalesIds.push(mesaTemp.id);

    // 1) Confirmar venta en MESA -> mesa pasa a OCUPADA y stock baja de 12 a 8 oz
    const ventaMesa = await VentasService.confirmarVenta(
      adminUser,
      {
        tipoServicio: TipoServicio.MESA,
        mesaId: mesaTemp.id,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 100,
        items: [{ platilloId: platillo.id, cantidad: 1 }],
      },
      CLIENT_META,
    );

    const mesaOcupada = await Mesa.findByPk(mesaTemp.id);
    assert.equal(mesaOcupada.estado, EstadoMesa.OCUPADA);
    assert.equal(await leerStockOz(ing.id), 8);

    // 2) Anular factura con reintegrarInventario: true -> libera mesa y devuelve las 4 oz
    const anulacion = await FacturasService.anular(
      adminUser,
      ventaMesa.factura.id,
      {
        motivo: `Anulación QA flujo mesa ${RUN_TAG}`,
        reintegrarInventario: true,
      },
      CLIENT_META,
    );

    assert.equal(anulacion.factura.estado, EstadoFactura.ANULADA);
    assert.equal(anulacion.mesaLiberada, true);
    assert.equal(anulacion.ingredientesReintegrados, 1);

    const mesaLiberada = await Mesa.findByPk(mesaTemp.id);
    assert.equal(mesaLiberada.estado, EstadoMesa.DISPONIBLE);
    assert.equal(await leerStockOz(ing.id), 12);

    // 3) Doble anulación prohibida -> debe lanzar ConflictError (409)
    await assert.rejects(
      () =>
        FacturasService.anular(
          adminUser,
          ventaMesa.factura.id,
          {
            motivo: 'Intento de segunda anulación',
            reintegrarInventario: false,
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /ya se encuentra anulada/i);
        return true;
      },
    );
  });

  // =========================================================================
  // 8. Merma y ajuste de salida no pueden superar el stock disponible
  // =========================================================================
  it('valida y registra mermas concurrentes sin duplicar el descuento ni perder el Kardex', async (t) => {
    const ingrediente = await crearIngredienteTemporal('MERMA-TX', 10);
    const datos = {
      ingredienteId: ingrediente.id,
      unidad: UnidadMedida.oz,
      cantidad: 4,
      motivo: MotivoMerma.DANO,
    };
    const enviar = (payload) => fetch(`${API_BASE_URL}/mermas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify(payload),
    });
    for (const cantidad of [true, 0, -1, 0.00001, 1000000]) {
      const res = await enviar({ ...datos, cantidad });
      assert.equal(res.status, 400, `Cantidad inválida: ${cantidad}`);
    }
    assert.equal((await enviar({ ...datos, ingredienteId: true })).status, 400);
    assert.equal((await enviar({ ...datos, fecha: '2026-02-30' })).status, 400);

    const auditoria = t.mock.method(AuditService, 'registrar', async () => {
      throw new Error('Fallo controlado al escribir auditoría');
    });
    try {
      await assert.rejects(
        MermasService.registrar(adminUser, datos, CLIENT_META),
        /Fallo controlado al escribir auditoría/,
      );
    } finally {
      auditoria.mock.restore();
    }
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), 10);
    assert.equal(await Merma.count({ where: { ingredienteId: ingrediente.id } }), 0);
    assert.equal(await InventarioMovimiento.count({
      where: { ingredienteId: ingrediente.id, referenciaTipo: 'MERMA' },
    }), 0);

    const idempotencyKey = crypto.randomUUID();
    const duplicadas = await Promise.all([
      enviar({ ...datos, idempotencyKey }),
      enviar({ ...datos, idempotencyKey }),
    ]);
    assert.deepEqual(duplicadas.map((res) => res.status), [201, 201]);
    const [primera, repetida] = await Promise.all(duplicadas.map((res) => res.json()));
    assert.equal(primera.data.id, repetida.data.id);
    assert.equal((await enviar({ ...datos, cantidad: 1, idempotencyKey })).status, 409);

    const salidas = await Promise.all([enviar(datos), enviar(datos)]);
    assert.deepEqual(salidas.map((res) => res.status).sort(), [201, 400]);
    const mermas = await Merma.findAll({ where: { ingredienteId: ingrediente.id } });
    const movimientos = await InventarioMovimiento.findAll({
      where: { ingredienteId: ingrediente.id, referenciaTipo: 'MERMA' },
      order: [['id', 'ASC']],
    });
    assert.equal(mermas.length, 2);
    assert.equal(movimientos.length, 2);
    assert.deepEqual(movimientos.map((m) => [m.cantidadOz, m.stockAnteriorOz, m.stockNuevoOz].map(Number)),
      [[-4, 10, 6], [-4, 6, 2]]);
    assert.equal(Number((await Ingrediente.findByPk(ingrediente.id)).stockActualOz), 2);
    assert.equal(await AuditoriaLog.count({
      where: { entidad: 'Merma', entidadId: mermas.map((m) => String(m.id)) },
    }), 2);
    await assert.rejects(
      sequelize.query('UPDATE inventario_movimientos SET stock_nuevo_oz = stock_anterior_oz WHERE id = :id', {
        replacements: { id: movimientos[0].id },
      }),
      (error) => getPgErrorCode(error) === '23514',
    );
  });

  it('impide registrar merma o ajuste de salida mayor al stock disponible (BadRequestError 400)', async () => {
    const ing = await crearIngredienteTemporal('MRM', 5);

    // Merma de 6 oz sobre 5 oz disponibles -> BadRequestError (400)
    await assert.rejects(
      () =>
        MermasService.registrar(
          adminUser,
          {
            ingredienteId: ing.id,
            cantidad: 6,
            unidad: UnidadMedida.oz,
            motivo: MotivoMerma.DANO,
            observacion: 'Prueba QA exceso de merma',
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /supera las existencias actuales/i);
        return true;
      },
    );
    assert.equal(await leerStockOz(ing.id), 5);

    // Ajuste de salida de 6 oz sobre 5 oz disponibles -> BadRequestError (400)
    await assert.rejects(
      () =>
        InventarioService.ajustarStock(
          adminUser,
          ing.id,
          {
            tipoAjuste: 'SALIDA',
            cantidad: 6,
            unidad: UnidadMedida.oz,
            motivo: 'Prueba QA ajuste excesivo',
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof BadRequestError);
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /stock negativo/i);
        return true;
      },
    );
    assert.equal(await leerStockOz(ing.id), 5);
  });

  // =========================================================================
  // 9. Doble apertura de caja prohibida (Fase 1.2)
  // =========================================================================
  it('impide abrir una segunda caja cuando ya existe una abierta en la sucursal (ConflictError 409)', async () => {
    await assert.rejects(
      () =>
        CajaService.abrirCaja(
          adminUser,
          { montoInicial: 250, observaciones: 'Intento doble apertura QA' },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Ya existe una caja abierta/i);
        return true;
      },
    );
  });

  // =========================================================================
  // 10. Reglas de autenticación y no-enumeración de cuentas (Fase 2.2)
  // =========================================================================
  it('cumple reglas de autenticación Fase 2.2 sin revelar estado de cuenta con contraseña incorrecta', async () => {
    const claveValida = 'QaTemporal#2026!';
    const passwordHash = await bcrypt.hash(claveValida, 10);

    const usuarioInactivo = await Usuario.create({
      sucursalId: adminUser.sucursalId,
      rolId: adminUser.rolId,
      nombreCompleto: `Usuario QA Inactivo ${RUN_TAG}`,
      username: `qa_inactivo_${RUN_TAG.toLowerCase()}`,
      email: `qa_inactivo_${RUN_TAG.toLowerCase()}@pos.local`,
      passwordHash,
      activo: false,
    });
    usuariosTemporalesIds.push(usuarioInactivo.id);

    // Usuario activo temporal: evita sumar intentos fallidos (y bloquear) al admin real del seed
    const usuarioActivo = await Usuario.create({
      sucursalId: adminUser.sucursalId,
      rolId: adminUser.rolId,
      nombreCompleto: `Usuario QA Activo ${RUN_TAG}`,
      username: `qa_activo_${RUN_TAG.toLowerCase()}`,
      email: `qa_activo_${RUN_TAG.toLowerCase()}@pos.local`,
      passwordHash,
      activo: true,
    });
    usuariosTemporalesIds.push(usuarioActivo.id);

    // 10a. Usuario inexistente -> "Credenciales inválidas"
    await assert.rejects(
      () => AuthService.login(`no_existe_${RUN_TAG.toLowerCase()}`, 'Clave123!', CLIENT_META),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Credenciales inválidas');
        return true;
      },
    );

    // 10b. Usuario activo existente + contraseña incorrecta -> "Credenciales inválidas"
    await assert.rejects(
      () => AuthService.login(usuarioActivo.username, 'ClaveTotalmenteErronea#999', CLIENT_META),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Credenciales inválidas');
        return true;
      },
    );

    // 10c. Usuario desactivado + contraseña incorrecta -> "Credenciales inválidas" (NO revela estado)
    await assert.rejects(
      () => AuthService.login(usuarioInactivo.username, 'ClaveIncorrecta#000', CLIENT_META),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.message, 'Credenciales inválidas');
        return true;
      },
    );

    // 10d. Usuario desactivado + contraseña correcta -> revela que la cuenta está desactivada
    await assert.rejects(
      () => AuthService.login(usuarioInactivo.username, claveValida, CLIENT_META),
      (err) => {
        assert.ok(err instanceof UnauthorizedError);
        assert.equal(err.statusCode, 401);
        assert.match(err.message, /Tu cuenta se encuentra desactivada/i);
        return true;
      },
    );
  });

  // =========================================================================
  // 11. Caja cerrada en venta/anulación y doble apertura concurrente (Fase 4.1)
  // =========================================================================
  it('rechaza confirmarVenta y anular sin caja abierta y controla doble apertura concurrente (409)', async () => {
    // Crear sucursal temporal aislada para probar caja cerrada y apertura concurrente sin tocar la sucursal principal
    const sucTemp = await Sucursal.create({
      codigo: `ST-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal QA ${RUN_TAG}`,
      nit: 'CF',
      direccion: 'Ciudad de Guatemala',
      serieFactura: 'T',
      activa: true,
    });
    const userSucTemp = { ...adminUser, sucursalId: sucTemp.id };

    try {
      const ing = await crearIngredienteTemporal('CAJC', 10);
      const platillo = await crearPlatilloTemporal('CAJC', ing.id, 2, 40);

      // 12a. confirmarVenta con caja cerrada -> BadRequestError (400)
      await assert.rejects(
        () =>
          VentasService.confirmarVenta(
            userSucTemp,
            {
              tipoServicio: TipoServicio.MOSTRADOR,
              metodoPago: MetodoPago.EFECTIVO,
              montoRecibido: 50,
              items: [{ platilloId: platillo.id, cantidad: 1 }],
            },
            CLIENT_META,
          ),
        (err) => {
          assert.ok(err instanceof BadRequestError);
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /sin caja abierta/i);
          return true;
        },
      );

      // 12b. anular factura sin caja abierta -> BadRequestError (400)
      await assert.rejects(
        () =>
          FacturasService.anular(
            userSucTemp,
            999999,
            { motivo: 'Prueba anulación sin caja abierta', reintegrarInventario: false },
            CLIENT_META,
          ),
        (err) => {
          assert.ok(err instanceof BadRequestError);
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /sin una caja abierta/i);
          return true;
        },
      );

      // 12c. Doble apertura concurrente sobre la misma sucursal -> exactamente 1 éxito y 2 ConflictError (409)
      const resultados = await Promise.allSettled([
        CajaService.abrirCaja(userSucTemp, { montoInicial: 250 }, CLIENT_META),
        CajaService.abrirCaja(userSucTemp, { montoInicial: 250 }, CLIENT_META),
        CajaService.abrirCaja(userSucTemp, { montoInicial: 250 }, CLIENT_META),
      ]);

      const exitosas = resultados.filter((r) => r.status === 'fulfilled');
      const rechazadas = resultados.filter((r) => r.status === 'rejected');
      assert.equal(exitosas.length, 1, 'Solo una apertura concurrente puede triunfar');
      assert.equal(rechazadas.length, 2, 'Las aperturas simultáneas restantes deben rechazarse');
      for (const r of rechazadas) {
        assert.ok(r.reason instanceof ConflictError);
        assert.equal(r.reason.statusCode, 409);
      }
    } finally {
      await sucTemp.update({ activa: false });
    }
  });
});
