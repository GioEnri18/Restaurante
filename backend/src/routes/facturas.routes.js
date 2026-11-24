const { Router } = require('express');
const { z } = require('zod');
const { CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { FacturasController } = require('../controllers/facturas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    idParamsSchema,
    montoStr,
    paginacionQuery,
    rangoFechasQuery,
    refinarRangoFechas,
    textoBusqueda,
} = require('../shared/validators/common.validators');
const anularFacturaSchema = z.object({
    motivo: z.string().trim().min(5, 'El motivo de anulación debe tener al menos 5 caracteres').max(300),
    codigoMotivo: z.enum(Object.values(CODIGOS_MOTIVO_AUDITORIA)).optional(),
    reintegrarInventario: z.boolean().default(false),
});
const reimprimirSchema = z.object({ documento: z.enum(['FACTURA', 'COMANDA']).default('FACTURA') })
    .default({ documento: 'FACTURA' });
// Auditoría P1: filtros de listado validados (montos, fechas, estado y longitud de búsquedas)
const listarFacturasQuerySchema = z
    .object({
    ...paginacionQuery,
    ...rangoFechasQuery,
    numero: textoBusqueda(30).optional(),
    cliente: textoBusqueda(100).optional(),
    montoMin: montoStr.optional(),
    montoMax: montoStr.optional(),
    estado: z.enum(['EMITIDA', 'ANULADA']).optional(),
})
    .superRefine(refinarRangoFechas);
const router = Router();
router.use(authenticate);
// Nota de negocio: NO existen endpoints PUT ni DELETE para facturas (inmutables)
router.get('/', requirePermission('facturas:ver'), validate(listarFacturasQuerySchema, 'query'), FacturasController.listar);
router.get('/:id', requirePermission('facturas:ver'), validate(idParamsSchema, 'params'), FacturasController.detalle);
router.post('/:id/reimprimir', requirePermission('facturas:reimprimir'), validate(idParamsSchema, 'params'), validate(reimprimirSchema), FacturasController.reimprimir);
router.post('/:id/anular', requirePermission('facturas:anular'), validate(idParamsSchema, 'params'), validate(anularFacturaSchema), FacturasController.anular);
module.exports = router;
