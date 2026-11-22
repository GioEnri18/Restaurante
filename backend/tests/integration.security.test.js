const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

const {
  connectDatabase,
  disconnectDatabase,
  sequelize,
  withTransaction,
} = require('../src/config/database');
const { env } = require('../src/config/env');
const { PLATILLOS_MEDIA_DIR } = require('../src/config/platillos-media');
const { cargarMenuBase } = require('../src/database/cargar-menu-base');
const {
  CajaSesion,
  Categoria,
  EstadoCaja,
  Ingrediente,
  MetodoPago,
  Permiso,
  Platillo,
  Rol,
  Sucursal,
  TipoServicio,
  UnidadMedida,
  Usuario,
  UsuarioPermiso,
  Venta,
} = require('../src/models');
const { obtenerPermisosEfectivos } = require('../src/services/permisos.service');
const { AuthService } = require('../src/services/auth.service');
const { CajaService } = require('../src/services/caja.service');
const { InventarioService } = require('../src/services/inventario.service');
const { VentasService } = require('../src/services/ventas.service');
const {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} = require('../src/shared/errors/AppError');

/**
 * Pruebas de las correcciones de la auditoría de seguridad:
 * P0.1 aislamiento por sucursal, P0.2 login/bloqueo, P0.3 revocación de JWT,
 * P0.4 post-commit seguro y P1 validación de query params / :id / contraseñas.
 * Requiere la API levantada en env.PORT (igual que la suite de reglas de negocio).
 */

const API_BASE_URL = `http://localhost:${env.PORT}${env.API_PREFIX}`;
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-security-suite/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();
const CLAVE_QA = 'QaSeguridad2026';

