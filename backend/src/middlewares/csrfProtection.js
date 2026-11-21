const { env } = require('../config/env');
const { ForbiddenError } = require('../shared/errors/AppError');

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

  const hasSessionCookie = Boolean(req.cookies && req.cookies[env.AUTH_COOKIE_NAME]);
  const hasBearerHeader =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ');

  // Si la petición no depende de cookie de sesión (ej. login inicial o cliente API con Bearer), continuar
  if (!hasSessionCookie || hasBearerHeader) {
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
