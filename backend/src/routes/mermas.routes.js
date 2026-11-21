const { Router } = require('express');
const { z } = require('zod');
const { MermasController } = require('../controllers/mermas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    enteroPositivoStr,
    paginacionQuery,
    rangoFechasQuery,
    refinarRangoFechas,
    textoBusqueda,
} = require('../shared/validators/common.validators');
const registrarMermaSchema = z.object({
    ingredienteId: z.coerce.number().int().positive('Selecciona un ingrediente'),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
    unidad: z.enum(['lb', 'oz']).default('oz'),
    motivo: z.enum(['VENCIMIENTO', 'DANO', 'ERROR_PREPARACION', 'ACCIDENTE', 'OTRO']),
    observacion: z.string().trim().max(300).optional(),
    // Auditoría P1: fecha ISO válida y no futura (antes aceptaba cualquier texto)
    fecha: z
        .string()
        .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de merma inválida')
        .refine((v) => Date.parse(v) <= Date.now() + 60_000, 'La fecha de la merma no puede ser futura')
        .optional(),
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
