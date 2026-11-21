import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requirePermission } from '../../shared/middlewares/authorize';
import { validate } from '../../shared/middlewares/validate';
import { FacturasController } from './facturas.controller';

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
router.post(
  '/:id/anular',
  requirePermission('facturas:anular'),
  validate(anularFacturaSchema),
  FacturasController.anular,
);

export default router;
