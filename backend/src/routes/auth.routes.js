const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { env } = require('../config/env');
const { AuthController } = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/authenticate');
const { validate } = require('../middlewares/validate');

const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'Ingresa tu usuario o correo electrónico'),
  // Tope de longitud: bcrypt solo usa 72 bytes y evita payloads abusivos
  password: z.string().min(4, 'Ingresa tu contraseña').max(128),
});

const mensajeDemasiadosIntentos = {
  ok: false,
  error: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.',
  },
};

// Auditoría P0.2: límite global por IP. El limitador IP + identificador por sí solo permitía
// probar contraseñas sin límite rotando el usuario (password spraying).
const loginIpLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
  message: mensajeDemasiadosIntentos,
});

// Fase 2.1: Rate limiter aplicado EXCLUSIVAMENTE a POST /auth/login con clave compuesta IP + identificador
const loginLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const rawId =
      req.body && typeof req.body.identifier === 'string'
        ? req.body.identifier.trim().toLowerCase().slice(0, 80)
        : 'anon';
    return `${ip}:${rawId}`;
  },
  message: mensajeDemasiadosIntentos,
});

const router = Router();

// Solo POST /login lleva rate limiting estricto; /logout y /me no se limitan con loginLimiter
router.post('/login', loginIpLimiter, loginLimiter, validate(loginSchema), AuthController.login);
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.me);

module.exports = router;
