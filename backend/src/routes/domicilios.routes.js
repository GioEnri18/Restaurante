const { Router } = require('express');
const { z } = require('zod');
const { CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { env } = require('../config/env');
const { DomiciliosController } = require('../controllers/domicilios.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { requireFeature } = require('../middlewares/featureFlag');
const { crearRateLimiter, obtenerIpCliente } = require('../middlewares/rateLimiter');
const { validate } = require('../middlewares/validate');
const { EstadoPedidoDomicilio, MetodoPago, ModalidadPagoDomicilio } = require('../models/enums');
const {
  enteroPositivoStr,
  idParamsSchema,
  idPositivo,
  paginacionQuery,
  rangoFechasQuery,
  refinarRangoFechas,
} = require('../shared/validators/common.validators');

// Rate limit dedicado para búsqueda de clientes por teléfono (protección contra scraping de PII)
const busquedaClientesLimiter = crearRateLimiter({
  prefix: 'dom:clientes:buscar:',
  windowMs: env.DELIVERY_CLIENTE_BUSQUEDA_WINDOW_MS,
  max: env.DELIVERY_CLIENTE_BUSQUEDA_MAX,
  keyGenerator: (req) => `dom-cli:${req.user?.id ?? 'anon'}:${obtenerIpCliente(req)}`,
  message: {
    ok: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Demasiadas búsquedas de clientes en poco tiempo. Espera un momento e intenta nuevamente.',
    },
  },
});

const telefonoSchema = z
  .string()
  .trim()
  .min(4, 'El teléfono debe tener al menos 4 caracteres')
  .max(25, 'El teléfono no puede exceder 25 caracteres');

const autorizacionSupervisorSchema = z
  .object({
    identifier: z.string().trim().min(2).max(80).optional(),
    username: z.string().trim().min(2).max(80).optional(),
    password: z.string().min(4).max(128),
  })
  .refine((d) => Boolean(d.identifier || d.username), {
    message: 'Ingresa el usuario o correo del supervisor',
    path: ['identifier'],
  });

// --- Esquemas Zod: Zonas ---
const listarZonasQuerySchema = z.object({
  soloActivas: z.enum(['true', 'false']).optional(),
});

const crearZonaSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre de la zona').max(100),
  descripcion: z.string().trim().max(250).optional().nullable(),
  costoEnvio: z.number().min(0, 'El costo de envío no puede ser negativo').max(10000),
  tiempoEstimadoMin: z.number().int().min(1).max(480).default(30),
  pedidoMinimo: z.number().min(0, 'El pedido mínimo no puede ser negativo').max(100000).default(0),
  activa: z.boolean().optional(),
});

const actualizarZonaSchema = crearZonaSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'Envía al menos un campo para actualizar la zona',
);

// --- Esquemas Zod: Clientes y Direcciones ---
const listarClientesQuerySchema = z.object({
  ...paginacionQuery,
  search: z.string().trim().max(80).optional(),
  soloBloqueados: z.enum(['true', 'false']).optional(),
});

const actualizarBloqueoWebSchema = z.object({
  bloqueado: z.boolean(),
  motivo: z.string().trim().min(5, 'Indica un motivo de al menos 5 caracteres').max(300),
});

const buscarClientesQuerySchema = z.object({
  telefono: telefonoSchema,
});

const direccionBaseSchema = z.object({
  alias: z.string().trim().min(1).max(60).optional(),
  direccion: z.string().trim().min(5, 'Ingresa una dirección más detallada').max(250),
  referencia: z.string().trim().max(250).optional().nullable(),
  zonaEntregaId: idPositivo.optional().nullable(),
  esPrincipal: z.boolean().optional(),
});

const crearClienteSchema = z.object({
  nombre: z.string().trim().min(2, 'Ingresa el nombre del cliente').max(150),
  telefono: z.string().trim().min(8, 'Ingresa un teléfono válido').max(25),
  nit: z.string().trim().max(25).optional().nullable(),
  notas: z.string().trim().max(250).optional().nullable(),
  direccionInicial: direccionBaseSchema.optional(),
});

const direccionParamsSchema = z.object({
  id: enteroPositivoStr,
  direccionId: enteroPositivoStr,
});

