const { env } = require('../config/env');
const { ForbiddenError } = require('../shared/errors/AppError');
const { resolverCredencial } = require('../shared/utils/credenciales');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getAllowedOrigins() {
  return new Set(
    env.CORS_ORIGIN.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  );
}

function extractOriginFromHeader(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return null;
  try {
    return new URL(headerValue).origin;
  } catch {
    return null;
  }
}

/**
 * Protección CSRF en profundidad para sesiones autenticadas con cookie httpOnly (Fase 2.7):
 * 1. Además de SameSite=Lax/Strict en la cookie, toda petición mutadora (POST/PUT/PATCH/DELETE)
 *    que use la cookie de sesión (sin Authorization: Bearer explícito) debe:
 *    - Incluir el encabezado personalizado `X-Requested-With: XMLHttpRequest` (imposible de falsificar
 *      desde un formulario HTML cross-site sin preflight CORS aprobado).
 *    - Tener un `Origin` o `Referer` coincidente con `CORS_ORIGIN` cuando el navegador lo envía.
 */
function csrfProtection(req, _res, next) {
  if (!env.CSRF_PROTECTION_ENABLED) {
    next();
    return;
  }

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  // Misma decisión que authenticate: solo se exige CSRF cuando la cookie es la credencial usada
  // (login inicial sin sesión o cliente API con Bearer no dependen de la cookie)
  if (resolverCredencial(req).fuente !== 'cookie') {
    next();
    return;
  }

  // 1. Verificar encabezado personalizado anti-CSRF
  const xRequestedWith = String(req.headers['x-requested-with'] || '').toLowerCase();
  if (xRequestedWith !== 'xmlhttprequest') {
    next(new ForbiddenError('Solicitud bloqueada por protección CSRF (falta encabezado X-Requested-With)'));
    return;
  }

  // 2. Validar Origin o Referer contra la lista blanca CORS_ORIGIN
  const allowedOrigins = getAllowedOrigins();
  const originHeader =
    extractOriginFromHeader(req.headers.origin) || extractOriginFromHeader(req.headers.referer);

  if (originHeader && !allowedOrigins.has(originHeader)) {
    next(new ForbiddenError('Solicitud bloqueada por protección CSRF (origen no autorizado)'));
    return;
  }

  next();
}

module.exports = { csrfProtection };
