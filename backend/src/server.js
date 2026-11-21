const { createApp } = require('./app');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { env } = require('./config/env');
// Importar modelos asegura que todas las asociaciones Sequelize queden registradas al arrancar
require('./models');
async function bootstrap() {
    await connectDatabase();
    const app = createApp();
    const server = app.listen(env.PORT, () => {
        console.log(`🚀 POS Restaurante API [Node.js + Express + Sequelize MVC] (${env.API_PREFIX}) escuchando en http://localhost:${env.PORT}`);
        console.log(`   Moneda: ${env.CURRENCY_CODE} (${env.CURRENCY_SYMBOL}) | IVA incluido: ${(env.IVA_RATE * 100).toFixed(0)}% | Timeout HTTP: ${env.REQUEST_TIMEOUT_MS}ms`);
    });
    async function shutdown(signal) {
        console.log(`\n🛑 Señal ${signal} recibida. Cerrando servidor limpiamente...`);
        server.close(async () => {
            await disconnectDatabase();
            process.exit(0);
        });
    }
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
bootstrap().catch((error) => {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
});
