const { Router } = require('express');
const { AuditoriaController } = require('../controllers/auditoria.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/authorize');
const router = Router();
router.use(authenticate);
// Auditoría es estrictamente inmutable (solo endpoints de lectura GET)
router.get('/', requirePermission('auditoria:ver'), AuditoriaController.listar);
router.get('/acciones', requirePermission('auditoria:ver'), AuditoriaController.catalogo);
module.exports = router;