describe('Correcciones de auditoría de seguridad (PostgreSQL + API HTTP)', () => {
  let adminUser;
  let adminJwt;
  let categoriaId;
  let sucursalAjena;
  const ingredientesTemporalesIds = [];
  const platillosTemporalesIds = [];
  const usuariosTemporalesIds = [];

  async function apiGet(path, token = adminJwt) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  }

  async function crearUsuarioTemporal(sufijo) {
    const usuario = await Usuario.create({
      sucursalId: adminUser.sucursalId,
      rolId: adminUser.rolId,
      nombreCompleto: `Usuario QA Seguridad ${sufijo} ${RUN_TAG}`,
      username: `qa_sec_${sufijo}_${RUN_TAG}`.toLowerCase(),
      email: `qa_sec_${sufijo}_${RUN_TAG}@pos.local`.toLowerCase(),
      passwordHash: await bcrypt.hash(CLAVE_QA, 10),
      activo: true,
    });
    usuariosTemporalesIds.push(usuario.id);
    return usuario;
  }

  before(async () => {
    await connectDatabase();

    const adminDb = await Usuario.findOne({
      where: { activo: true },
      include: [
        { model: Rol, as: 'rol', where: { codigo: env.ADMIN_ROLE_CODE, activo: true } },
        { model: Sucursal, as: 'sucursal', where: { activa: true } },
      ],
      order: [['id', 'ASC']],
    });
    assert.ok(adminDb, 'Debe existir un administrador activo (ejecuta npm run db:seed)');

    adminUser = {
      id: adminDb.id,
      username: adminDb.username,
      sucursalId: adminDb.sucursalId,
      rolId: adminDb.rolId,
      rolCodigo: adminDb.rol.codigo,
      permisos: await obtenerPermisosEfectivos(adminDb.id, adminDb.rolId),
    };
    adminJwt = jwt.sign(
      { sub: adminDb.id, ver: adminDb.tokenVersion, sucursalId: adminDb.sucursalId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );

    const categoria = await Categoria.findOne({ where: { activa: true }, order: [['id', 'ASC']] });
    assert.ok(categoria, 'Debe existir una categoría activa');
    categoriaId = categoria.id;

    // Sucursal ajena (queda inactiva al final; las FK RESTRICT impiden borrarla)
    sucursalAjena = await Sucursal.create({
      codigo: `QA-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal QA ajena ${RUN_TAG}`,
      nit: 'CF',
      direccion: 'Sucursal temporal de pruebas',
      serieFactura: 'QA',
    });
  });

  after(async () => {
    if (platillosTemporalesIds.length) {
      await Platillo.update(
        { activo: false, disponible: false },
        { where: { id: platillosTemporalesIds } },
      );
    }
    if (ingredientesTemporalesIds.length) {
      await Ingrediente.update({ activo: false }, { where: { id: ingredientesTemporalesIds } });
    }
    if (usuariosTemporalesIds.length) {
      await Usuario.update({ activo: false }, { where: { id: usuariosTemporalesIds } });
    }
    if (sucursalAjena) {
      await Sucursal.update({ activa: false }, { where: { id: sucursalAjena.id } });
    }
    await disconnectDatabase();
  });

  // ---------------------------------------------------------------------------
  // P0.1 Aislamiento por sucursal
  // ---------------------------------------------------------------------------
  it('P0.1 rechaza crear un platillo con un ingrediente de otra sucursal (404)', async () => {
    const ingredienteAjeno = await Ingrediente.create({
      sucursalId: sucursalAjena.id,
      codigo: `QAX-${RUN_TAG}`.slice(0, 30),
      nombre: `Ingrediente ajeno ${RUN_TAG}`,
      stockActualOz: 100,
      costoPromedioOz: 3,
    });
    ingredientesTemporalesIds.push(ingredienteAjeno.id);

    await assert.rejects(
      () =>
        VentasService.crearPlatillo(
          adminUser,
          {
            categoriaId,
            sku: `QAS-X-${RUN_TAG}`.slice(0, 30),
            nombre: `Platillo con ingrediente ajeno ${RUN_TAG}`,
            precioVenta: 50,
            receta: [{ ingredienteId: ingredienteAjeno.id, cantidadOz: 2 }],
          },
          CLIENT_META,
        ),
      (err) => {
        assert.ok(err instanceof NotFoundError);
        assert.match(err.message, /ingredientes de la receta no existen en esta sucursal/i);
        return true;
      },
    );
    const creado = await Platillo.findOne({ where: { sku: `QAS-X-${RUN_TAG}`.slice(0, 30) } });
    assert.equal(creado, null, 'El rollback debe impedir que el platillo quede creado');
  });

  it('P0.1 oculta el costo de receta a usuarios sin permisos de inventario, menú o reportes', async () => {
    const ing = await InventarioService.crearIngrediente(
      adminUser,
      {
        codigo: `QAC-${RUN_TAG}`.slice(0, 30),
        nombre: `Ingrediente costo ${RUN_TAG}`,
        stockMinimo: 1,
        unidadStockMinimo: UnidadMedida.oz,
        stockInicial: 50,
        unidadStockInicial: UnidadMedida.oz,
        precioPorLb: 32,
      },
      CLIENT_META,
    );
    ingredientesTemporalesIds.push(ing.id);
    const platillo = await VentasService.crearPlatillo(
      adminUser,
      {
        categoriaId,
        sku: `QAS-C-${RUN_TAG}`.slice(0, 30),
        nombre: `Platillo costo ${RUN_TAG}`,
        precioVenta: 40,
        receta: [{ ingredienteId: ing.id, cantidadOz: 2 }],
      },
      CLIENT_META,
    );
    platillosTemporalesIds.push(platillo.id);

    const buscar = `Platillo costo ${RUN_TAG}`;
    const menuAdmin = await VentasService.obtenerMenu(adminUser, buscar);
    const menuMesero = await VentasService.obtenerMenu(
      { sucursalId: adminUser.sucursalId, permisos: ['ventas:ver', 'ventas:crear'] },
      buscar,
    );
    const pAdmin = menuAdmin.platillos.find((p) => p.id === platillo.id);
    const pMesero = menuMesero.platillos.find((p) => p.id === platillo.id);
    assert.ok(pAdmin && pMesero, 'El platillo debe aparecer en ambos menús');
    assert.equal(pAdmin.costoReceta, 4, 'Admin ve el costo: 2 oz x Q2.00');
    assert.equal(pMesero.costoReceta, null, 'Un rol solo de ventas no debe ver costos');
    assert.equal(pMesero.stockDisponible, true);
  });

  // ---------------------------------------------------------------------------
  it('comprime fotos del administrador, publica WebP y limpia el archivo reemplazado', async (t) => {
    const platillo = await VentasService.crearPlatillo(adminUser, {
      categoriaId,
      sku: `QAS-F-${RUN_TAG}`,
      nombre: `Platillo foto ${RUN_TAG}`,
      precioVenta: 20,
    }, CLIENT_META);
    platillosTemporalesIds.push(platillo.id);
    const fotos = [];
    t.after(async () => {
      await Platillo.update({ imagenUrl: null }, { where: { id: platillo.id } });
      for (const url of fotos) {
        await fs.rm(path.join(PLATILLOS_MEDIA_DIR, path.basename(url)), { force: true });
      }
    });

    const subir = (archivo, token) => {
      const body = new FormData();
      body.set('imagen', new Blob([archivo], { type: 'image/png' }), 'foto.png');
      return fetch(`${API_BASE_URL}/ventas/platillos/${platillo.id}/imagen`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
    };
    const abrir = (url) => fetch(new URL(url, API_BASE_URL));
    const verificarSubida = async (archivo, ladoMaximo) => {
      const response = await subir(archivo, adminJwt);
      const resultado = await response.json();
      assert.equal(response.status, 200, JSON.stringify(resultado));
      const { imagenUrl, bytes } = resultado.data;
      assert.match(imagenUrl, /^\/media\/platillos\/[a-f0-9-]+\.webp$/);
      fotos.push(imagenUrl);
      const foto = await abrir(imagenUrl);
      assert.equal(foto.status, 200);
      assert.equal(foto.headers.get('content-type'), 'image/webp');
      const webp = Buffer.from(await foto.arrayBuffer());
      assert.equal(webp.length, bytes);
      assert.ok(bytes <= 10000);
      const { width, height, format } = await sharp(webp).metadata();
      assert.equal(format, 'webp');
      assert.ok(Math.max(width, height) <= ladoMaximo);
      assert.equal((await Platillo.findByPk(platillo.id)).imagenUrl, imagenUrl);
      const menu = await apiGet('/ventas/menu');
      assert.equal(menu.status, 200);
      assert.equal(menu.json.data.platillos.find((p) => p.id === platillo.id).imagenUrl, imagenUrl);
      return imagenUrl;
    };

    const rgb = { width: 1100, height: 800, channels: 3 };
    const original = await sharp(crypto.randomBytes(rgb.width * rgb.height * rgb.channels), { raw: rgb })
      .png().toBuffer();
    assert.equal((await subir(original)).status, 401);
    const cajero = await Usuario.findOne({
      where: { sucursalId: adminUser.sucursalId, activo: true },
      include: [{ model: Rol, as: 'rol', where: { codigo: 'CAJERO' } }],
    });
    assert.ok(cajero, 'Debe existir un cajero activo en los datos de prueba');
    const cajeroJwt = jwt.sign(
      { sub: cajero.id, ver: cajero.tokenVersion, sucursalId: cajero.sucursalId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
    assert.equal((await subir(original, cajeroJwt)).status, 403);
    const primerUrl = await verificarSubida(original, 480);
    assert.equal((await subir(Buffer.from('archivo de texto'), adminJwt)).status, 400);
    assert.equal((await subir(Buffer.alloc(5000000), adminJwt)).status, 400);
    assert.equal((await subir(Buffer.alloc(5000001), adminJwt)).status, 413);
    assert.equal((await abrir(primerUrl)).status, 200);

    const miniatura = await sharp({
      create: { width: 80, height: 40, channels: 3, background: 'orange' },
    }).png().toBuffer();
    assert.notEqual(await verificarSubida(miniatura, 80), primerUrl);
    assert.equal((await abrir(primerUrl)).status, 404);
  });

  it('precarga el menú base al crear una sucursal y conserva las ediciones al repetir la carga', async () => {
    const borradores = await Platillo.findAll({ where: { sucursalId: sucursalAjena.id } });
    platillosTemporalesIds.push(...borradores.map((p) => p.id));
    assert.equal(borradores.length, 35);
    assert.ok(borradores.every((p) => p.precioVenta === null && !p.disponible));
    const fotos = [...new Set(borradores.map((p) => p.imagenUrl))];
    // Una foto propia por platillo (migración 20261122000007)
    assert.equal(fotos.length, 35);
    const fotoDe = (sku) => borradores.find((p) => p.sku === sku).imagenUrl;
    assert.match(fotoDe('BX-23'), /000000000032\.webp$/, 'Jamaica con su propia foto');
    assert.match(fotoDe('BX-29'), /000000000038\.webp$/, 'Coca-Cola lata con su propia foto');
    assert.match(fotoDe('BX-18-P'), /000000000022\.webp$/, 'La cajita de deditos conserva la foto del documento');
    for (const url of fotos) {
      const foto = await fetch(new URL(url, API_BASE_URL));
      assert.equal(foto.status, 200);
      assert.equal(foto.headers.get('content-type'), 'image/webp');
      assert.ok((await foto.arrayBuffer()).byteLength <= 10000);
    }

    const camarones = borradores.find((p) => p.sku === 'BX-01');
    const vista = await VentasService.obtenerMenu({
      ...adminUser, sucursalId: sucursalAjena.id,
    });
    const producto = vista.platillos.find((p) => p.id === camarones.id);
    assert.equal(producto.disponible, false);
    assert.equal(producto.imagenUrl, camarones.imagenUrl);
    const insumo = producto.receta.find((r) => r.ingredienteNombre === 'Camarón limpio');
    assert.equal(insumo.cantidadOz, 5.1147);

    // El agua (consomé y bebidas naturales) no es un insumo de inventario: si lo fuera, su stock
    // siempre en 0 haría que esas ventas se rechazaran por "Inventario insuficiente".
    const conAgua = vista.platillos.filter((p) =>
      p.receta.some((r) => r.ingredienteNombre.trim().toLowerCase() === 'agua'),
    );
    assert.deepEqual(conAgua.map((p) => p.sku), [], 'Ninguna receta BX debe descontar agua del inventario');
    const jamaica = vista.platillos.find((p) => p.sku === 'BX-23');
    assert.deepEqual(
      jamaica.receta.map((r) => r.ingredienteNombre).sort(),
      ['Azúcar', 'Flor de jamaica seca'],
    );

    await camarones.update({ nombre: 'Camarones editados en la sucursal' });
    assert.equal(await cargarMenuBase(sucursalAjena.codigo), 0);
    assert.equal((await camarones.reload()).nombre, 'Camarones editados en la sucursal');
    assert.equal(await Platillo.count({ where: { sucursalId: sucursalAjena.id } }), 35);
  });

  // ---------------------------------------------------------------------------
  // Sucursal ajena con caja propia: idempotencia, cierre concurrente y alcance de platillos
  // (usa otra sucursal para no cerrar la caja que usa la suite de reglas de negocio en paralelo)
  // ---------------------------------------------------------------------------
  describe('Sucursal ajena con caja propia', () => {
    let usuarioAjeno;
    let platilloAjeno;

    before(async () => {
      const dbUser = await Usuario.create({
        sucursalId: sucursalAjena.id,
        rolId: adminUser.rolId,
        nombreCompleto: `Cajero QA sucursal ajena ${RUN_TAG}`,
        username: `qa_sec_ajeno_${RUN_TAG}`.toLowerCase(),
        email: `qa_sec_ajeno_${RUN_TAG}@pos.local`.toLowerCase(),
        passwordHash: await bcrypt.hash(CLAVE_QA, 10),
      });
      usuariosTemporalesIds.push(dbUser.id);
      usuarioAjeno = { id: dbUser.id, sucursalId: sucursalAjena.id, permisos: adminUser.permisos };

      const ing = await Ingrediente.create({
        sucursalId: sucursalAjena.id,
        codigo: `QAY-${RUN_TAG}`.slice(0, 30),
        nombre: `Ingrediente sucursal ajena ${RUN_TAG}`,
        stockActualOz: 500,
        costoPromedioOz: 1,
      });
      ingredientesTemporalesIds.push(ing.id);
      const categoriaAjena = await Categoria.create({
        sucursalId: sucursalAjena.id,
        nombre: `Categoría QA ajena ${RUN_TAG}`,
      });
      platilloAjeno = await VentasService.crearPlatillo(
        usuarioAjeno,
        {
          categoriaId: categoriaAjena.id,
          sku: `QAS-Y-${RUN_TAG}`.slice(0, 30),
          nombre: `Platillo sucursal ajena ${RUN_TAG}`,
          precioVenta: 30,
          receta: [{ ingredienteId: ing.id, cantidadOz: 1 }],
        },
        CLIENT_META,
      );
      platillosTemporalesIds.push(platilloAjeno.id);
      await CajaService.abrirCaja(usuarioAjeno, { montoInicial: 100 }, CLIENT_META);
    });

    after(async () => {
      await CajaSesion.update(
        { estado: EstadoCaja.CERRADA, fechaCierre: new Date() },
        { where: { sucursalId: sucursalAjena.id, estado: EstadoCaja.ABIERTA } },
      );
    });

    function pedido(idempotencyKey, cantidad = 1) {
      return {
        idempotencyKey,
        tipoServicio: TipoServicio.MOSTRADOR,
        metodoPago: MetodoPago.EFECTIVO,
        montoRecibido: 1000,
        items: [{ platilloId: platilloAjeno.id, cantidad }],
      };
    }

    it('P0.1 el menú y la edición de platillos respetan la sucursal del usuario', async () => {
      const menuAdmin = await VentasService.obtenerMenu(adminUser, `Platillo sucursal ajena ${RUN_TAG}`);
      assert.equal(menuAdmin.platillos.length, 0, 'El admin no debe ver platillos de otra sucursal');

      await assert.rejects(
        () => VentasService.actualizarPlatillo(adminUser, platilloAjeno.id, { precioVenta: 1 }, CLIENT_META),
        (err) => err instanceof NotFoundError,
      );
      const sinCambio = await Platillo.findByPk(platilloAjeno.id);
      assert.equal(Number(sinCambio.precioVenta), 30);
    });

    it('P0 idempotencia: misma clave y pedido devuelve la venta original; otro pedido responde 409', async () => {
      const clave = crypto.randomUUID();
      const primera = await VentasService.confirmarVenta(usuarioAjeno, pedido(clave), CLIENT_META);
      const reintento = await VentasService.confirmarVenta(usuarioAjeno, pedido(clave), CLIENT_META);
      assert.equal(reintento.factura.id, primera.factura.id, 'El reintento no debe duplicar la venta');

      // Otro pedido, u otros datos de pago, con la misma clave: 409 que señala la factura registrada
      const variantes = [
        ['otra cantidad', pedido(clave, 2)],
        ['otro efectivo recibido', { ...pedido(clave), montoRecibido: 500 }],
        ['otro método de pago', { ...pedido(clave), metodoPago: MetodoPago.TARJETA, referenciaPago: 'AUT-123' }],
      ];
      for (const [caso, payload] of variantes) {
        await assert.rejects(
          () => VentasService.confirmarVenta(usuarioAjeno, payload, CLIENT_META),
          (err) =>
            err instanceof ConflictError &&
            err.message.includes(primera.factura.numeroCompleto) &&
            err.details?.facturaId === primera.factura.id,
          `${caso}: debe responder 409 con la factura ya registrada`,
        );
      }
      // Espacios alrededor de la referencia no cambian el cobro
      const conEspacios = await VentasService.confirmarVenta(
        usuarioAjeno,
        { ...pedido(clave), referenciaPago: '  ' },
        CLIENT_META,
      );
      assert.equal(conEspacios.factura.id, primera.factura.id);

      const ventas = await Venta.count({ where: { sucursalId: sucursalAjena.id, idempotencyKey: clave } });
      assert.equal(ventas, 1);
    });

    it('P0 arqueo: una venta que espera al cierre de caja se rechaza y no queda fuera del cuadre', async () => {
      const caja = await CajaSesion.findOne({
        where: { sucursalId: sucursalAjena.id, estado: EstadoCaja.ABIERTA },
      });
      assert.ok(caja, 'La sucursal ajena debe tener caja abierta');

      // Simula un cierre en curso: transacción que bloquea la fila de caja (igual que cerrarCaja)
      const tx = await sequelize.transaction();
      await CajaSesion.findOne({ where: { id: caja.id }, lock: tx.LOCK.UPDATE, transaction: tx });

      const clave = crypto.randomUUID();
      const ventaConcurrente = VentasService.confirmarVenta(usuarioAjeno, pedido(clave), CLIENT_META);
      // Dar tiempo a que la venta quede esperando el bloqueo de la caja
      await new Promise((resolve) => setTimeout(resolve, 400));

      await CajaSesion.update(
        { estado: EstadoCaja.CERRADA, fechaCierre: new Date() },
        { where: { id: caja.id }, transaction: tx },
      );
      await tx.commit();

      await assert.rejects(ventaConcurrente, (err) => /sin caja abierta/i.test(err.message));
      const registrada = await Venta.count({ where: { idempotencyKey: clave } });
      assert.equal(registrada, 0, 'La venta no debe registrarse en una caja ya cerrada');
    });
  });

  // ---------------------------------------------------------------------------
  // CSRF alineado con la credencial que usa authenticate
  // ---------------------------------------------------------------------------
  it('CSRF: con cookie de sesión exige X-Requested-With y un Bearer falso no habilita la cookie', async () => {
    const cookie = `${env.AUTH_COOKIE_NAME}=${adminJwt}`;

    // Cookie sin encabezado anti-CSRF -> 403 (no se ejecuta el logout)
    const sinHeader = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(sinHeader.status, 403);

    // Cookie válida + Bearer basura: antes se saltaba CSRF y se autenticaba con la cookie.
    // Ahora la credencial es el Bearer (inválido) -> 401 y la sesión de la cookie no se usa.
    const bearerFalso = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, Authorization: 'Bearer no-es-un-token' },
    });
    assert.equal(bearerFalso.status, 401);
  });

  // ---------------------------------------------------------------------------
  // P0.2 Login exacto y bloqueo por intentos fallidos
  // ---------------------------------------------------------------------------
  it('P0.2 no trata % ni _ como comodines en el identificador de login', async () => {
    const usuario = await crearUsuarioTemporal('wild');
    const comodin = `${usuario.username.slice(0, 6)}%`;
    await assert.rejects(
      () => AuthService.login(comodin, CLAVE_QA, CLIENT_META),
      (err) => err instanceof UnauthorizedError && err.message === 'Credenciales inválidas',
    );
    // El login exacto sí funciona e ignora mayúsculas
    const ok = await AuthService.login(usuario.username.toUpperCase(), CLAVE_QA, CLIENT_META);
    assert.equal(ok.usuario.id, usuario.id);
  });

  it('P0.2 bloquea la cuenta tras N contraseñas incorrectas sin revelarlo a quien no conoce la clave', async () => {
    const usuario = await crearUsuarioTemporal('lock');
    for (let i = 0; i < env.AUTH_LOCKOUT_MAX_ATTEMPTS; i++) {
      await assert.rejects(() => AuthService.login(usuario.username, 'ClaveErronea999', CLIENT_META));
    }
    const bloqueado = await Usuario.findByPk(usuario.id);
    assert.ok(bloqueado.bloqueadoHasta > new Date(), 'Debe quedar bloqueado_hasta en el futuro');

    // Contraseña incorrecta durante el bloqueo -> mensaje genérico
    await assert.rejects(
      () => AuthService.login(usuario.username, 'OtraClaveMala1', CLIENT_META),
      (err) => err.message === 'Credenciales inválidas',
    );
    // Contraseña correcta durante el bloqueo -> se informa el bloqueo, sin emitir token
    await assert.rejects(
      () => AuthService.login(usuario.username, CLAVE_QA, CLIENT_META),
      (err) => err instanceof UnauthorizedError && /bloqueada temporalmente/i.test(err.message),
    );
  });

  // ---------------------------------------------------------------------------
  // P0.3 Revocación de sesiones
  // ---------------------------------------------------------------------------
  it('P0.3 el logout revoca el JWT en el servidor y los tokens sin versión se rechazan', async () => {
    const usuario = await crearUsuarioTemporal('logout');
    const { token } = await AuthService.login(usuario.username, CLAVE_QA, CLIENT_META);

    const antes = await apiGet('/auth/me', token);
    assert.equal(antes.status, 200);

    const recargado = await Usuario.findByPk(usuario.id);
    await AuthService.logout({ id: usuario.id, sucursalId: usuario.sucursalId, username: usuario.username }, CLIENT_META);
    const despues = await apiGet('/auth/me', token);
    assert.equal(despues.status, 401, 'El token previo al logout debe quedar revocado');
    const tras = await Usuario.findByPk(usuario.id);
    assert.equal(tras.tokenVersion, recargado.tokenVersion + 1);

    const sinVersion = jwt.sign({ sub: usuario.id }, env.JWT_SECRET, { expiresIn: '5m' });
    assert.equal((await apiGet('/auth/me', sinVersion)).status, 401);

    const otroAlgoritmo = jwt.sign({ sub: usuario.id, ver: tras.tokenVersion }, env.JWT_SECRET, {
      expiresIn: '5m',
      algorithm: 'HS512',
    });
    assert.equal((await apiGet('/auth/me', otroAlgoritmo)).status, 401, 'Solo se acepta HS256');
  });

  // ---------------------------------------------------------------------------
  // Control dual de caja: el cajero no abre ni cierra solo
  // ---------------------------------------------------------------------------
  it('un cajero abre y cierra caja solo con usuario y contraseña de un supervisor', async () => {
    // Sucursal propia para no tocar la caja de las otras pruebas
    const sucursal = await Sucursal.create({
      codigo: `QA-CJ-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal QA caja dual ${RUN_TAG}`,
      nit: 'CF',
      direccion: 'Prueba de control dual',
      serieFactura: 'QC',
    });
    const rolCajero = await Rol.findOne({ where: { codigo: 'CAJERO' } });
    assert.ok(rolCajero, 'El seed debe crear el rol CAJERO');
    const hash = await bcrypt.hash(CLAVE_QA, 10);
    const crear = async (sufijo, rolId) => {
      const u = await Usuario.create({
        sucursalId: sucursal.id,
        rolId,
        nombreCompleto: `QA caja dual ${sufijo} ${RUN_TAG}`,
        username: `qa_cd_${sufijo}_${RUN_TAG}`.toLowerCase(),
        email: `qa_cd_${sufijo}_${RUN_TAG}@pos.local`.toLowerCase(),
        passwordHash: hash,
      });
      usuariosTemporalesIds.push(u.id);
      return u;
    };
    const cajeroDb = await crear('cajero', rolCajero.id);
    const otroCajero = await crear('cajero2', rolCajero.id);
    const supervisor = await crear('admin', adminUser.rolId);
    const cajero = {
      id: cajeroDb.id,
      username: cajeroDb.username,
      sucursalId: sucursal.id,
      permisos: await obtenerPermisosEfectivos(cajeroDb.id, rolCajero.id),
    };
    assert.ok(!cajero.permisos.includes('caja:autorizar'), 'El cajero no puede autorizarse');

    const abrir = (autorizacion) => CajaService.abrirCaja(cajero, { montoInicial: 300, autorizacion }, CLIENT_META);

    // Sin supervisor -> 400
    await assert.rejects(() => abrir(undefined), (e) => e.statusCode === 400 && /administrador o auditor/i.test(e.message));
    // Contraseña incorrecta -> 403 y suma intento fallido al supervisor
    await assert.rejects(
      () => abrir({ identifier: supervisor.username, password: 'ClaveIncorrecta99' }),
      (e) => e.statusCode === 403,
    );
    assert.equal((await Usuario.findByPk(supervisor.id)).intentosFallidos, 1);
    // Otro cajero no puede autorizar -> 403
    await assert.rejects(
      () => abrir({ identifier: otroCajero.username, password: CLAVE_QA }),
      (e) => e.statusCode === 403 && /no puede autorizar/i.test(e.message),
    );
    assert.equal(await CajaSesion.count({ where: { sucursalId: sucursal.id } }), 0, 'Ningún intento rechazado abre caja');

    // Con el administrador -> abre y registra quién autorizó
    const abierta = await abrir({ identifier: supervisor.username.toUpperCase(), password: CLAVE_QA });
    assert.equal(abierta.usuarioAutorizaAperturaId, supervisor.id);
    assert.equal(abierta.usuarioAperturaId, cajero.id);
    assert.equal((await Usuario.findByPk(supervisor.id)).intentosFallidos, 0, 'Un acierto reinicia los intentos');

    // Cierre: también exige supervisor
    await assert.rejects(
      () => CajaService.cerrarCaja(cajero, { montoContadoEfectivo: 300 }, CLIENT_META),
      (e) => e.statusCode === 400,
    );
    const cerrada = await CajaService.cerrarCaja(
      cajero,
      { montoContadoEfectivo: 300, autorizacion: { identifier: supervisor.email, password: CLAVE_QA } },
      CLIENT_META,
    );
    assert.equal(cerrada.usuarioAutorizaCierreId, supervisor.id);
    assert.equal(cerrada.estado, EstadoCaja.CERRADA);

    // Auditoría: rechazos registrados y apertura/cierre con el nombre del supervisor
    const { AuditoriaLog } = require('../src/models');
    const rechazos = await AuditoriaLog.count({
      where: { sucursalId: sucursal.id, accion: 'AUTORIZACION_CAJA_RECHAZADA' },
    });
    assert.equal(rechazos, 2, 'Contraseña incorrecta y cajero sin permiso quedan en auditoría');
    const apertura = await AuditoriaLog.findOne({ where: { sucursalId: sucursal.id, accion: 'APERTURA_CAJA' } });
    assert.equal(apertura.valorNuevo.autorizadoPor, supervisor.username);

    await Sucursal.update({ activa: false }, { where: { id: sucursal.id } });
  });

  // ---------------------------------------------------------------------------
  // P0.4 Post-commit seguro
  // ---------------------------------------------------------------------------
  it('P0.4 un fallo en el callback post-commit no convierte una operación confirmada en error', async () => {
    const resultado = await withTransaction(
      async () => 'confirmado',
      async () => {
        throw new Error('Fallo simulado de un servicio externo posterior al commit');
      },
    );
    assert.equal(resultado, 'confirmado');
  });

  it('/health/ready verifica PostgreSQL y las respuestas llevan X-Request-Id', async () => {
    const response = await fetch(`${API_BASE_URL}/health/ready`);
    const json = await response.json();
    assert.equal(response.status, 200);
    assert.equal(json.data.status, 'ready');
    assert.equal(json.data.database.ok, true);
    assert.match(response.headers.get('x-request-id') ?? '', /^[A-Za-z0-9._-]{8,64}$/);
  });

  // ---------------------------------------------------------------------------
  // Rendimiento y consistencia
  // ---------------------------------------------------------------------------
  it('las columnas TIMESTAMP sin zona se leen en UTC sin importar la zona del servidor', async () => {
    const [fila] = await sequelize.query("SELECT (NOW() AT TIME ZONE 'UTC') AS ahora_utc", {
      type: 'SELECT',
    });
    assert.ok(fila.ahora_utc instanceof Date);
    const desfaseMs = Math.abs(fila.ahora_utc.getTime() - Date.now());
    assert.ok(desfaseMs < 60_000, `La hora leída se desfasa ${Math.round(desfaseMs / 60000)} min`);
  });

  it('las búsquedas tratan % y _ del usuario como texto literal', async () => {
    const todos = await InventarioService.listarIngredientes(adminUser.sucursalId);
    assert.ok(todos.length > 0);
    const conComodin = await InventarioService.listarIngredientes(adminUser.sucursalId, '%');
    assert.equal(conComodin.length, 0, '"%" no debe coincidir con todos los ingredientes');
  });

  it('la caché de permisos se invalida al cambiar los permisos del usuario', async () => {
    const usuario = await crearUsuarioTemporal('cache');
    const { token } = await AuthService.login(usuario.username, CLAVE_QA, CLIENT_META);
    assert.equal((await apiGet('/reportes/resumen', token)).status, 200, 'Primera petición: llena la caché');

    // Quitar reportes:ver con un override de usuario: la siguiente petición debe reflejarlo ya
    const permiso = await Permiso.findOne({ where: { codigo: 'reportes:ver' } });
    const response = await fetch(`${API_BASE_URL}/accesos/usuarios/${usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({ permisosPersonalizados: [{ permisoId: permiso.id, permitido: false }] }),
    });
    assert.equal(response.status, 200);
    assert.equal((await apiGet('/reportes/resumen', token)).status, 403, 'El permiso revocado no debe seguir en caché');
  });

  // ---------------------------------------------------------------------------
  // Rol de base de datos de mínimo privilegio (pos_app_rol)
  // ---------------------------------------------------------------------------
  it('pos_app_rol no puede alterar la auditoría ni borrar ventas, facturas o caja', async () => {
    // SET LOCAL ROLE funciona tanto si la suite corre como dueño como si corre como pos_app_*
    async function comoRolApp(sql) {
      const tx = await sequelize.transaction();
      try {
        await sequelize.query('SET LOCAL ROLE pos_app_rol', { transaction: tx });
        await sequelize.query(sql, { transaction: tx });
        return null;
      } catch (error) {
        return error.parent?.code ?? error.original?.code ?? 'ERROR';
      } finally {
        await tx.rollback();
      }
    }

    const prohibidas = [
      'UPDATE auditoria_logs SET motivo = motivo',
      'DELETE FROM auditoria_logs',
      'TRUNCATE auditoria_logs',
      'DELETE FROM facturas',
      'DELETE FROM ventas',
      'DELETE FROM caja_movimientos',
      'DROP TRIGGER trg_auditoria_logs_inmutable ON auditoria_logs',
      'CREATE TABLE qa_no_permitida (id int)',
      'SELECT * FROM schema_migrations',
    ];
    for (const sql of prohibidas) {
      const codigo = await comoRolApp(sql);
      assert.ok(codigo, `"${sql}" debe fallar para pos_app_rol`);
      // 42501 = insufficient_privilege; 42809/55000 también indican bloqueo del motor
      assert.ok(['42501', '55000', '42809'].includes(codigo), `"${sql}" falló con ${codigo}`);
    }

    // Operaciones que sí necesita la API
    assert.equal(await comoRolApp('SELECT 1 FROM facturas LIMIT 1'), null);
    assert.equal(await comoRolApp('DELETE FROM receta_ingredientes WHERE false'), null);
  });

  // ---------------------------------------------------------------------------
  // P1 Validación de entrada HTTP
  // ---------------------------------------------------------------------------
  it('P1 rechaza con 400 query params y :id inválidos en lugar de responder 500', async () => {
    const casos = [
      '/reportes/resumen?fechaDesde=no-es-fecha',
      '/reportes/resumen?fechaDesde=2026-02-01&fechaHasta=2026-01-01',
      '/reportes/resumen?fechaDesde=2020-01-01&fechaHasta=2026-01-01',
      '/reportes/productos-mas-vendidos?limit=5000',
      '/facturas/abc',
      '/facturas?montoMin=uno',
      '/auditoria?usuarioId=abc',
      '/inventario/movimientos?ingredienteId=-3',
    ];
    for (const ruta of casos) {
      const { status, json } = await apiGet(ruta);
      assert.equal(status, 400, `${ruta} debe responder 400 (respondió ${status})`);
      assert.equal(json?.error?.code, 'VALIDATION_ERROR', `${ruta} debe ser VALIDATION_ERROR`);
    }
    // Un filtro vacío (?campo=) equivale a no enviarlo
    const vacio = await apiGet('/reportes/resumen?fechaDesde=&fechaHasta=');
    assert.equal(vacio.status, 200);

    // Rango EFECTIVO: con una sola fecha, la otra se completa por defecto y el rango igual se valida
    for (const ruta of ['/reportes/resumen?fechaHasta=2035-01-01', '/reportes/resumen?fechaDesde=2035-01-01']) {
      const { status, json } = await apiGet(ruta);
      assert.equal(status, 400, `${ruta} debe responder 400 (respondió ${status})`);
      assert.match(json.error.message, /rango de fechas|posterior/i);
    }
  });

  it('P1 limita el tamaño del pedido (líneas y unidades por línea)', async () => {
    async function confirmar(items) {
      const response = await fetch(`${API_BASE_URL}/ventas/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          tipoServicio: TipoServicio.MOSTRADOR,
          metodoPago: MetodoPago.EFECTIVO,
          montoRecibido: 1,
          items,
        }),
      });
      return { status: response.status, json: await response.json() };
    }
    const demasiadasLineas = Array.from({ length: env.VENTA_MAX_LINEAS + 1 }, () => ({ platilloId: 1, cantidad: 1 }));
    const r1 = await confirmar(demasiadasLineas);
    assert.equal(r1.status, 400);
    assert.ok(r1.json.error.details.some((d) => d.campo === 'items'));

    const r2 = await confirmar([{ platilloId: 1, cantidad: env.VENTA_MAX_CANTIDAD_POR_LINEA + 1 }]);
    assert.equal(r2.status, 400);
    assert.ok(r2.json.error.details.some((d) => d.campo === 'items.0.cantidad'));
  });

  it('P1 exige la política de contraseñas al crear usuarios', async () => {
    const response = await fetch(`${API_BASE_URL}/accesos/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({
        nombreCompleto: 'Usuario QA clave débil',
        username: `qa_debil_${RUN_TAG}`.toLowerCase(),
        email: `qa_debil_${RUN_TAG}@pos.local`.toLowerCase(),
        password: 'abc123',
        rolId: adminUser.rolId,
      }),
    });
    const json = await response.json();
    assert.equal(response.status, 400);
    assert.ok(json.error.details.some((d) => d.campo === 'password'));
  });

  it('registra la nómina del personal y reserva importes e historial para administración', async () => {
    const rolCajero = await Rol.findOne({ where: { codigo: 'CAJERO', activo: true } });
    assert.ok(rolCajero);
    const usuario = {
      nombreCompleto: 'Cajero QA nómina',
      username: `qa_nom_${RUN_TAG}`.toLowerCase(),
      email: `qa_nom_${RUN_TAG}@example.test`.toLowerCase(),
      password: CLAVE_QA,
      rolId: rolCajero.id,
    };
    const guardar = (path, body, method = 'POST') => fetch(`${API_BASE_URL}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify(body),
    });
    assert.equal((await guardar('/accesos/usuarios', usuario)).status, 400);
    const respuesta = await guardar('/accesos/usuarios', { ...usuario, fechaIngreso: '2026-01-03', sueldoMensual: 3200 });
    assert.equal(respuesta.status, 201);
    const { data: { id } } = await respuesta.json();
    usuariosTemporalesIds.push(id);
    assert.equal((await guardar(`/accesos/usuarios/${id}`, { sueldoMensual: 3350.75 }, 'PUT')).status, 200);

    const nomina = await apiGet('/auditoria/nomina');
    assert.equal(nomina.status, 200);
    const persona = nomina.json.data.find((item) => item.id === id);
    assert.equal(persona.fechaIngreso, '2026-01-03');
    assert.equal(persona.sueldoMensual, 3350.75);
    const historial = await apiGet('/auditoria?accion=GESTION_NOMINA');
    const actualizacion = historial.json.data.find((registro) => String(registro.entidadId) === String(id)
      && registro.valorNuevo?.sueldoMensual === 3350.75);
    assert.equal(actualizacion?.valorAnterior.sueldoMensual, 3200);

    const permisoAuditoria = await Permiso.findOne({ where: { codigo: 'auditoria:ver' } });
    assert.ok(permisoAuditoria);
    const auditor = await crearUsuarioTemporal('nomina_aud');
    await auditor.update({ rolId: rolCajero.id });
    await UsuarioPermiso.create({ usuarioId: auditor.id, permisoId: permisoAuditoria.id, permitido: true });
    const auditorJwt = jwt.sign(
      { sub: auditor.id, ver: auditor.tokenVersion, sucursalId: auditor.sucursalId },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
    assert.equal((await apiGet('/auditoria/nomina', auditorJwt)).status, 403);
    const oculto = await apiGet('/auditoria?accion=GESTION_NOMINA', auditorJwt);
    assert.equal(oculto.status, 200);
    assert.equal(oculto.json.data.length, 0);
  });
});
