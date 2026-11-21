const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { env } = require('./config/env');
const { csrfProtection } = require('./middlewares/csrfProtection');
const { errorHandler } = require('./middlewares/errorHandler');
const { requestTimeout } = require('./middlewares/requestTimeout');
const apiRoutes = require('./routes');
const { NotFoundError } = require('./shared/errors/AppError');

function createApp() {
  const app = express();

  // Fase 2.3: Configuración explícita de proxy confiable para req.ip
  app.set('trust proxy', env.TRUST_PROXY);

  // Seguridad HTTP y CORS (con credenciales para cookies httpOnly)
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
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

  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

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
