import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requirePermission } from '../../shared/middlewares/authorize';
import { AuditoriaController } from './auditoria.controller';

const router = Router();

router.use(authenticate);

// Auditoría es estrictamente inmutable (solo endpoints de lectura GET)
router.get('/', requirePermission('auditoria:ver'), AuditoriaController.listar);
router.get('/acciones', requirePermission('auditoria:ver'), AuditoriaController.catalogo);

export default router;
