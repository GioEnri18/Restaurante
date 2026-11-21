const { Router } = require('express');
const { z } = require('zod');
const { AuditoriaController } = require('../controllers/auditoria.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const {
    enteroPositivoStr,
    paginacionQuery,
    rangoFechasQuery,
    refinarRangoFechas,
    textoBusqueda,
} = require('../shared/validators/common.validators');
// Auditoría P1: usuarioId numérico (antes Number('abc') -> NaN -> error 500) y fechas válidas
const listarAuditoriaQuerySchema = z
    .object({
    ...paginacionQuery,
    ...rangoFechasQuery,
    usuarioId: enteroPositivoStr.optional(),
    accion: textoBusqueda(40).optional(),
    entidad: textoBusqueda(60).optional(),
})
    .superRefine(refinarRangoFechas);
const router = Router();
router.use(authenticate);
// Auditoría es estrictamente inmutable (solo endpoints de lectura GET)
router.get('/', requirePermission('auditoria:ver'), validate(listarAuditoriaQuerySchema, 'query'), AuditoriaController.listar);
router.get('/acciones', requirePermission('auditoria:ver'), AuditoriaController.catalogo);
module.exports = router;
