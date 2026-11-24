const { Router } = require('express');
const { z } = require('zod');
const { ReportesController } = require('../controllers/reportes.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requireAdmin, requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    rangoFechasQuery,
    fechaStr,
    montoStr,
    paginacionQuery,
    refinarRangoFechas,
} = require('../shared/validators/common.validators');
// Auditoría P1: fechas YYYY-MM-DD válidas, desde <= hasta y rango máximo acotado
const rangoReporteSchema = z.object(rangoFechasQuery).superRefine(refinarRangoFechas);
const gastoOperativoSchema = z.object({
    registroId: z.uuid(),
    categoria: z.enum(['ALQUILER', 'OTRO']),
    fecha: fechaStr,
    monto: montoStr.refine((v) => Number(v) > 0, 'El monto debe ser mayor a cero'),
    concepto: z.string().trim().min(1).max(200),
    recurrente: z.boolean().default(false),
    hastaMes: fechaStr.optional(),
}).superRefine((gasto, ctx) => {
    if (gasto.recurrente && (gasto.categoria !== 'ALQUILER' || !gasto.fecha.endsWith('-01'))) {
        ctx.addIssue({ code: 'custom', path: ['fecha'], message: 'Indica el primer día del mes de inicio del alquiler' });
    }
    if (gasto.hastaMes && (!gasto.recurrente || !gasto.hastaMes.endsWith('-01') || gasto.hastaMes < gasto.fecha)) {
        ctx.addIssue({ code: 'custom', path: ['hastaMes'], message: 'El último mes debe ser igual o posterior al mes inicial' });
    }
});
const ventasPeriodoSchema = z.object({ ...rangoFechasQuery, page: paginacionQuery.page }).superRefine(refinarRangoFechas);
const topProductosSchema = z
    .object({
    ...rangoFechasQuery,
    page: paginacionQuery.page,
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
router.get('/balance', requirePermission('reportes:balance'), validate(rangoReporteSchema, 'query'), ReportesController.balance);
router.get('/gastos', requirePermission('reportes:balance'), validate(ventasPeriodoSchema, 'query'), ReportesController.gastos);
router.post('/gastos', requireAdmin, requirePermission('reportes:balance'), validate(gastoOperativoSchema), ReportesController.registrarGasto);
router.get('/ventas-periodo', requirePermission('reportes:ver'), validate(ventasPeriodoSchema, 'query'), ReportesController.ventasPeriodo);
router.get('/productos-mas-vendidos', requirePermission('reportes:ver'), validate(topProductosSchema, 'query'), ReportesController.productosMasVendidos);
router.get('/exportar/pdf', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarPdf);
router.get('/exportar/excel', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarExcel);
module.exports = router;
