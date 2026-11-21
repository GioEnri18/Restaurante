const { Sequelize } = require('sequelize');
const { AppError, ConflictError } = require('../shared/errors/AppError');
const { env } = require('./env');
/**
 * Instancia única de Sequelize conectada a PostgreSQL con pool optimizado y timeouts anti-cola.
 * - lock_timeout / statement_timeout evitan que una petición bloqueada quede colgada en cola.
 */
const activeDatabaseUrl =
    env.NODE_ENV === 'test' && env.DATABASE_URL_TEST ? env.DATABASE_URL_TEST : env.DATABASE_URL;

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
    try {
        // Limita el tiempo de espera por locks/consultas dentro de esta transacción
        await sequelize.query(`SET LOCAL lock_timeout = '${env.DB_LOCK_TIMEOUT_MS}ms'`, {
            transaction,
        });
        await sequelize.query(`SET LOCAL statement_timeout = '${env.DB_STATEMENT_TIMEOUT_MS}ms'`, {
            transaction,
        });
        const result = await work(transaction);
        await transaction.commit();
        // Callback seguro posterior al commit (ej. certificaciones externas o notificaciones)
        if (onAfterCommit) {
            await onAfterCommit(result);
        }
        return result;
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
}
async function connectDatabase() {
    await sequelize.authenticate();
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
    disconnectDatabase,
};
