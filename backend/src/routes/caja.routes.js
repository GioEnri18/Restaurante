const { Router } = require('express');
const { z } = require('zod');
const { CajaController } = require('../controllers/caja.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const { idPositivo, numeroDecimal, paginacionQuery } = require('../shared/validators/common.validators');
const { round2 } = require('../shared/utils/tax');
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
    cajaId: idPositivo.optional(),
    montoContadoEfectivo: numeroDecimal.pipe(z.number().min(0, 'El monto contado no puede ser negativo').max(9999999999.99))
        .refine((monto) => round2(monto) === monto, 'Usa hasta dos decimales'),
    vouchers: z.array(z.object({
        ventaId: idPositivo,
        referencia: z.string().trim().min(1, 'Ingresa el número de voucher').max(80),
        monto: numeroDecimal.pipe(z.number().positive().max(9999999999.99))
            .refine((monto) => round2(monto) === monto, 'Usa hasta dos decimales'),
    })).optional(),
    observacionesCierre: z.string().trim().max(300).optional(),
    autorizacion: autorizacionSchema,
});
const router = Router();
router.use(authenticate);
router.get('/actual', requirePermission('caja:ver', 'ventas:ver'), validate(z.object({
    incluirMovimientos: z.enum(['true', 'false']).optional(),
}), 'query'), CajaController.actual);
router.get('/vouchers', requirePermission('caja:cerrar'), validate(z.object({ page: paginacionQuery.page }), 'query'), CajaController.vouchers);
router.get('/movimientos', requirePermission('caja:ver'), validate(z.object({
    page: paginacionQuery.page,
    filtro: z.enum(['TODOS', 'VENTAS', 'INGRESOS', 'EGRESOS']).default('TODOS'),
}), 'query'), CajaController.movimientos);
router.post('/abrir', requirePermission('caja:abrir'), validate(abrirCajaSchema), CajaController.abrir);
router.post('/movimientos', requirePermission('caja:movimiento'), validate(movimientoCajaSchema), CajaController.registrarMovimiento);
router.post('/cerrar', requirePermission('caja:cerrar'), validate(cerrarCajaSchema), CajaController.cerrar);
router.get('/historial', requirePermission('caja:ver'), validate(z.object(paginacionQuery), 'query'), CajaController.historial);
module.exports = router;
