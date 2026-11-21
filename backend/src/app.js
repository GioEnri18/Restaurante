const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const { PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_URL, NOMBRE_FOTO_PLATILLO } = require('./config/platillos-media');
const { csrfProtection } = require('./middlewares/csrfProtection');
const { errorHandler } = require('./middlewares/errorHandler');
const { requestTimeout } = require('./middlewares/requestTimeout');
const apiRoutes = require('./routes');
const { NotFoundError } = require('./shared/errors/AppError');
const { httpLogger } = require('./shared/logger');

function createApp() {
  const app = express();

  // Fase 2.3: Configuración explícita de proxy confiable para req.ip
  app.set('trust proxy', env.TRUST_PROXY);

  // Logs estructurados JSON con requestId por petición (sin cookies ni Authorization).
  // Va primero para registrar también las peticiones rechazadas por CSRF o timeout.
  app.use(httpLogger);

  // Seguridad HTTP y CORS (con credenciales para cookies httpOnly)
  const corsOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );

  // Timeout anti-cola para evitar peticiones colgadas indefinidamente
  app.use(requestTimeout);

  // Lectura de cookies httpOnly y cuerpo JSON
  app.use(cookieParser());
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

  // Fase 2.7: Protección CSRF en profundidad para peticiones mutadoras con cookie de sesión
  app.use(csrfProtection);

  app.get(`${PLATILLOS_MEDIA_URL}/:nombre`, (req, res, next) => {
    const { nombre } = req.params;
    if (!NOMBRE_FOTO_PLATILLO.test(nombre)) return next(new NotFoundError('Foto no encontrada'));
    res.sendFile(nombre, {
      root: PLATILLOS_MEDIA_DIR,
      maxAge: '1d',
      immutable: true,
      headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
    }, (error) => {
      if (error?.status === 404) return next(new NotFoundError('Foto no encontrada'));
      if (error) next(error);
    });
  });

  // Enrutador central MVC versionado (env.API_PREFIX = /api/v1)
  app.use(env.API_PREFIX, apiRoutes);

  // Ruta no encontrada
  app.use((_req, _res, next) => {
    next(new NotFoundError('Endpoint no encontrado'));
  });

  // Manejo centralizado de errores (Sequelize + PostgreSQL + Zod + AppError)
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
