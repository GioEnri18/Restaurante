import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireAdmin, requirePermission } from '../../shared/middlewares/authorize';
import { validate } from '../../shared/middlewares/validate';
import { VentasController } from './ventas.controller';

const confirmarVentaSchema = z.object({
  tipoServicio: z.enum(['MOSTRADOR', 'LLEVAR', 'MESA', 'DELIVERY']).default('MOSTRADOR'),
  mesaId: z.coerce.number().int().positive().nullable().optional(),
  nombreTurno: z.string().trim().max(80).optional(),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA']),
  montoRecibido: z.coerce.number().min(0).optional(),
  referenciaPago: z.string().trim().max(80).optional(),
  clienteNit: z.string().trim().max(25).optional(),
  clienteNombre: z.string().trim().max(150).optional(),
  clienteDireccion: z.string().trim().max(250).optional(),
  observaciones: z.string().trim().max(300).optional(),
  datosDeliveryJson: z.record(z.unknown()).optional(),
  items: z
    .array(
      z.object({
        platilloId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().int().positive('La cantidad debe ser mayor a 0'),
        notas: z.string().trim().max(250).optional(),
      }),
    )
    .min(1, 'Agrega al menos un platillo al carrito'),
});

const platilloSchema = z.object({
  categoriaId: z.coerce.number().int().positive(),
  sku: z.string().trim().min(2).max(30),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(300).optional(),
  precioVenta: z.coerce.number().positive('El precio debe ser mayor a 0'),
  disponible: z.boolean().optional(),
  receta: z
    .array(
      z.object({
        ingredienteId: z.coerce.number().int().positive(),
        cantidadOz: z.coerce.number().positive('La cantidad en onzas debe ser mayor a 0'),
      }),
    )
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
    .array(
      z.object({
        platilloId: z.coerce.number().int().positive(),
        precioEspecial: z.coerce.number().positive().nullable().optional(),
      }),
    )
    .optional(),
});

const router = Router();

router.use(authenticate);

router.get('/menu', requirePermission('ventas:ver'), VentasController.menu);

// Menús especiales por fecha (gestión exclusiva de Administrador + avisos proactivos)
router.get('/menus-especiales/alertas', VentasController.alertasMenusEspeciales);
router.get(
  '/menus-especiales',
  requireAdmin,
  requirePermission('ventas:gestionar_menu'),
  VentasController.listarMenusEspeciales,
);
router.post(
  '/menus-especiales',
  requireAdmin,
  requirePermission('ventas:gestionar_menu'),
  validate(menuEspecialSchema),
  VentasController.crearMenuEspecial,
);
router.put(
  '/menus-especiales/:id',
  requireAdmin,
  requirePermission('ventas:gestionar_menu'),
  validate(menuEspecialSchema.partial()),
  VentasController.actualizarMenuEspecial,
);
router.delete(
  '/menus-especiales/:id',
  requireAdmin,
  requirePermission('ventas:gestionar_menu'),
  VentasController.eliminarMenuEspecial,
);

router.post(
  '/platillos',
  requirePermission('ventas:gestionar_menu', 'inventario:gestionar'),
  validate(platilloSchema),
  VentasController.crearPlatillo,
);
router.put(
  '/platillos/:id',
  requirePermission('ventas:gestionar_menu', 'inventario:gestionar'),
  validate(actualizarPlatilloSchema),
  VentasController.actualizarPlatillo,
);
router.post(
  '/confirmar',
  requirePermission('ventas:crear'),
  validate(confirmarVentaSchema),
  VentasController.confirmar,
);
router.get('/:id/comanda', requirePermission('ventas:ver', 'facturas:ver'), VentasController.obtenerComanda);

export default router;
