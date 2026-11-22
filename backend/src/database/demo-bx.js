const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { connectDatabase, disconnectDatabase, withTransaction } = require('../config/database');
const { env } = require('../config/env');
const {
  Ingrediente, Permiso, Platillo, Proveedor, RecetaIngrediente, Rol, Sucursal, Usuario, UsuarioPermiso,
} = require('../models');
const { InventarioService } = require('../services/inventario.service');
const { UnitConversionService } = require('../shared/services/unitConversion.service');

const CODIGO = 'QA-BX-DEMO';
const NOMBRE = 'Pruebas temporales · Menú BX';
const USUARIO = 'cajero_demo_bx';
const PERMISOS = ['caja:autorizar', 'facturas:ver', 'inventario:ver'];

function verificarSucursal(sucursal) {
  if (!sucursal || sucursal.nombre !== NOMBRE || sucursal.serieFactura !== 'QABX') {
    throw new Error('No se encontró una sucursal identificada como demo BX');
  }
}

async function prepararCatalogo(sucursal, cajero, transaction) {
  const platillos = await Platillo.findAll({
    where: { sucursalId: sucursal.id, activo: true, sku: { [Op.like]: 'BX-%' } },
    include: [{ model: RecetaIngrediente, as: 'receta' }],
    order: [['sku', 'ASC']],
    transaction,
  });
  if (!platillos.length) throw new Error('Aplica primero las migraciones del catálogo BX');

  // Las presentaciones y combos sin receta usan un insumo por porción solo en la demostración.
  const recetas = new Map();
  for (const platillo of platillos) {
    if (platillo.receta.length) {
      recetas.set(platillo.id, platillo.receta);
      continue;
    }
    const insumo = await Ingrediente.create({
      sucursalId: sucursal.id, codigo: `DEMO-${platillo.sku}`, nombre: `Porción demo de ${platillo.nombre}`.slice(0, 120),
    }, { transaction });
    recetas.set(platillo.id, [await RecetaIngrediente.create({
      platilloId: platillo.id, ingredienteId: insumo.id, cantidadOz: 1,
    }, { transaction })]);
  }

  const proveedor = await Proveedor.create({
    sucursalId: sucursal.id, nombre: 'Proveedor ficticio QA BX',
  }, { transaction });
  const insumos = [...new Set([...recetas.values()].flat().map((linea) => linea.ingredienteId))].sort((a, b) => a - b);
  const items = insumos.map((ingredienteId, indice) => ({
    ingredienteId, cantidadLb: 10, precioPorLb: 12 + (indice % 15) * 2,
  }));
  await InventarioService.registrarCompra(cajero, {
    proveedorId: proveedor.id, numeroDocumento: 'QA-BX-INICIAL', items,
  }, { userAgent: 'db:demo-bx' }, transaction);
  const costos = new Map(items.map(({ ingredienteId, precioPorLb }) => [ingredienteId, precioPorLb]));
  for (const platillo of platillos) {
    const costo = recetas.get(platillo.id).reduce((total, linea) => total
      + Number(linea.cantidadOz) * UnitConversionService.pricePerLbToCostPerOz(costos.get(linea.ingredienteId)), 0);
    await platillo.update({ precioVenta: Math.max(5, Math.ceil(costo * 3)), disponible: true }, { transaction });
  }
  return platillos.length;
}

async function activar(password) {
  if (typeof password !== 'string' || password.length < Math.max(16, env.PASSWORD_MIN_LENGTH)
    || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Define BX_DEMO_PASSWORD con al menos 16 caracteres, letras y números, y respeta el límite de 72 bytes');
  }
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  return withTransaction(async (transaction) => {
    const [sucursal, creada] = await Sucursal.findOrCreate({
      where: { codigo: CODIGO },
      defaults: { nombre: NOMBRE, serieFactura: 'QABX', nit: 'CF', direccion: 'Sucursal ficticia de pruebas', activa: true },
      transaction,
    });
    verificarSucursal(sucursal);
    await sucursal.reload({ transaction, lock: transaction.LOCK.UPDATE });
    const rol = await Rol.findOne({ where: { codigo: 'CAJERO', activo: true }, transaction });
    if (!rol) throw new Error('Aplica primero las migraciones de roles');
    const [cajero, creado] = await Usuario.findOrCreate({
      where: { username: USUARIO },
      defaults: {
        sucursalId: sucursal.id, rolId: rol.id, nombreCompleto: 'Cajero de pruebas BX',
        email: 'cajero-demo-bx@example.invalid', passwordHash,
      },
      transaction,
    });
    if (cajero.sucursalId !== sucursal.id) throw new Error('El usuario reservado de prueba pertenece a otra sucursal');
    await sucursal.update({ activa: true }, { transaction });
    if (!creado) {
      await cajero.update({
        passwordHash, rolId: rol.id, activo: true, intentosFallidos: 0, bloqueadoHasta: null,
        tokenVersion: cajero.tokenVersion + 1,
      }, { transaction });
    }
    const permisos = await Permiso.findAll({ where: { codigo: PERMISOS }, transaction });
    if (permisos.length !== PERMISOS.length) throw new Error('El servidor todavía no tiene todos los permisos de la demo');
    for (const permiso of permisos) {
      const [override] = await UsuarioPermiso.findOrCreate({
        where: { usuarioId: cajero.id, permisoId: permiso.id },
        defaults: { permitido: true },
        transaction,
      });
      if (!override.permitido) await override.update({ permitido: true }, { transaction });
    }
    const cantidad = creada ? await prepararCatalogo(sucursal, cajero, transaction) : 0;
    return { cantidad, codigo: CODIGO, usuario: USUARIO };
  });
}

async function desactivar() {
  return withTransaction(async (transaction) => {
    const sucursal = await Sucursal.findOne({
      where: { codigo: CODIGO }, lock: transaction.LOCK.UPDATE, transaction,
    });
    verificarSucursal(sucursal);
    const cajero = await Usuario.findOne({ where: { sucursalId: sucursal.id, username: USUARIO }, transaction });
    if (cajero?.activo) {
      await cajero.update({ activo: false, tokenVersion: cajero.tokenVersion + 1 }, { transaction });
    }
    await sucursal.update({ activa: false }, { transaction });
  });
}

async function main() {
  const [accion, ...resto] = process.argv.slice(2);
  if (resto.length || !['activar', 'desactivar'].includes(accion)) {
    throw new Error('Usa npm run db:demo-bx -- activar o npm run db:demo-bx -- desactivar');
  }
  try {
    await connectDatabase();
    if (accion === 'activar') {
      const resultado = await activar(process.env.BX_DEMO_PASSWORD);
      console.log(`Demo activa en ${resultado.codigo} · Usuario ${resultado.usuario} · ${resultado.cantidad} platillos nuevos`);
    } else {
      await desactivar();
      console.log(`Demo desactivada en ${CODIGO}`);
    }
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { activar, desactivar };
