const { Router } = require('express');
const { z } = require('zod');
const { ReportesController } = require('../controllers/reportes.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    rangoFechasQuery,
    refinarRangoFechas,
} = require('../shared/validators/common.validators');
// Auditoría P1: fechas YYYY-MM-DD válidas, desde <= hasta y rango máximo acotado
const rangoReporteSchema = z.object(rangoFechasQuery).superRefine(refinarRangoFechas);
const topProductosSchema = z
    .object({
    ...rangoFechasQuery,
    limit: z
        .string()
        .regex(/^\d{1,2}$/, 'limit debe ser un entero entre 1 y 50')
        .refine((v) => Number(v) >= 1 && Number(v) <= 50, 'limit debe ser un entero entre 1 y 50')
        .optional(),
})
    .superRefine(refinarRangoFechas);
const router = Router();
router.use(authenticate);
router.get('/resumen', requirePermission('reportes:ver'), validate(rangoReporteSchema, 'query'), ReportesController.resumen);
router.get('/ventas-periodo', requirePermission('reportes:ver'), validate(rangoReporteSchema, 'query'), ReportesController.ventasPeriodo);
router.get('/productos-mas-vendidos', requirePermission('reportes:ver'), validate(topProductosSchema, 'query'), ReportesController.productosMasVendidos);
router.get('/exportar/pdf', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarPdf);
router.get('/exportar/excel', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarExcel);
module.exports = router;
