const { env } = require('../config/env');
const { NotFoundError } = require('../shared/errors/AppError');

/**
 * Middleware de feature flag basado en variables de entorno (`config/env.js`).
 * Cuando la bandera está desactivada, bloquea el módulo con 404 sin exponer funcionalidad inactiva.
 */
function requireFeature(flagName, mensaje = 'Esta funcionalidad no está habilitada en la configuración actual') {
  return (_req, _res, next) => {
    if (!env[flagName]) {
      next(new NotFoundError(mensaje));
      return;
    }
    next();
  };
}

module.exports = { requireFeature };
