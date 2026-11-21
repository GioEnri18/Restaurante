const { Router } = require('express');
const { verificarBaseDatos } = require('../config/database');
const { env } = require('../config/env');
const accesosRoutes = require('./accesos.routes');
const auditoriaRoutes = require('./auditoria.routes');
const authRoutes = require('./auth.routes');
const cajaRoutes = require('./caja.routes');
const facturasRoutes = require('./facturas.routes');
const inventarioRoutes = require('./inventario.routes');
const mermasRoutes = require('./mermas.routes');
const reportesRoutes = require('./reportes.routes');
const ventasRoutes = require('./ventas.routes');

const router = Router();

// Readiness: ¿puede atender peticiones? Verifica PostgreSQL (503 si no responde).
// Úsalo en el healthcheck de Docker / balanceador; /health solo indica que el proceso vive.
router.get('/health/ready', async (_req, res) => {
  const db = await verificarBaseDatos();
  res.status(db.ok ? 200 : 503).json({
    ok: db.ok,
    data: {
      status: db.ok ? 'ready' : 'unavailable',
      database: { ok: db.ok, latencyMs: db.latenciaMs },
      timestamp: new Date().toISOString(),
    },
  });
});

// Liveness: el proceso responde (no consulta la base de datos)
router.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    data: {
      service: 'pos-restaurante-gt-api',
      orm: 'sequelize',
      version: env.API_PREFIX,
      currency: env.CURRENCY_CODE,
      currencySymbol: env.CURRENCY_SYMBOL,
      ivaRate: env.IVA_RATE,
      timestamp: new Date().toISOString(),
    },
  });
});

// Montaje de los 9 dominios MVC (Fase 2.1: el rate limiter vive únicamente en POST /auth/login)
router.use('/auth', authRoutes);
router.use('/ventas', ventasRoutes);
router.use('/facturas', facturasRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/mermas', mermasRoutes);
router.use('/caja', cajaRoutes);
router.use('/reportes', reportesRoutes);
router.use('/auditoria', auditoriaRoutes);
router.use('/accesos', accesosRoutes);

module.exports = router;
