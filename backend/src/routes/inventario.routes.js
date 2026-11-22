const { Router } = require('express');
const { z } = require('zod');
const { InventarioController } = require('../controllers/inventario.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    cantidadMovimiento,
    enteroPositivoStr,
    idPositivo,
    idParamsSchema,
    numeroDecimal,
    paginacionQuery,
    rangoFechasQuery,
    refinarRangoFechas,
    textoBusqueda,
} = require('../shared/validators/common.validators');
const crearIngredienteSchema = z.object({
    codigo: z.string().trim().min(2).max(30),
    nombre: z.string().trim().min(2).max(120),
    proveedorId: idPositivo.nullable().optional(),
    stockMinimo: numeroDecimal.pipe(z.number().min(0)),
    unidadStockMinimo: z.enum(['lb', 'oz']).default('lb'),
    stockInicial: numeroDecimal.pipe(z.number().min(0)).optional(),
    unidadStockInicial: z.enum(['lb', 'oz']).optional().default('lb'),
    precioPorLb: numeroDecimal.pipe(z.number().min(0.01, 'Indica un costo por libra mayor que cero').max(99999999.99)),
});
const actualizarIngredienteSchema = z.object({
    nombre: z.string().trim().min(2).max(120).optional(),
    proveedorId: idPositivo.nullable().optional(),
    stockMinimo: numeroDecimal.pipe(z.number().min(0)).optional(),
    unidadStockMinimo: z.enum(['lb', 'oz']).optional(),
    activo: z.boolean().optional(),
});
const ajustarStockSchema = z.object({
    tipoAjuste: z.enum(['ENTRADA', 'SALIDA']),
    cantidad: cantidadMovimiento,
    unidad: z.enum(['lb', 'oz']).default('oz'),
    motivo: z.string().trim().min(4, 'Indica el motivo del ajuste').max(250),
});
const proveedorSchema = z.object({
    nombre: z.string().trim().min(2).max(120),
    nit: z.string().trim().max(25).optional(),
    telefono: z.string().trim().max(30).optional(),
    email: z.string().trim().email('Correo inválido').optional().or(z.literal('')),
    contacto: z.string().trim().max(100).optional(),
});
const registrarCompraSchema = z.object({
    proveedorId: idPositivo,
    numeroDocumento: z.string().trim().max(60).optional(),
    observaciones: z.string().trim().max(300).optional(),
    items: z
        .array(z.object({
        ingredienteId: idPositivo,
        cantidadLb: cantidadMovimiento,
        precioPorLb: numeroDecimal.pipe(z.number().min(0.01, 'El precio por libra debe ser de al menos Q0.01').max(99999999.99)),
    }))
        .min(1, 'Agrega al menos un ingrediente a la compra')
        .max(200, 'La compra no puede tener más de 200 ingredientes'),
});
// Auditoría P1: validación de query params y :id
const busquedaQuerySchema = z.object({ search: textoBusqueda(80).optional() });
const paginacionQuerySchema = z.object(paginacionQuery);
const listarMovimientosQuerySchema = z
    .object({
    ...paginacionQuery,
    ...rangoFechasQuery,
    ingredienteId: enteroPositivoStr.optional(),
    tipo: textoBusqueda(40).optional(),
})
    .superRefine(refinarRangoFechas);
const idParams = validate(idParamsSchema, 'params');
const router = Router();
router.use(authenticate);
router.get('/ingredientes', requirePermission('inventario:ver', 'mermas:ver'), validate(busquedaQuerySchema, 'query'), InventarioController.listarIngredientes);
router.get('/alertas', requirePermission('inventario:ver'), InventarioController.alertas);
router.post('/ingredientes', requirePermission('inventario:gestionar'), validate(crearIngredienteSchema), InventarioController.crearIngrediente);
router.put('/ingredientes/:id', requirePermission('inventario:gestionar'), idParams, validate(actualizarIngredienteSchema), InventarioController.actualizarIngrediente);
router.post('/ingredientes/:id/ajustar', requirePermission('inventario:ajustar'), idParams, validate(ajustarStockSchema), InventarioController.ajustarStock);
router.get('/proveedores', requirePermission('inventario:ver'), InventarioController.listarProveedores);
router.post('/proveedores', requirePermission('inventario:gestionar'), validate(proveedorSchema), InventarioController.crearProveedor);
router.put('/proveedores/:id', requirePermission('inventario:gestionar'), idParams, validate(proveedorSchema.partial()), InventarioController.actualizarProveedor);
router.get('/compras', requirePermission('inventario:ver'), validate(paginacionQuerySchema, 'query'), InventarioController.listarCompras);
router.post('/compras', requirePermission('inventario:comprar'), validate(registrarCompraSchema), InventarioController.registrarCompra);
router.get('/movimientos', requirePermission('inventario:ver'), validate(listarMovimientosQuerySchema, 'query'), InventarioController.listarMovimientos);
module.exports = router;
