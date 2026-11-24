const { Router } = require('express');
const { z } = require('zod');
const { env } = require('../config/env');
const { VentasController } = require('../controllers/ventas.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requireAdmin, requireAllPermissions, requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const { recibirFotoPlatillo } = require('../middlewares/recibirFotoPlatillo');
const {
    enteroPositivoStr,
    idParamsSchema,
    textoBusqueda,
} = require('../shared/validators/common.validators');
// Valida profundidad y cantidad total de claves en datosDeliveryJson para evitar payloads abusivos
function inspeccionarJson(obj, profundidadActual = 1) {
    if (obj === null || typeof obj !== 'object') {
        return { claves: 0, profundidadMax: profundidadActual };
    }
    const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
    let claves = Array.isArray(obj) ? 0 : entries.length;
    let profundidadMax = profundidadActual;
    for (const [, val] of entries) {
        if (val !== null && typeof val === 'object') {
            const sub = inspeccionarJson(val, profundidadActual + 1);
            claves += sub.claves;
            if (sub.profundidadMax > profundidadMax) {
                profundidadMax = sub.profundidadMax;
            }
        }
    }
    return { claves, profundidadMax };
}
const confirmarVentaSchema = z
    .object({
    // Auditoría P0.4: obligatoria para que un reintento del cliente nunca duplique un cobro
    idempotencyKey: z.string({ error: 'idempotencyKey es obligatoria (UUID por intento de cobro)' })
        .uuid('idempotencyKey debe ser un UUID válido'),
    tipoServicio: z.enum(['MOSTRADOR', 'LLEVAR', 'MESA', 'DELIVERY']).default('MOSTRADOR'),
    mesaId: z.coerce.number().int().positive().nullable().optional(),
    nombreTurno: z.string().trim().max(80).optional(),
    metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'SIN_COBRO']),
    cortesia: z.object({
        motivo: z.string().trim().min(3).max(250),
        autorizacion: z.object({
            identifier: z.string().trim().min(2).max(120),
            password: z.string().min(1).max(128),
        }),
    }).optional(),
    montoRecibido: z.coerce.number().min(0).optional(),
    referenciaPago: z.string().trim().max(80).optional(),
    clienteNit: z.string().trim().max(25).optional(),
    clienteNombre: z.string().trim().max(150).optional(),
    clienteDireccion: z.string().trim().max(250).optional(),
    observaciones: z.string().trim().max(300).optional(),
    datosDeliveryJson: z.record(z.string(), z.unknown()).optional(),
    // Límites de carga: un pedido real de restaurante no necesita más, y acotan el costo por petición
    items: z
        .array(z.object({
        platilloId: z.coerce.number().int().positive(),
        cantidad: z.coerce
            .number()
            .int()
            .positive('La cantidad debe ser mayor a 0')
            .max(env.VENTA_MAX_CANTIDAD_POR_LINEA, `La cantidad por platillo no puede superar ${env.VENTA_MAX_CANTIDAD_POR_LINEA}`),
        notas: z.string().trim().max(250).optional(),
        cantidadCortesia: z.number().int().nonnegative().optional(),
    }))
        .min(1, 'Agrega al menos un platillo al carrito')
        .max(env.VENTA_MAX_LINEAS, `El pedido no puede tener más de ${env.VENTA_MAX_LINEAS} líneas`),
})
    .superRefine((data, ctx) => {
    // 1.6 Si el servicio es en MESA, mesaId es obligatorio
    if (data.tipoServicio === 'MESA' && !data.mesaId) {
        ctx.addIssue({
            code: 'custom',
            path: ['mesaId'],
            message: 'Debes seleccionar una mesa para el servicio en mesa',
        });
    }
    // 1.6 Si el método de pago es TARJETA, referenciaPago es obligatoria
    if (data.metodoPago === 'TARJETA' &&
        (!data.referenciaPago || data.referenciaPago.trim().length === 0)) {
        ctx.addIssue({
            code: 'custom',
            path: ['referenciaPago'],
            message: 'La referencia o número de autorización es obligatoria para pagos con tarjeta',
        });
    }
    // 1.6 Limitar tamaño, número de claves y profundidad de datosDeliveryJson
    if (data.datosDeliveryJson !== undefined) {
        const bytes = Buffer.byteLength(JSON.stringify(data.datosDeliveryJson), 'utf8');
        if (bytes > env.DELIVERY_JSON_MAX_BYTES) {
            ctx.addIssue({
                code: 'custom',
                path: ['datosDeliveryJson'],
                message: `datosDeliveryJson excede el tamaño máximo permitido (${env.DELIVERY_JSON_MAX_BYTES} bytes)`,
            });
        }
        const { claves, profundidadMax } = inspeccionarJson(data.datosDeliveryJson);
        if (claves > env.DELIVERY_JSON_MAX_KEYS) {
            ctx.addIssue({
                code: 'custom',
                path: ['datosDeliveryJson'],
                message: `datosDeliveryJson excede el máximo de ${env.DELIVERY_JSON_MAX_KEYS} claves`,
            });
        }
        if (profundidadMax > env.DELIVERY_JSON_MAX_DEPTH) {
            ctx.addIssue({
                code: 'custom',
                path: ['datosDeliveryJson'],
                message: `datosDeliveryJson excede la profundidad máxima permitida (${env.DELIVERY_JSON_MAX_DEPTH} niveles)`,
            });
        }
    }
});
const estadoMesaSchema = z.object({
    estado: z.enum(['DISPONIBLE', 'OCUPADA', 'RESERVADA']),
});
const categoriaSchema = z.object({
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(80),
    descripcion: z.string().trim().max(250).optional(),
    orden: z.coerce.number().int().min(0).max(999).optional(),
});
const platilloSchema = z.object({
    categoriaId: z.coerce.number().int().positive(),
    sku: z.string().trim().min(2).max(30),
    nombre: z.string().trim().min(2).max(120),
    descripcion: z.string().trim().max(300).optional(),
    precioVenta: z.coerce.number().min(0.01, 'El precio debe ser de al menos Q0.01'),
    disponible: z.boolean().optional(),
    receta: z
        .array(z.object({
        ingredienteId: z.coerce.number().int().positive(),
        cantidadOz: z.coerce.number().min(0.0001, 'La cantidad mínima es 0.0001 oz'),
    }))
        .max(50, 'La receta no puede tener más de 50 ingredientes')
        .optional(),
});
const actualizarPlatilloSchema = platilloSchema.partial().extend({
    motivo: z.string().trim().max(250).optional(),
});
const menuEspecialSchema = z.object({
    nombre: z.string().trim().min(3, 'Ingresa el nombre del menú especial').max(120),
    descripcion: z.string().trim().max(300).optional(),
    fechaInicio: z.string().min(8, 'Selecciona la fecha de inicio'),
    fechaFin: z.string().min(8, 'Selecciona la fecha de finalización'),
    diasAvisoPrevio: z.coerce.number().int().min(1).max(60).optional(),
    activo: z.boolean().optional(),
    esMenuPrincipal: z.boolean().optional(),
    platillos: z
        .array(z.object({
        platilloId: z.coerce.number().int().positive(),
        precioEspecial: z.coerce.number().min(0.01, 'El precio especial debe ser de al menos Q0.01').nullable().optional(),
    }))
        .max(300, 'El menú especial no puede tener más de 300 platillos')
        .optional(),
});
// Auditoría P1: validación de query params y :id
const menuQuerySchema = z.object({
    search: textoBusqueda(80).optional(),
    categoriaId: enteroPositivoStr.optional(),
});
const idParams = validate(idParamsSchema, 'params');
const router = Router();
router.use(authenticate);
router.get('/menu', requirePermission('ventas:ver'), validate(menuQuerySchema, 'query'), VentasController.menu);
// Liberar o actualizar estado de mesas (DISPONIBLE / OCUPADA / RESERVADA)
router.patch('/mesas/:id/estado', requirePermission('ventas:crear'), idParams, validate(estadoMesaSchema), VentasController.actualizarEstadoMesa);
// Fase 2.6: Permiso estricto para crear/editar platillos:
// Siempre exige ventas:gestionar_menu; si además modifica/define receta, exige TAMBIÉN inventario:gestionar.
function requirePlatilloPermissions(req, res, next) {
    const incluyeReceta = req.body?.receta !== undefined;
    const middleware = incluyeReceta
        ? requireAllPermissions('ventas:gestionar_menu', 'inventario:gestionar')
        : requireAllPermissions('ventas:gestionar_menu');
    middleware(req, res, next);
}

