const { Router } = require('express');
const { z } = require('zod');
const { MermasController } = require('../controllers/mermas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const registrarMermaSchema = z.object({
    ingredienteId: z.coerce.number().int().positive('Selecciona un ingrediente'),
    cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
    unidad: z.enum(['lb', 'oz']).default('oz'),
    motivo: z.enum(['VENCIMIENTO', 'DANO', 'ERROR_PREPARACION', 'ACCIDENTE', 'OTRO']),
    observacion: z.string().trim().max(300).optional(),
    fecha: z.string().optional(),
});
const router = Router();
router.use(authenticate);
router.get('/', requirePermission('mermas:ver'), MermasController.listar);
router.post('/', requirePermission('mermas:crear'), validate(registrarMermaSchema), MermasController.registrar);
module.exports = router;
