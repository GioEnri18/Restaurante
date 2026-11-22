const { Router } = require('express');
const { z } = require('zod');
const { CajaController } = require('../controllers/caja.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const { paginacionQuery } = require('../shared/validators/common.validators');
// Control dual: credenciales del supervisor (Administrador/Auditor) que autoriza abrir o cerrar.
// Obligatorias para quien no tiene el permiso caja:autorizar (el servicio lo verifica).
const autorizacionSchema = z
    .object({
    identifier: z.string().trim().min(2, 'Ingresa el usuario del supervisor').max(120),
    password: z.string().min(1, 'Ingresa la contraseña del supervisor').max(128),
})
    .optional();
const abrirCajaSchema = z.object({
    montoInicial: z.coerce.number().min(0, 'El monto inicial no puede ser negativo'),
    observaciones: z.string().trim().max(300).optional(),
    autorizacion: autorizacionSchema,
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
    autorizacion: autorizacionSchema,
});
const router = Router();
router.use(authenticate);
router.get('/actual', requirePermission('caja:ver', 'ventas:ver'), CajaController.actual);
router.post('/abrir', requirePermission('caja:abrir'), validate(abrirCajaSchema), CajaController.abrir);
router.post('/movimientos', requirePermission('caja:movimiento'), validate(movimientoCajaSchema), CajaController.registrarMovimiento);
router.post('/cerrar', requirePermission('caja:cerrar'), validate(cerrarCajaSchema), CajaController.cerrar);
router.get('/historial', requirePermission('caja:ver'), validate(z.object(paginacionQuery), 'query'), CajaController.historial);
module.exports = router;