// --- Esquemas Zod: Pedidos a Domicilio ---
const listarPedidosQuerySchema = z
  .object({
    ...paginacionQuery,
    ...rangoFechasQuery,
    estado: z.enum(Object.values(EstadoPedidoDomicilio)).optional(),
    modalidadPago: z.enum(Object.values(ModalidadPagoDomicilio)).optional(),
    tipoEntrega: z.enum(['DELIVERY', 'LLEVAR']).optional(),
    origen: z.enum(['POS', 'WEB']).optional(),
    zonaEntregaId: enteroPositivoStr.optional(),
    repartidorId: enteroPositivoStr.optional(),
    soloActivos: z.enum(['true', 'false']).optional(),
    pendientesLiquidar: z.enum(['true', 'false']).optional(),
    desde: z
      .string()
      .trim()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Parámetro "desde" debe ser una fecha ISO válida')
      .optional(),
  })
  .superRefine(refinarRangoFechas);

const itemPedidoSchema = z
  .object({
    platilloId: idPositivo,
    cantidad: z
      .number()
      .int()
      .positive()
      .max(env.VENTA_MAX_CANTIDAD_POR_LINEA, `Máximo ${env.VENTA_MAX_CANTIDAD_POR_LINEA} unidades por platillo`),
    cantidadCortesia: z.number().int().min(0).default(0),
    notas: z.string().trim().max(250).optional().nullable(),
  })
  .refine((i) => i.cantidadCortesia <= i.cantidad, {
    message: 'Las cortesías no pueden superar la cantidad del platillo',
    path: ['cantidadCortesia'],
  });

const crearPedidoSchema = z
  .object({
    idempotencyKey: z.string().uuid('idempotencyKey debe ser un UUID válido'),
    zonaEntregaId: idPositivo,
    modalidadPago: z.enum(Object.values(ModalidadPagoDomicilio)),
    metodoPago: z.enum([MetodoPago.EFECTIVO, MetodoPago.TARJETA, MetodoPago.SIN_COBRO]).default(MetodoPago.EFECTIVO),
    montoRecibido: z.number().min(0).optional(),
    montoConQuePaga: z.number().min(0).optional().nullable(),
    referenciaPago: z.string().trim().max(80).optional().nullable(),
    clienteId: idPositivo.optional(),
    cliente: z
      .object({
        nombre: z.string().trim().min(2).max(150),
        telefono: z.string().trim().min(8).max(25),
        nit: z.string().trim().max(25).optional().nullable(),
        notas: z.string().trim().max(250).optional().nullable(),
      })
      .optional(),
    direccionEntregaId: idPositivo.optional(),
    direccionNueva: direccionBaseSchema.optional(),
    observaciones: z.string().trim().max(300).optional().nullable(),
    cortesiaMotivo: z.string().trim().max(250).optional().nullable(),
    autorizacionCortesia: autorizacionSupervisorSchema.optional(),
    items: z
      .array(itemPedidoSchema)
      .min(1, 'Debes agregar al menos un platillo al pedido')
      .max(env.VENTA_MAX_LINEAS, `Máximo ${env.VENTA_MAX_LINEAS} líneas por pedido`),
  })
  .superRefine((data, ctx) => {
    if (!data.clienteId && !data.cliente) {
      ctx.addIssue({
        code: 'custom',
        path: ['cliente'],
        message: 'Debes indicar un clienteId o los datos del cliente',
      });
    }
    if (!data.direccionEntregaId && !data.direccionNueva) {
      ctx.addIssue({
        code: 'custom',
        path: ['direccionNueva'],
        message: 'Debes indicar una direccionEntregaId o una dirección nueva',
      });
    }
  });

const asignarRepartidorSchema = z.object({
  repartidorId: idPositivo,
});

const actualizarEstadoSchema = z.object({
  estadoNuevo: z.enum(Object.values(EstadoPedidoDomicilio)),
  repartidorId: idPositivo.optional(),
  motivo: z.string().trim().max(300).optional(),
  codigoMotivo: z.enum(Object.values(CODIGOS_MOTIVO_AUDITORIA)).optional(),
  autorizacionSupervisor: autorizacionSupervisorSchema.optional(),
});

const liquidarPedidoSchema = z.object({
  idempotencyKey: z.string().uuid('idempotencyKey debe ser un UUID válido'),
  metodoPago: z.enum([MetodoPago.EFECTIVO, MetodoPago.TARJETA]),
  montoRecibidoRepartidor: z.number().min(0, 'El monto recibido no puede ser negativo').optional(),
  referenciaPago: z.string().trim().max(80).optional().nullable(),
  observaciones: z.string().trim().max(300).optional().nullable(),
});

