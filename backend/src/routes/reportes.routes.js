const { Router } = require('express');
const { z } = require('zod');
const { ReportesController } = require('../controllers/reportes.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requireAdmin, requirePermission, requireRole } = require('../middlewares/authorize');
const { requireFeature } = require('../middlewares/featureFlag');
const { ROL_ADMIN_CODIGO } = require('../config/constants');
const { validate } = require('../middlewares/validate');
const {
    rangoFechasQuery,
    fechaStr,
    montoStr,
    idParamsSchema,
    paginacionQuery,
    refinarRangoFechas,
} = require('../shared/validators/common.validators');
// Auditoría P1: fechas YYYY-MM-DD válidas, desde <= hasta y rango máximo acotado
const rangoReporteSchema = z.object(rangoFechasQuery).superRefine(refinarRangoFechas);
const datosGasto = {
    fecha: fechaStr,
    monto: montoStr.refine((v) => Number(v) > 0, 'El monto debe ser mayor a cero'),
    concepto: z.string().trim().min(1).max(200),
};
const version = z.number().int().positive().max(2147483647);
const editarGastoSchema = z.object({ ...datosGasto, version });
const anularGastoSchema = z.object({ version, motivo: z.string().trim().min(3).max(250) });
const gastoOperativoSchema = z.object({
    ...datosGasto,
    registroId: z.uuid(),
    categoria: z.enum(['ALQUILER', 'OTRO']).default('OTRO'),
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
const puedeConsultarEconomia = [requireRole(ROL_ADMIN_CODIGO, 'AUDITOR'), requirePermission('reportes:balance')];
router.use(authenticate);
router.get('/resumen', requirePermission('reportes:ver'), validate(rangoReporteSchema, 'query'), ReportesController.resumen);
router.get('/balance', puedeConsultarEconomia, validate(rangoReporteSchema, 'query'), ReportesController.balance);
router.get('/gastos', puedeConsultarEconomia, validate(ventasPeriodoSchema, 'query'), ReportesController.gastos);
router.post('/gastos', requireAdmin, requirePermission('reportes:balance'), validate(gastoOperativoSchema), ReportesController.registrarGasto);
router.put('/gastos/:id', requireAdmin, requirePermission('reportes:balance'), validate(idParamsSchema, 'params'), validate(editarGastoSchema), ReportesController.modificarGasto);
router.post('/gastos/:id/anular', requireAdmin, requirePermission('reportes:balance'), validate(idParamsSchema, 'params'), validate(anularGastoSchema), ReportesController.modificarGasto);
router.get('/ventas-periodo', requirePermission('reportes:ver'), validate(ventasPeriodoSchema, 'query'), ReportesController.ventasPeriodo);
router.get('/productos-mas-vendidos', requirePermission('reportes:ver'), validate(topProductosSchema, 'query'), ReportesController.productosMasVendidos);
router.get('/domicilios', requireFeature('ENABLE_DELIVERY'), requirePermission('reportes:ver'), validate(rangoReporteSchema, 'query'), ReportesController.domicilios);
router.get('/exportar/pdf', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarPdf);
router.get('/exportar/excel', requirePermission('reportes:exportar'), validate(rangoReporteSchema, 'query'), ReportesController.exportarExcel);
module.exports = router;
