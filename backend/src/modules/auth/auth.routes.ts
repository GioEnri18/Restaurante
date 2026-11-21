import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { validate } from '../../shared/middlewares/validate';
import { AuthController } from './auth.controller';

const loginSchema = z.object({
  identifier: z.string().trim().min(2, 'Ingresa tu usuario o correo electrónico'),
  password: z.string().min(4, 'Ingresa tu contraseña'),
});

const router = Router();

router.post('/login', validate(loginSchema), AuthController.login);
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.me);

export default router;