// Menús especiales por fecha (gestión exclusiva de Administrador + avisos proactivos con permiso ventas:ver)
router.get('/menus-especiales/alertas', requirePermission('ventas:ver'), VentasController.alertasMenusEspeciales);
router.get('/menus-especiales', requireAdmin, requirePermission('ventas:gestionar_menu'), VentasController.listarMenusEspeciales);
router.post('/menus-especiales', requireAdmin, requirePermission('ventas:gestionar_menu'), validate(menuEspecialSchema), VentasController.crearMenuEspecial);
router.put('/menus-especiales/:id', requireAdmin, requirePermission('ventas:gestionar_menu'), idParams, validate(menuEspecialSchema.partial()), VentasController.actualizarMenuEspecial);
router.delete('/menus-especiales/:id', requireAdmin, requirePermission('ventas:gestionar_menu'), idParams, VentasController.eliminarMenuEspecial);
// Creación de categorías y nuevos platillos reservada exclusivamente para el Administrador
router.post('/categorias', requireAdmin, requirePermission('ventas:gestionar_menu'), validate(categoriaSchema), VentasController.crearCategoria);
router.post('/platillos', requireAdmin, requirePermission('ventas:gestionar_menu'), validate(platilloSchema), requirePlatilloPermissions, VentasController.crearPlatillo);
router.put('/platillos/:id', requirePermission('ventas:gestionar_menu'), idParams, validate(actualizarPlatilloSchema), requirePlatilloPermissions, VentasController.actualizarPlatillo);
router.put('/platillos/:id/imagen', requireAdmin, requirePermission('ventas:gestionar_menu'), idParams, recibirFotoPlatillo, VentasController.subirFotoPlatillo);
router.post('/confirmar', requirePermission('ventas:crear'), validate(confirmarVentaSchema), VentasController.confirmar);
router.get('/:id/comanda', requirePermission('ventas:ver', 'facturas:ver'), idParams, VentasController.obtenerComanda);
module.exports = router;
