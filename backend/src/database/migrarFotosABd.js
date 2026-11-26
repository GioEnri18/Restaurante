const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { QueryTypes } = require('sequelize');
const { connectDatabase, disconnectDatabase, sequelize } = require('../config/database');
const {
  PLATILLOS_MEDIA_DIR,
  PLATILLOS_MEDIA_BASE_DIR,
  PLATILLOS_MEDIA_URL,
  NOMBRE_FOTO_PLATILLO,
} = require('../config/platillos-media');

/**
 * Script idempotente para migrar miniaturas WebP de platillos desde disco local
 * (`PLATILLOS_MEDIA_DIR` y opcionalmente `PLATILLOS_MEDIA_BASE_DIR` con `--incluir-base`)
 * hacia la tabla `platillo_fotos` en PostgreSQL (`MEDIA_STORAGE=db`).
 *
 * Uso:
 *   npm --prefix backend run db:migrar-fotos
 *   npm --prefix backend run db:migrar-fotos -- --incluir-base
 */
async function migrarFotosLocalesABd({
  directorios = [PLATILLOS_MEDIA_DIR],
  log = console,
} = {}) {
  const platillosRows = await sequelize.query(
    `SELECT "id", "imagen_url" AS "imagenUrl"
     FROM "platillos"
     WHERE "imagen_url" IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );

  const platilloPorNombre = new Map();
  const prefijo = `${PLATILLOS_MEDIA_URL}/`;
  for (const row of platillosRows) {
    if (typeof row.imagenUrl === 'string' && row.imagenUrl.startsWith(prefijo)) {
      const nombre = row.imagenUrl.slice(prefijo.length);
      if (NOMBRE_FOTO_PLATILLO.test(nombre) && !platilloPorNombre.has(nombre)) {
        platilloPorNombre.set(nombre, Number(row.id));
      }
    }
  }

  let insertadas = 0;
  let omitidas = 0;

  for (const dir of directorios) {
    let entradas;
    try {
      entradas = await fs.readdir(dir);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }

    for (const nombre of entradas) {
      if (!NOMBRE_FOTO_PLATILLO.test(nombre)) continue;
      const ruta = path.join(dir, nombre);
      const bytes = await fs.readFile(ruta);
      if (bytes.length === 0 || bytes.length > 100000) {
        omitidas += 1;
        continue;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const platilloId = platilloPorNombre.get(nombre) ?? null;

      const filas = await sequelize.query(
        `INSERT INTO "platillo_fotos" ("platillo_id", "nombre", "mime", "bytes", "sha256")
         VALUES (:platilloId, :nombre, 'image/webp', :bytes, :sha256)
         ON CONFLICT ("nombre") DO NOTHING
         RETURNING "id"`,
        {
          replacements: { platilloId, nombre, bytes, sha256 },
          type: QueryTypes.SELECT,
        },
      );
      if (filas.length > 0) {
        insertadas += 1;
      } else {
        omitidas += 1;
      }
    }
  }

  log.info(
    `Migración de fotos a BD completada: ${insertadas} insertada(s), ${omitidas} omitida(s) (idempotente).`,
  );
  return { insertadas, omitidas };
}

module.exports = { migrarFotosLocalesABd };

if (require.main === module) {
  const incluirBase = process.argv.includes('--incluir-base');
  const directorios = incluirBase
    ? [PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_BASE_DIR]
    : [PLATILLOS_MEDIA_DIR];

  connectDatabase()
    .then(() => migrarFotosLocalesABd({ directorios }))
    .then(() => disconnectDatabase())
    .catch(async (error) => {
      console.error('❌ Error migrando fotos a PostgreSQL:', error.message);
      await disconnectDatabase().catch(() => {});
      process.exit(1);
    });
}
