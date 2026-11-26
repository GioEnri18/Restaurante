const crypto = require('node:crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { env } = require('../config/env');

/**
 * Logger estructurado (JSON, una línea por evento) para producción y para recolectores de logs.
 * - Nunca registra credenciales: se ocultan cookies, Authorization y cualquier campo de contraseña.
 * - Cada petición lleva un requestId (X-Request-Id) para correlacionar logs y errores.
 */
const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'pos-restaurante-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      // Privacidad de servicio a domicilio: nunca registrar teléfono ni dirección en claro en logs
      '*.telefono',
      '*.clienteTelefono',
      '*.clienteTelefonoSnapshot',
      '*.direccion',
      '*.clienteDireccion',
      '*.direccionSnapshot',
      '*.direccionEntrega',
      '*.referenciaEntrega',
      '*.referenciaSnapshot',
    ],
    censor: '[OCULTO]',
  },
});

const REQUEST_ID_VALIDO = /^[A-Za-z0-9._-]{8,64}$/;

/** Oculta parámetros sensibles (como ?telefono=...) antes de escribir la URL en los logs HTTP */
function sanitizarUrlParaLog(url) {
  if (typeof url !== 'string' || !url.includes('?')) return url;
  return url.replace(/([?&](?:telefono|direccion|clienteTelefono)=)[^&]*/gi, '$1[OCULTO]');
}

const httpLogger = pinoHttp({
  logger,
  // Reutiliza el X-Request-Id del proxy si es válido; si no, genera uno nuevo
  genReqId(req, res) {
    const entrante = req.headers['x-request-id'];
    const id =
      typeof entrante === 'string' && REQUEST_ID_VALIDO.test(entrante) ? entrante : crypto.randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Los healthchecks de Docker corren cada pocos segundos: no llenar el log con ellos
  autoLogging: { ignore: (req) => req.url?.includes('/health') },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: sanitizarUrlParaLog(req.url),
      ip: req.raw?.ip ?? req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { logger, httpLogger, sanitizarUrlParaLog };
