import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requirePermission } from '../../shared/middlewares/authorize';
import { validate } from '../../shared/middlewares/validate';
import { MermasController } from './mermas.controller';

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

export default router;