const router = Router();

// Todo el módulo vive detrás de la bandera ENABLE_DELIVERY (default false)
router.use(requireFeature('ENABLE_DELIVERY', 'El módulo de servicio a domicilio no está habilitado'));
router.use(authenticate);

// --- Zonas de entrega ---
router.get(
  '/zonas',
  requirePermission('domicilios:ver', 'domicilios:crear', 'domicilios:configurar', 'domicilios:ver_propios'),
  validate(listarZonasQuerySchema, 'query'),
  DomiciliosController.listarZonas,
);
router.post(
  '/zonas',
  requirePermission('domicilios:configurar'),
  validate(crearZonaSchema),
  DomiciliosController.crearZona,
);
router.put(
  '/zonas/:id',
  requirePermission('domicilios:configurar'),
  validate(idParamsSchema, 'params'),
  validate(actualizarZonaSchema),
  DomiciliosController.actualizarZona,
);

// --- Clientes y direcciones ---
router.get(
  '/clientes',
  requirePermission('domicilios:configurar'),
  validate(listarClientesQuerySchema, 'query'),
  DomiciliosController.listarClientes,
);
router.get(
  '/clientes/buscar',
  requirePermission('domicilios:crear', 'domicilios:ver'),
  busquedaClientesLimiter,
  validate(buscarClientesQuerySchema, 'query'),
  DomiciliosController.buscarClientesPorTelefono,
);
router.get(
  '/clientes/:id',
  requirePermission('domicilios:crear', 'domicilios:ver'),
  validate(idParamsSchema, 'params'),
  DomiciliosController.obtenerCliente,
);
router.patch(
  '/clientes/:id/bloqueo-web',
  requirePermission('domicilios:configurar'),
  validate(idParamsSchema, 'params'),
  validate(actualizarBloqueoWebSchema),
  DomiciliosController.actualizarBloqueoWebCliente,
);
router.post(
  '/clientes',
  requirePermission('domicilios:crear'),
  validate(crearClienteSchema),
  DomiciliosController.crearCliente,
);
router.post(
  '/clientes/:id/direcciones',
  requirePermission('domicilios:crear'),
  validate(idParamsSchema, 'params'),
  validate(direccionBaseSchema),
  DomiciliosController.agregarDireccion,
);
router.patch(
  '/clientes/:id/direcciones/:direccionId/desactivar',
  requirePermission('domicilios:crear'),
  validate(direccionParamsSchema, 'params'),
  DomiciliosController.desactivarDireccion,
);

// --- Repartidores y pedidos ---
router.get(
  '/repartidores',
  requirePermission('domicilios:ver', 'domicilios:asignar', 'domicilios:crear'),
  DomiciliosController.listarRepartidores,
);
router.get(
  '/pedidos',
  requirePermission('domicilios:ver', 'domicilios:ver_propios'),
  validate(listarPedidosQuerySchema, 'query'),
  DomiciliosController.listarPedidos,
);
router.get(
  '/pedidos/:id',
  requirePermission('domicilios:ver', 'domicilios:ver_propios'),
  validate(idParamsSchema, 'params'),
  DomiciliosController.obtenerPedido,
);
router.post(
  '/pedidos',
  requirePermission('domicilios:crear'),
  validate(crearPedidoSchema),
  DomiciliosController.crearPedido,
);
router.patch(
  '/pedidos/:id/asignar',
  requirePermission('domicilios:asignar'),
  validate(idParamsSchema, 'params'),
  validate(asignarRepartidorSchema),
  DomiciliosController.asignarRepartidor,
);
router.patch(
  '/pedidos/:id/estado',
  requirePermission('domicilios:actualizar_estado', 'domicilios:cancelar'),
  validate(idParamsSchema, 'params'),
  validate(actualizarEstadoSchema),
  DomiciliosController.actualizarEstado,
);
router.post(
  '/pedidos/:id/liquidar',
  requirePermission('domicilios:liquidar'),
  validate(idParamsSchema, 'params'),
  validate(liquidarPedidoSchema),
  DomiciliosController.liquidarPedido,
);

module.exports = router;
