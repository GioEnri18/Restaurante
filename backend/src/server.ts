import { createApp } from './app';
import { disconnectDatabase } from './config/database';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 POS Restaurante API (${env.API_PREFIX}) escuchando en http://localhost:${env.PORT}`);
  console.log(`   Moneda: ${env.CURRENCY_CODE} (${env.CURRENCY_SYMBOL}) | IVA incluido: ${(env.IVA_RATE * 100).toFixed(0)}%`);
});

async function shutdown(signal: string) {
  console.log(`\n🛑 Señal ${signal} recibida. Cerrando servidor limpiamente...`);
  server.close(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
