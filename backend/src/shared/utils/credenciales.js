const { env } = require('../../config/env');

/**
 * Única fuente de verdad sobre qué credencial autentica una petición. La usan `authenticate`
 * y `csrfProtection`, así ambos deciden igual:
 * - Si viene `Authorization: Bearer <token>`, se usa ese token (clientes CLI/API, sin CSRF:
 *   un navegador cross-site no puede enviar ese header sin preflight CORS aprobado).
 * - Si no, se usa la cookie httpOnly de sesión, y entonces las peticiones mutadoras pasan por CSRF.
 * Antes `authenticate` preferia la cookie mientras CSRF se saltaba con cualquier header Bearer.
 */
function resolverCredencial(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    // Un header Bearer vacío no hace caer silenciosamente en la cookie
    return { token: bearer.length > 0 ? bearer : null, fuente: 'bearer' };
  }

  const cookieToken = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return { token: cookieToken.trim(), fuente: 'cookie' };
  }

  return { token: null, fuente: null };
}

module.exports = { resolverCredencial };
