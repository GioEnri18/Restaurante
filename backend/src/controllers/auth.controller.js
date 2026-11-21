const { env } = require('../config/env');
const { extractClientMeta } = require('../middlewares/authenticate');
const { AuthService } = require('../services/auth.service');

function buildSessionCookieOptions() {
  const isSecure = env.NODE_ENV === 'production' || env.AUTH_COOKIE_SECURE;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: env.AUTH_COOKIE_SAMESITE,
    maxAge: env.AUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

class AuthController {
  static async login(req, res, next) {
    try {
      const { identifier, password } = req.body;
      const clientMeta = extractClientMeta(req);
      const data = await AuthService.login(identifier, password, clientMeta);

      // Fase 2.7: Almacenar el JWT únicamente en cookie httpOnly (no expuesto a localStorage/XSS)
      res.cookie(env.AUTH_COOKIE_NAME, data.token, buildSessionCookieOptions());

      res.status(200).json({
        ok: true,
        data: {
          usuario: data.usuario,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      await AuthService.logout(req.user, req.clientMeta);

      // Limpiar la cookie httpOnly de sesión con las mismas banderas de seguridad
      const { maxAge: _ignored, ...clearOptions } = buildSessionCookieOptions();
      res.clearCookie(env.AUTH_COOKIE_NAME, clearOptions);

      res.status(200).json({ ok: true, data: { message: 'Sesión cerrada correctamente' } });
    } catch (error) {
      next(error);
    }
  }

  static async me(req, res, next) {
    try {
      const data = await AuthService.getProfile(req.user);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { AuthController };
