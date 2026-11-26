const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { env } = require('../config/env');
const { PublicPedidosController } = require('../controllers/public-pedidos.controller');
const { requireFeature } = require('../middlewares/featureFlag');
const { validate } = require('../middlewares/validate');
const { MetodoPago } = require('../models');
const { enteroPositivoStr, textoBusqueda } = require('../shared/validators/common.validators');

const router = Router();

// Todo el portal público de pedidos vive detrás del mismo feature flag ENABLE_DELIVERY
router.use(requireFeature('ENABLE_DELIVERY', 'Pedidos en línea'));

// Rate limiters dedicados anti-spam para endpoints públicos sin autenticación
const crearPedidoPublicoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Has enviado demasiados pedidos recientes. Espera unos minutos antes de volver a intentar.',
    },
  },
});

const seguimientoPublicoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Demasiadas consultas de seguimiento. Intenta nuevamente en un momento.',
    },
  },
});

const menuPublicoQuerySchema = z.object({
  sucursal: z.string().trim().max(30).optional(),
  search: textoBusqueda(80).optional(),
  categoriaId: enteroPositivoStr.optional(),
});

const crearPedidoPublicoSchema = z
  .object({
    idempotencyKey: z.string().uuid('idempotencyKey debe ser un UUID válido'),
    codigoSucursal: z.string().trim().max(30).optional(),
    tipoEntrega: z.enum(['DELIVERY', 'LLEVAR']),
    zonaEntregaId: z.number().int().positive().optional().nullable(),
    direccion: z.string().trim().max(250).optional().nullable(),
    referencia: z.string().trim().max(250).optional().nullable(),
    metodoPagoEsperado: z.enum([MetodoPago.EFECTIVO, MetodoPago.TARJETA]).default(MetodoPago.EFECTIVO),
    montoConQuePaga: z.number().min(0).max(50000).optional().nullable(),
    observaciones: z.string().trim().max(300).optional().nullable(),
    cliente: z.object({
      nombre: z.string().trim().min(2, 'Ingresa tu nombre').max(150),
      telefono: z.string().trim().min(8, 'Ingresa un número de teléfono válido').max(25),
      nit: z.string().trim().max(25).optional().nullable(),
    }),
    items: z
      .array(
        z.object({
          platilloId: z.number().int().positive(),
          cantidad: z
            .number()
            .int()
            .positive()
            .max(Math.min(env.VENTA_MAX_CANTIDAD_POR_LINEA, 25), 'Máximo 25 unidades por platillo en pedidos web'),
          notas: z.string().trim().max(200).optional().nullable(),
        }),
      )
      .min(1, 'Agrega al menos un platillo a tu pedido')
      .max(Math.min(env.VENTA_MAX_LINEAS, 30), 'Máximo 30 platillos distintos por pedido web'),
  })
  .superRefine((data, ctx) => {
    if (data.tipoEntrega === 'DELIVERY') {
      if (!data.zonaEntregaId) {
        ctx.addIssue({
          code: 'custom',
          path: ['zonaEntregaId'],
          message: 'Selecciona tu zona de entrega',
        });
      }
      if (!data.direccion || data.direccion.trim().length < 5) {
        ctx.addIssue({
          code: 'custom',
          path: ['direccion'],
          message: 'Ingresa una dirección de entrega completa (mínimo 5 caracteres)',
        });
      }
    }
  });

const tokenParamsSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{16,40}$/i, 'Código de seguimiento inválido'),
});

router.get('/sucursales', PublicPedidosController.listarSucursales);
router.get('/menu', validate(menuPublicoQuerySchema, 'query'), PublicPedidosController.obtenerMenu);
router.post(
  '/pedidos',
  crearPedidoPublicoLimiter,
  validate(crearPedidoPublicoSchema),
  PublicPedidosController.crearPedido,
);
router.get(
  '/pedidos/:token',
  seguimientoPublicoLimiter,
  validate(tokenParamsSchema, 'params'),
  PublicPedidosController.consultarSeguimiento,
);

module.exports = router;
