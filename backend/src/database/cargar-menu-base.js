const { QueryTypes } = require('sequelize');
const { connectDatabase, disconnectDatabase, sequelize } = require('../config/database');
const { Sucursal } = require('../models');

async function cargarMenuBase(codigo) {
  const sucursal = await Sucursal.findOne({ where: { codigo, activa: true }, attributes: ['id'] });
  if (!sucursal) throw new Error('La sucursal indicada no existe o está inactiva');
  const [resultado] = await sequelize.query(
    'SELECT public.precargar_menu_base_bx(:sucursalId) AS creados',
    { replacements: { sucursalId: sucursal.id }, type: QueryTypes.SELECT },
  );
  return resultado.creados;
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
