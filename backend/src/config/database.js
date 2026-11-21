const pg = require('pg');
const { Sequelize } = require('sequelize');

// Las columnas de fecha son TIMESTAMP(3) SIN zona horaria y Sequelize las ESCRIBE en UTC.
// Por defecto el driver `pg` las LEE como hora local del proceso Node: en un servidor en
// America/Guatemala cada fecha volvía corrida +6 h (en Docker, con TZ=UTC, no se notaba).
// Se fuerza la lectura en UTC para que escritura y lectura sean simétricas en cualquier servidor.
const PG_TIMESTAMP_SIN_ZONA_OID = 1114;
pg.types.setTypeParser(PG_TIMESTAMP_SIN_ZONA_OID, (valor) =>
    valor === null ? null : new Date(`${valor.replace(' ', 'T')}Z`),
);
const { AppError, ConflictError } = require('../shared/errors/AppError');
const { env } = require('./env');
const { logger } = require('../shared/logger');
/**
 * Instancia única de Sequelize conectada a PostgreSQL con pool optimizado y timeouts anti-cola.
 * - lock_timeout / statement_timeout evitan que una petición bloqueada quede colgada en cola.
 */
// En test, env.js ya garantiza que DATABASE_URL_TEST existe y es distinta de DATABASE_URL
const activeDatabaseUrl = env.NODE_ENV === 'test' ? env.DATABASE_URL_TEST : env.DATABASE_URL;

const sequelize = new Sequelize(activeDatabaseUrl, {
    dialect: 'postgres',
    logging: false,
    pool: {
        max: env.DB_POOL_MAX,
        min: env.DB_POOL_MIN,
        acquire: env.DB_POOL_ACQUIRE_MS,
        idle: env.DB_POOL_IDLE_MS,
    },
    dialectOptions: {
        statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
        lock_timeout: env.DB_LOCK_TIMEOUT_MS,
    },
    define: {
        underscored: true,
        freezeTableName: true,
    },
});
/** Extrae el código de error nativo de PostgreSQL desde errores envueltos por Sequelize */
function getPgErrorCode(error) {
    if (!error || typeof error !== 'object')
        return undefined;
    const e = error;
    return e.parent?.code ?? e.original?.code ?? e.code;
}
/** Traduce códigos de bloqueo/timeout de PostgreSQL a respuestas HTTP claras (sin colas eternas) */
function mapDatabaseConcurrencyError(error) {
    const pgCode = getPgErrorCode(error);
    if (pgCode === '55P03') {
        return new ConflictError('El recurso está siendo actualizado por otra operación simultánea. Intenta de nuevo.');
    }
    if (pgCode === '40P01') {
        return new ConflictError('Conflicto de concurrencia detectado en base de datos. Reintenta la operación.');
    }
    if (pgCode === '57014') {
        return new AppError('La operación excedió el tiempo límite de espera en base de datos.', 503, 'DB_STATEMENT_TIMEOUT');
    }
    return error;
}
/**
 * Helper transaccional con ROLLBACK explícito garantizado, timeouts locales anti-cola
 * y soporte para callback post-commit (ejecutado únicamente si el commit fue exitoso).
 */
async function withTransaction(work, onAfterCommit) {
    const transaction = await sequelize.transaction();
    let result;
    try {
        // Limita el tiempo de espera por locks/consultas dentro de esta transacción
        await sequelize.query(`SET LOCAL lock_timeout = '${env.DB_LOCK_TIMEOUT_MS}ms'`, {
            transaction,
        });
        await sequelize.query(`SET LOCAL statement_timeout = '${env.DB_STATEMENT_TIMEOUT_MS}ms'`, {
            transaction,
        });
        result = await work(transaction);
        await transaction.commit();
    }
    catch (error) {
        // Rollback explícito seguro si la transacción sigue abierta
        try {
            await transaction.rollback();
        }
        catch {
            // Ignora si PostgreSQL ya abortó/cerró la transacción
        }
        throw mapDatabaseConcurrencyError(error);
    }
    // Auditoría P0.4: el callback post-commit (p. ej. notificaciones) corre FUERA del try/rollback.
    // Si falla, los datos ya están confirmados: se registra el error y se devuelve el resultado
    // en lugar de responder 500 (lo que provocaba reintentos y cobros duplicados).
    if (onAfterCommit) {
        try {
            await onAfterCommit(result);
        }
        catch (postCommitError) {
            logger.error({ err: postCommitError }, 'Error en callback post-commit (la transacción ya fue confirmada)');
        }
    }
    return result;
}
async function connectDatabase() {
    await sequelize.authenticate();
}
/** Readiness: PostgreSQL responde dentro de `timeoutMs` (sin esperar al pool indefinidamente) */
async function verificarBaseDatos(timeoutMs = 2000) {
    const inicio = Date.now();
    let timer;
    const limite = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Sin respuesta de PostgreSQL en ${timeoutMs} ms`)), timeoutMs);
    });
    try {
        await Promise.race([sequelize.query('SELECT 1'), limite]);
        return { ok: true, latenciaMs: Date.now() - inicio };
    }
    catch (error) {
        return { ok: false, latenciaMs: Date.now() - inicio, error: error.message };
    }
    finally {
        clearTimeout(timer);
    }
}
async function disconnectDatabase() {
    await sequelize.close();
}

module.exports = {
    sequelize,
    getPgErrorCode,
    mapDatabaseConcurrencyError,
    withTransaction,
    connectDatabase,
    verificarBaseDatos,
    disconnectDatabase,
};
