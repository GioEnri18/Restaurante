const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { PostgresRateLimitStore } = require('../shared/services/postgres-rate-limit.store');

/**
 * Obtiene la IP real del cliente respetando estrictamente la configuración de `trust proxy`
 * de Express (`req.ip`). Nunca lee `X-Forwarded-For` de forma manual para evitar spoofing.
 * Normaliza direcciones IPv4 mapeadas en IPv6 (`::ffff:127.0.0.1` -> `127.0.0.1`).
 */
function obtenerIpCliente(req) {
  const raw = req?.ip || req?.socket?.remoteAddress || 'unknown';
  const limpia = String(raw).trim();
  if (limpia.startsWith('::ffff:')) {
    return limpia.slice(7);
  }
  return limpia || 'unknown';
}

/**
 * Fábrica centralizada de limitadores de tasa (`express-rate-limit` v7).
 * - Selecciona store según `RATE_LIMIT_STORE` (`memory` | `postgres`).
 * - Cada limitador recibe su propia instancia de store y un `prefix` único para
 *   compartir la tabla `rate_limit_entries` sin colisiones entre rutas.
 * - Respeta `RATE_LIMIT_FAIL_OPEN` ante fallos del store compartido.
 */
function crearRateLimiter(options) {
  const {
    prefix,
    windowMs,
    max,
    message,
    keyGenerator,
    storeType = env.RATE_LIMIT_STORE,
    failOpen = env.RATE_LIMIT_FAIL_OPEN,
    queryRunner,
    cleanupIntervalMs,
    ...rest
  } = options;

  if (!prefix || typeof prefix !== 'string') {
    throw new Error('crearRateLimiter requiere un "prefix" único por limitador');
  }

  const usarPostgres = String(storeType).trim().toLowerCase() === 'postgres';
  const store = usarPostgres
    ? new PostgresRateLimitStore({
        prefix,
        windowMs,
        failOpen,
        queryRunner,
        cleanupIntervalMs,
      })
    : undefined;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: Boolean(failOpen),
    keyGenerator: keyGenerator || ((req) => obtenerIpCliente(req)),
    message,
    // Desactiva la alerta por cabecera X-Forwarded-For cuando TRUST_PROXY=false, ya que
    // un cliente malicioso puede enviarla para intentar spoofing y Express la ignora correctamente.
    validate: {
      xForwardedForHeader: false,
    },
    ...(store ? { store } : {}),
    ...rest,
  });
}

module.exports = {
  crearRateLimiter,
  obtenerIpCliente,
};
