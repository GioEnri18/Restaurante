const { env } = require('../config/env');
const { NotFoundError } = require('../shared/errors/AppError');

/**
 * Middleware de feature flag basado en variables de entorno (`config/env.js`).
 * Acepta una bandera o un arreglo de banderas (todas deben estar activas).
 * Cuando alguna bandera está desactivada, bloquea el módulo con 404 sin exponer funcionalidad inactiva.
 */
function requireFeature(flagNames, mensaje = 'Esta funcionalidad no está habilitada en la configuración actual') {
  const flags = Array.isArray(flagNames) ? flagNames : [flagNames];
  return (_req, _res, next) => {
    const todasActivas = flags.every((flagName) => Boolean(env[flagName]));
    if (!todasActivas) {
      next(new NotFoundError(mensaje));
      return;
    }
    next();
  };
}

module.exports = { requireFeature };
