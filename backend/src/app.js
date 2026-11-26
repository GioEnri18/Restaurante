const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { env } = require('./config/env');
const {
  PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_BASE_DIR, PLATILLOS_MEDIA_URL, NOMBRE_FOTO_PLATILLO,
} = require('./config/platillos-media');
const { csrfProtection } = require('./middlewares/csrfProtection');
const { errorHandler } = require('./middlewares/errorHandler');
const { requestTimeout } = require('./middlewares/requestTimeout');
const apiRoutes = require('./routes');
const { obtenerFotoPlatilloDesdeDb } = require('./services/fotos-platillos.service');
const { NotFoundError } = require('./shared/errors/AppError');
const { httpLogger, logger } = require('./shared/logger');

function createApp() {
  const app = express();

  // Fase 2.3 / Fase 3.2: Configuración explícita de proxy confiable para req.ip
  app.set('trust proxy', env.TRUST_PROXY);
  if (env.NODE_ENV === 'production' && env.TRUST_PROXY === true) {
    logger.warn(
      { evento: 'TRUST_PROXY_PERMISIVO' },
      'TRUST_PROXY=true permite spoofing de X-Forwarded-For; usa un conteo numérico exacto de saltos (ej. 1 o 2).',
    );
  }

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

  app.get(`${PLATILLOS_MEDIA_URL}/:nombre`, async (req, res, next) => {
    const { nombre } = req.params;
    if (!NOMBRE_FOTO_PLATILLO.test(nombre)) return next(new NotFoundError('Foto no encontrada'));
    const opcionesDisco = {
      maxAge: '1d',
      immutable: true,
      headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
    };

    const enviarDesdeBase = () => {
      res.sendFile(nombre, { ...opcionesDisco, root: PLATILLOS_MEDIA_BASE_DIR }, (errorBase) => {
        if (errorBase?.status === 404) return next(new NotFoundError('Foto no encontrada'));
        if (errorBase) next(errorBase);
      });
    };

    // Modo persistente en BD (MEDIA_STORAGE=db): sirve desde `platillo_fotos` con ETag/304
    // y hace fallback a `PLATILLOS_MEDIA_BASE_DIR` para fotos precargadas del menú base.
    if (env.MEDIA_STORAGE === 'db') {
      try {
        const foto = await obtenerFotoPlatilloDesdeDb(nombre);
        if (foto && foto.bytes) {
          const etag = `"${foto.sha256}"`;
          res.setHeader('ETag', etag);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('X-Content-Type-Options', 'nosniff');

          const ifNoneMatch = String(req.headers['if-none-match'] || '').trim();
          const coincideEtag = ifNoneMatch
            .split(',')
            .map((t) => t.trim())
            .some((t) => t === etag || t === `W/${etag}` || t === '*');
          if (coincideEtag) {
            return res.status(304).end();
          }

          res.setHeader('Content-Type', foto.mime || 'image/webp');
          res.setHeader('Content-Length', String(foto.bytes.length));
          return res.status(200).send(foto.bytes);
        }
      } catch (error) {
        return next(error);
      }
      return enviarDesdeBase();
    }

    // Modo local (default): disco/volumen local con fallback a `PLATILLOS_MEDIA_BASE_DIR`
    res.sendFile(nombre, { ...opcionesDisco, root: PLATILLOS_MEDIA_DIR }, (error) => {
      if (error?.status !== 404) {
        if (error) next(error);
        return;
      }
      enviarDesdeBase();
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
