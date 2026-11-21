const fs = require('node:fs');
const path = require('node:path');
const { QueryTypes, Sequelize } = require('sequelize');
const { env } = require('../config/env');

/**
 * Ejecutor idempotente de migraciones SQL versionadas sobre PostgreSQL.
 * - Crea la tabla `schema_migrations` si no existe.
 * - Si la BD ya tenía migraciones previas en `_prisma_migrations`, las sincroniza para no re-ejecutarlas.
 * - Ejecuta cada archivo `.sql` nuevo en orden alfabético dentro de su propia transacción con rollback explícito.
 * - Toma un advisory lock: si varias instancias arrancan a la vez, solo una migra y las demás esperan.
 *
 * Conexión: usa DATABASE_MIGRATION_URL (dueño del esquema) y, si no está definida,
 * DATABASE_URL. La API en ejecución usa DATABASE_URL con el rol de mínimo privilegio.
 */

// Identificador arbitrario y fijo del advisory lock de migraciones
const MIGRATION_LOCK_ID = 727001;

function resolverUrlMigraciones() {
  if (env.NODE_ENV === 'test') {
    // Nunca DATABASE_URL en test (env.js exige DATABASE_URL_TEST)
    return env.DATABASE_MIGRATION_URL_TEST || env.DATABASE_URL_TEST;
  }
  return env.DATABASE_MIGRATION_URL || env.DATABASE_URL;
}

/**
 * pg_advisory_lock / pg_advisory_unlock pertenecen a la SESIÓN de PostgreSQL. Con un pool normal,
 * el lock, cada migración y el unlock podían ir por conexiones distintas: el unlock fallaba en
 * silencio y el lock quedaba retenido hasta cerrar el pool. Con un pool de UNA conexión, todo
 * (lock, transacciones de migración y unlock) ocurre en la misma sesión.
 */
function crearConexionMigraciones() {
  return new Sequelize(resolverUrlMigraciones(), {
    dialect: 'postgres',
    logging: false,
    pool: { max: 1, min: 1, acquire: 60000, idle: 60000 },
  });
}

async function runMigrations({ log = console } = {}) {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    log.info('No existe carpeta de migraciones SQL.');
    return 0;
  }

  const sequelize = crearConexionMigraciones();
  try {
    await sequelize.authenticate();
    log.info('Esperando el bloqueo de migraciones (otra instancia podría estar migrando)...');
    await sequelize.query('SELECT pg_advisory_lock(:id)', {
      replacements: { id: MIGRATION_LOCK_ID },
    });
    try {
      return await aplicarPendientes(sequelize, migrationsDir, log);
    } finally {
      const [{ liberado }] = await sequelize.query('SELECT pg_advisory_unlock(:id) AS liberado', {
        replacements: { id: MIGRATION_LOCK_ID },
        type: QueryTypes.SELECT,
      });
      // false significaría que el unlock corrió en otra sesión distinta a la del lock
      if (!liberado) {
        log.error('El bloqueo de migraciones no se liberó en la misma sesión');
      }
    }
  } finally {
    await sequelize.close();
  }
}

async function aplicarPendientes(sequelize, migrationsDir, log) {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" VARCHAR(200) PRIMARY KEY,
      "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sincronizar historial previo si la BD venía de migraciones iniciales ya aplicadas
  const prismaTableCheck = await sequelize.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS exists`,
    { type: QueryTypes.SELECT },
  );
  if (prismaTableCheck[0]?.exists) {
    const prevRows = await sequelize.query(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      { type: QueryTypes.SELECT },
    );
    for (const row of prevRows) {
      await sequelize.query(
        `INSERT INTO "schema_migrations" ("name") VALUES (:name) ON CONFLICT ("name") DO NOTHING`,
        { replacements: { name: `${row.migration_name}.sql` } },
      );
    }
  }

  const appliedRows = await sequelize.query(`SELECT name FROM "schema_migrations"`, {
    type: QueryTypes.SELECT,
  });
  const appliedSet = new Set(appliedRows.map((r) => r.name));
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
    log.info(`Aplicando migración SQL: ${file}`);
    const t = await sequelize.transaction();
    try {
      if (sql.length > 0) {
        await sequelize.query(sql, { transaction: t });
      }
      await sequelize.query(`INSERT INTO "schema_migrations" ("name") VALUES (:name)`, {
        replacements: { name: file },
        transaction: t,
      });
      await t.commit();
      count++;
    } catch (error) {
      await t.rollback();
      const pista = error.parent?.hint ?? error.original?.hint;
      log.error(
        `Error aplicando migración ${file} (rollback ejecutado): ${error.message}${pista ? `\n   Qué hacer: ${pista}` : ''}`,
      );
      throw error;
    }
  }

  log.info(
    count === 0
      ? 'Base de datos al día (0 migraciones pendientes).'
      : `${count} migración(es) aplicada(s) correctamente.`,
  );
  return count;
}

module.exports = { runMigrations };

// Uso por CLI: npm run db:migrate
if (require.main === module) {
  runMigrations().catch((err) => {
    // El detalle ya se registró arriba; aquí solo el resumen (sin volcar el SQL completo)
    console.error(`❌ Falló el runner de migraciones: ${err.message}`);
    process.exit(1);
  });
}
