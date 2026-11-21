const { Router } = require('express');
const { z } = require('zod');
const { MermasController } = require('../controllers/mermas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    cantidadMovimiento,
    enteroPositivoStr,
    fechaStr,
    idPositivo,
    paginacionQuery,
    rangoFechasQuery,
    refinarRangoFechas,
    textoBusqueda,
} = require('../shared/validators/common.validators');
const registrarMermaSchema = z.object({
    ingredienteId: idPositivo,
    cantidad: cantidadMovimiento,
    idempotencyKey: z.uuid().optional(),
    unidad: z.enum(['lb', 'oz']).default('oz'),
    motivo: z.enum(['VENCIMIENTO', 'DANO', 'ERROR_PREPARACION', 'ACCIDENTE', 'OTRO']),
    observacion: z.string().trim().max(300).optional(),
    fecha: z.union([fechaStr, z.iso.datetime({ offset: true })]).optional(),
});
const listarMermasQuerySchema = z
    .object({
    ...paginacionQuery,
    ...rangoFechasQuery,
    motivo: textoBusqueda(40).optional(),
    ingredienteId: enteroPositivoStr.optional(),
})
    .superRefine(refinarRangoFechas);
const router = Router();
router.use(authenticate);
router.get('/', requirePermission('mermas:ver'), validate(listarMermasQuerySchema, 'query'), MermasController.listar);
router.post('/', requirePermission('mermas:crear'), validate(registrarMermaSchema), MermasController.registrar);
module.exports = router;
