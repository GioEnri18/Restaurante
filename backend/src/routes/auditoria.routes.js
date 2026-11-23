const { Router } = require('express');
const { z } = require('zod');
const { AuditoriaController } = require('../controllers/auditoria.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requireAdmin, requireAllPermissions, requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
  enteroPositivoStr,
  idParamsSchema,
  paginacionQuery,
  rangoFechasQuery,
  refinarRangoFechas,
  textoBusqueda,
} = require('../shared/validators/common.validators');

// Permite montos positivos o negativos con hasta 2 decimales para rango de impacto financiero
const impactoStr = z
  .string()
  .regex(/^-?\d{1,9}(\.\d{1,2})?$/, 'Monto de impacto inválido (máximo 2 decimales)');

const filtrosComunesAuditoria = {
  ...rangoFechasQuery,
  usuarioId: enteroPositivoStr.optional(),
  aprobadorId: enteroPositivoStr.optional(),
  cajaSesionId: enteroPositivoStr.optional(),
  accion: textoBusqueda(60).optional(),
  severidad: z.enum(['BAJA', 'MEDIA', 'ALTA']).optional(),
  entidad: textoBusqueda(60).optional(),
  entidadId: textoBusqueda(60).optional(),
  impactoMin: impactoStr.optional(),
  impactoMax: impactoStr.optional(),
};

function refinarFiltrosAuditoria(data, ctx) {
  refinarRangoFechas(data, ctx);
  if (data.impactoMin !== undefined && data.impactoMax !== undefined) {
    const min = Number(data.impactoMin);
    const max = Number(data.impactoMax);
    if (min > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['impactoMin'],
        message: 'impactoMin no puede ser mayor que impactoMax',
      });
    }
  }
}

const listarAuditoriaQuerySchema = z
  .object({
    ...paginacionQuery,
    ...filtrosComunesAuditoria,
  })
  .superRefine(refinarFiltrosAuditoria);

const filtrosAuditoriaQuerySchema = z
  .object(filtrosComunesAuditoria)
  .superRefine(refinarFiltrosAuditoria);

const router = Router();
router.use(authenticate);

// Auditoría es estrictamente inmutable (solo endpoints de lectura GET)
router.get(
  '/',
  requirePermission('auditoria:ver'),
  validate(listarAuditoriaQuerySchema, 'query'),
  AuditoriaController.listar,
);
router.get('/acciones', requirePermission('auditoria:ver'), AuditoriaController.catalogo);
router.get(
  '/resumen',
  requirePermission('auditoria:ver'),
  validate(filtrosAuditoriaQuerySchema, 'query'),
  AuditoriaController.resumen,
);
router.get(
  '/exportar',
  requireAllPermissions('auditoria:ver', 'auditoria:exportar'),
  validate(filtrosAuditoriaQuerySchema, 'query'),
  AuditoriaController.exportar,
);
router.get(
  '/nomina',
  requireAdmin,
  requirePermission('auditoria:ver'),
  AuditoriaController.nomina,
);
router.get(
  '/:id',
  requirePermission('auditoria:ver'),
  validate(idParamsSchema, 'params'),
  AuditoriaController.detalle,
);

module.exports = router;
