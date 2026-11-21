import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler } from './shared/errors/errorHandler';
import { NotFoundError } from './shared/errors/AppError';

// Routers de los 9 módulos de dominio
import authRoutes from './modules/auth/auth.routes';
import ventasRoutes from './modules/ventas/ventas.routes';
import facturasRoutes from './modules/facturas/facturas.routes';
import inventarioRoutes from './modules/inventario/inventario.routes';
import mermasRoutes from './modules/mermas/mermas.routes';
import cajaRoutes from './modules/caja/caja.routes';
import reportesRoutes from './modules/reportes/reportes.routes';
import auditoriaRoutes from './modules/auditoria/auditoria.routes';
import accesosRoutes from './modules/accesos/accesos.routes';

export function createApp() {
  const app = express();

  // Seguridad HTTP y CORS
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );

  // Límite contra fuerza bruta en login (configurable por variables de entorno)
  const authLimiter = rateLimit({
    windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Intenta más tarde.' },
    },
  });

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  const apiPrefix = env.API_PREFIX;

  // Salud de la API versionada
  app.get(`${apiPrefix}/health`, (_req, res) => {
    res.status(200).json({
      ok: true,
      data: {
        service: 'pos-restaurante-gt-api',
        version: apiPrefix,
        currency: env.CURRENCY_CODE,
        currencySymbol: env.CURRENCY_SYMBOL,
        ivaRate: env.IVA_RATE,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Montaje de los 9 módulos bajo el prefijo configurado en API_PREFIX
  app.use(`${apiPrefix}/auth`, authLimiter, authRoutes);
  app.use(`${apiPrefix}/ventas`, ventasRoutes);
  app.use(`${apiPrefix}/facturas`, facturasRoutes);
  app.use(`${apiPrefix}/inventario`, inventarioRoutes);
  app.use(`${apiPrefix}/mermas`, mermasRoutes);
  app.use(`${apiPrefix}/caja`, cajaRoutes);
  app.use(`${apiPrefix}/reportes`, reportesRoutes);
  app.use(`${apiPrefix}/auditoria`, auditoriaRoutes);
  app.use(`${apiPrefix}/accesos`, accesosRoutes);

  // Ruta no encontrada
  app.use((_req, _res, next) => {
    next(new NotFoundError('Endpoint no encontrado'));
  });

  // Manejo centralizado de errores
  app.use(errorHandler);

  return app;
}
