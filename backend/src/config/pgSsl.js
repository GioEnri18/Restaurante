const { env } = require('./env');

// Proveedores gestionados que exigen TLS/SSL por defecto
const CLOUD_PG_HOST_REGEX = /(render\.com|neon\.tech|supabase\.co|railway\.app|amazonaws\.com|azure\.com)/i;

/**
 * Construye la configuración `ssl` para Sequelize/pg según DB_SSL y la URL de conexión.
 * - DB_SSL=false -> sin SSL (desarrollo local / red interna sin TLS)
 * - DB_SSL=true  -> fuerza SSL
 * - DB_SSL=auto  -> activa SSL si la URL incluye sslmode=require/verify o un host gestionado en la nube
 */
function buildPgSslOptions(databaseUrl) {
  if (env.DB_SSL === 'false') {
    return undefined;
  }

  const urlStr = String(databaseUrl || '');
  const exigePorUrl =
    /[?&]sslmode=(require|verify-ca|verify-full|prefer)\b/i.test(urlStr) ||
    CLOUD_PG_HOST_REGEX.test(urlStr);

  if (env.DB_SSL === 'true' || exigePorUrl) {
    return {
      require: true,
      rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
    };
  }

  return undefined;
}

module.exports = { buildPgSslOptions };
