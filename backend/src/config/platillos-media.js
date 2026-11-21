const path = require('node:path');
const { env } = require('./env');

const PLATILLOS_MEDIA_URL = '/media/platillos';
const PLATILLOS_MEDIA_DIR = path.resolve(
  env.PLATILLOS_MEDIA_DIR ?? path.join(__dirname, '../../media/platillos'),
);
const PLATILLOS_MEDIA_BASE_DIR = path.join(__dirname, '../database/menu-base-bx-fotos');
const NOMBRE_FOTO_PLATILLO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

module.exports = { PLATILLOS_MEDIA_URL, PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_BASE_DIR, NOMBRE_FOTO_PLATILLO };
