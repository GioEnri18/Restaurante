import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requirePermission } from '../../shared/middlewares/authorize';
import { validate } from '../../shared/middlewares/validate';
import { CajaController } from './caja.controller';

const abrirCajaSchema = z.object({
  montoInicial: z.coerce.number().min(0, 'El monto inicial no puede ser negativo'),
  observaciones: z.string().trim().max(300).optional(),
});

const movimientoCajaSchema = z.object({
  tipo: z.enum(['INGRESO_MANUAL', 'EGRESO_MANUAL']),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  descripcion: z.string().trim().min(3, 'Ingresa una descripción del movimiento').max(250),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA']).optional().default('EFECTIVO'),
});

const cerrarCajaSchema = z.object({
  montoContadoEfectivo: z.coerce.number().min(0, 'El monto contado no puede ser negativo'),
  observacionesCierre: z.string().trim().max(300).optional(),
});

const router = Router();

router.use(authenticate);

router.get('/actual', requirePermission('caja:ver', 'ventas:ver'), CajaController.actual);
router.post('/abrir', requirePermission('caja:abrir'), validate(abrirCajaSchema), CajaController.abrir);
router.post(
  '/movimientos',
  requirePermission('caja:movimiento'),
  validate(movimientoCajaSchema),
  CajaController.registrarMovimiento,
);
router.post('/cerrar', requirePermission('caja:cerrar'), validate(cerrarCajaSchema), CajaController.cerrar);
router.get('/historial', requirePermission('caja:ver'), CajaController.historial);

export default router;
