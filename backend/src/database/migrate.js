const fs = require('node:fs');
const path = require('node:path');
const { QueryTypes } = require('sequelize');
const { disconnectDatabase, sequelize } = require('../config/database');
/**
 * Ejecutor idempotente de migraciones SQL versionadas sobre PostgreSQL (sin Prisma).
 * - Crea la tabla `schema_migrations` si no existe.
 * - Si la BD ya tenía migraciones previas en `_prisma_migrations`, las sincroniza para no re-ejecutarlas.
 * - Ejecuta cada archivo `.sql` nuevo en orden alfabético dentro de su propia transacción con rollback explícito.
 */
async function runMigrations() {
    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.log('ℹ️ No existe carpeta de migraciones SQL.');
        return;
    }
    await sequelize.authenticate();
    await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" VARCHAR(200) PRIMARY KEY,
      "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    // Sincronizar historial previo si la BD venía de migraciones iniciales ya aplicadas
    const prismaTableCheck = await sequelize.query(`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS exists`, { type: QueryTypes.SELECT });
    if (prismaTableCheck[0]?.exists) {
        const prevRows = await sequelize.query(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`, { type: QueryTypes.SELECT });
        for (const row of prevRows) {
            await sequelize.query(`INSERT INTO "schema_migrations" ("name") VALUES (:name) ON CONFLICT ("name") DO NOTHING`, { replacements: { name: `${row.migration_name}.sql` } });
        }
    }
    const appliedRows = await sequelize.query(`SELECT name FROM "schema_migrations"`, { type: QueryTypes.SELECT });
    const appliedSet = new Set(appliedRows.map((r) => r.name));
    const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    let count = 0;
    for (const file of files) {
        if (appliedSet.has(file)) {
            continue;
        }
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
        console.log(`⬆️ Aplicando migración SQL: ${file}`);
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
        }
        catch (error) {
            await t.rollback();
            console.error(`❌ Error aplicando migración ${file} (rollback ejecutado):`, error);
            throw error;
        }
    }
    console.log(count === 0
        ? '✅ Base de datos al día (0 migraciones pendientes).'
        : `✅ ${count} migración(es) aplicada(s) correctamente.`);
}
runMigrations()
    .catch((err) => {
    console.error('❌ Falló el runner de migraciones:', err);
    process.exit(1);
})
    .finally(async () => {
    await disconnectDatabase();
});
