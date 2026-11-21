const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { connectDatabase, disconnectDatabase, withTransaction } = require('../config/database');
const { PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_URL } = require('../config/platillos-media');
const { Categoria, Ingrediente, Platillo, RecetaIngrediente, Sucursal } = require('../models');
const { categorias, nombreFotoMenuBase } = require('./menu-base-bx');

async function publicarFotos(numeros) {
  const fotos = await Promise.all([...numeros].map(async (numero) => {
    const nombre = nombreFotoMenuBase(numero);
    const webp = await fs.readFile(path.join(__dirname, 'menu-base-bx-fotos', nombre));
    if (webp.length > 10000 || webp.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error(`Foto del menú base inválida: ${nombre}`);
    }
    return { nombre, webp };
  }));
  await fs.mkdir(PLATILLOS_MEDIA_DIR, { recursive: true });
  for (const { nombre, webp } of fotos) {
    const destino = path.join(PLATILLOS_MEDIA_DIR, nombre);
    const temporal = path.join(PLATILLOS_MEDIA_DIR, `${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporal, webp, { flag: 'wx' });
      // Los borradores pueden compartir foto. Nunca se sobrescribe un archivo ya publicado.
      await fs.link(temporal, destino).catch((err) => {
        if (err.code !== 'EEXIST') throw err;
      });
    } finally {
      await fs.rm(temporal, { force: true });
    }
  }
}

async function cargarMenuBase(codigo) {
  return withTransaction(async (transaction) => {
    const sucursal = await Sucursal.findOne({
      where: { codigo, activa: true }, lock: transaction.LOCK.UPDATE, transaction,
    });
    if (!sucursal) throw new Error('La sucursal indicada no existe o está inactiva');
    const ingredienteIds = new Map();
    const fotos = new Set();
    let creados = 0;
    for (const [orden, categoria] of categorias.entries()) {
      const [registro] = await Categoria.findOrCreate({
        where: { sucursalId: sucursal.id, nombre: categoria.nombre },
        defaults: { orden: 100 + orden },
        transaction,
      });
      for (const [clave, nombre, foto, ingredientes, descripcion] of categoria.productos) {
        const imagenUrl = `${PLATILLOS_MEDIA_URL}/${nombreFotoMenuBase(foto)}`;
        const [platillo, creado] = await Platillo.findOrCreate({
          where: { sucursalId: sucursal.id, sku: `BX-${clave}` },
          defaults: {
            categoriaId: registro.id,
            nombre,
            descripcion: descripcion ?? null,
            precioVenta: null,
            imagenUrl,
            disponible: false,
          },
          transaction,
        });
        if (platillo.imagenUrl === imagenUrl) fotos.add(foto);
        if (!creado) continue;
        creados += 1;
        const receta = [];
        for (const [ingrediente, gramos] of Object.entries(ingredientes)) {
          if (!ingredienteIds.has(ingrediente)) {
            const claveIngrediente = createHash('sha256').update(ingrediente).digest('hex').slice(0, 16);
            const [insumo] = await Ingrediente.findOrCreate({
              where: { sucursalId: sucursal.id, codigo: `BX-ING-${claveIngrediente}` },
              defaults: { nombre: ingrediente, stockMinimoOz: 0 },
              transaction,
            });
            ingredienteIds.set(ingrediente, insumo.id);
          }
          receta.push({
            platilloId: platillo.id,
            ingredienteId: ingredienteIds.get(ingrediente),
            cantidadOz: (gramos / 28.349523125).toFixed(4),
          });
        }
        if (receta.length) await RecetaIngrediente.bulkCreate(receta, { transaction });
      }
    }
    await publicarFotos(fotos);
    return creados;
  });
}

async function main() {
  const [codigo, ...resto] = process.argv.slice(2);
  if (!codigo || resto.length) throw new Error('Indica el código de sucursal como único argumento');
  try {
    await connectDatabase();
    const creados = await cargarMenuBase(codigo.trim().toUpperCase());
    console.log(`Menú base BX: ${creados} borradores nuevos en la sucursal indicada`);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { cargarMenuBase };
