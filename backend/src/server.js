const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { env } = require('./config/env');
const { logger } = require('./shared/logger');
// Importar modelos asegura que todas las asociaciones Sequelize queden registradas al arrancar
require('./models');

// Tiempo máximo para terminar peticiones en curso antes de forzar la salida
const SHUTDOWN_TIMEOUT_MS = 10000;

async function bootstrap() {
    // Opción para despliegues simples: aplicar migraciones pendientes al arrancar.
    // Usa DATABASE_MIGRATION_URL (dueño) si existe y un advisory lock entre instancias.
    // En el stack Docker completo lo hace el servicio `migrator` y esto queda en false.
    if (env.MIGRATE_ON_START) {
        const { runMigrations } = require('./database/migrate');
        await runMigrations({ log: logger });
    }

    await connectDatabase();
    const app = createApp();
    const server = app.listen(env.PORT, () => {
        logger.info({
            port: env.PORT,
            prefix: env.API_PREFIX,
            nodeEnv: env.NODE_ENV,
            requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
        }, 'POS Restaurante API escuchando');
    });

    let cerrando = false;
    async function shutdown(signal) {
        if (cerrando) return;
        cerrando = true;
        logger.info({ signal }, 'Señal recibida: cerrando servidor limpiamente');
        // Si alguna conexión no termina a tiempo, salir de todos modos (Docker envía SIGKILL a los 10 s)
        const forzar = setTimeout(() => {
            logger.error('Cierre forzado: hubo peticiones que no terminaron a tiempo');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        forzar.unref();
        server.close(async () => {
            await disconnectDatabase();
            logger.info('Servidor detenido');
            process.exit(0);
        });
    }
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// Errores que escapan a Express: se registran y el proceso termina para que Docker lo reinicie
// en un estado limpio (continuar tras un error desconocido puede dejar datos a medias).
process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Promesa rechazada sin manejar');
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Excepción no capturada');
    process.exit(1);
});

bootstrap().catch((error) => {
    logger.fatal({ err: error }, 'Error al iniciar el servidor');
    process.exit(1);
});
