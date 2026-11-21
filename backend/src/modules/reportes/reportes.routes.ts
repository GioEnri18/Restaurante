import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requirePermission } from '../../shared/middlewares/authorize';
import { ReportesController } from './reportes.controller';

const router = Router();

router.use(authenticate);

router.get('/resumen', requirePermission('reportes:ver'), ReportesController.resumen);
router.get('/ventas-periodo', requirePermission('reportes:ver'), ReportesController.ventasPeriodo);
router.get(
  '/productos-mas-vendidos',
  requirePermission('reportes:ver'),
  ReportesController.productosMasVendidos,
);
router.get('/exportar/pdf', requirePermission('reportes:exportar'), ReportesController.exportarPdf);
router.get('/exportar/excel', requirePermission('reportes:exportar'), ReportesController.exportarExcel);

export default router;
