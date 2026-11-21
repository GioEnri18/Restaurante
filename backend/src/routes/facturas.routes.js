const { Router } = require('express');
const { z } = require('zod');
const { FacturasController } = require('../controllers/facturas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const anularFacturaSchema = z.object({
    motivo: z.string().trim().min(5, 'El motivo de anulación debe tener al menos 5 caracteres').max(300),
    reintegrarInventario: z.boolean().default(false),
});
const router = Router();
router.use(authenticate);
// Nota de negocio: NO existen endpoints PUT ni DELETE para facturas (inmutables)
router.get('/', requirePermission('facturas:ver'), FacturasController.listar);
router.get('/:id', requirePermission('facturas:ver'), FacturasController.detalle);
router.post('/:id/reimprimir', requirePermission('facturas:reimprimir'), FacturasController.reimprimir);
router.post('/:id/anular', requirePermission('facturas:anular'), validate(anularFacturaSchema), FacturasController.anular);
module.exports = router;
