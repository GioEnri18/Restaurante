import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middlewares/authenticate';
import { requireAdmin, requirePermission } from '../../shared/middlewares/authorize';
import { validate } from '../../shared/middlewares/validate';
import { AccesosController } from './accesos.controller';

const permisoOverrideSchema = z.object({
  permisoId: z.coerce.number().int().positive(),
  permitido: z.boolean(),
});

const crearUsuarioSchema = z.object({
  nombreCompleto: z.string().trim().min(3).max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo puede contener letras, números, punto, guion o guion bajo'),
  email: z.string().trim().email('Correo electrónico inválido').max(120),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  rolId: z.coerce.number().int().positive(),
  permisosPersonalizados: z.array(permisoOverrideSchema).optional(),
});

const actualizarUsuarioSchema = z.object({
  nombreCompleto: z.string().trim().min(3).max(120).optional(),
  email: z.string().trim().email('Correo electrónico inválido').max(120).optional(),
  password: z.string().min(6).optional().or(z.literal('')),
  rolId: z.coerce.number().int().positive().optional(),
  permisosPersonalizados: z.array(permisoOverrideSchema).optional(),
});

const estadoUsuarioSchema = z.object({
  activo: z.boolean(),
});

const crearRolSchema = z.object({
  codigo: z.string().trim().min(2).max(40),
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(250).optional(),
  vistaInicial: z.string().trim().startsWith('/').default('/ventas'),
  permisoIds: z.array(z.coerce.number().int().positive()).default([]),
});

const actualizarPermisosRolSchema = z.object({
  permisoIds: z.array(z.coerce.number().int().positive()),
  vistaInicial: z.string().trim().startsWith('/').optional(),
});

const router = Router();

// DOBLE CANDADO: Autenticado + Rol Administrador exclusivo
router.use(authenticate, requireAdmin);

router.get('/usuarios', requirePermission('accesos:ver'), AccesosController.listarUsuarios);
router.post(
  '/usuarios',
  requirePermission('accesos:gestionar'),
  validate(crearUsuarioSchema),
  AccesosController.crearUsuario,
);
router.put(
  '/usuarios/:id',
  requirePermission('accesos:gestionar'),
  validate(actualizarUsuarioSchema),
  AccesosController.actualizarUsuario,
);
router.patch(
  '/usuarios/:id/estado',
  requirePermission('accesos:gestionar'),
  validate(estadoUsuarioSchema),
  AccesosController.cambiarEstadoUsuario,
);

router.get('/roles', requirePermission('accesos:ver'), AccesosController.listarRoles);
router.post(
  '/roles',
  requirePermission('accesos:gestionar'),
  validate(crearRolSchema),
  AccesosController.crearRol,
);
router.put(
  '/roles/:id/permisos',
  requirePermission('accesos:gestionar'),
  validate(actualizarPermisosRolSchema),
  AccesosController.actualizarPermisosRol,
);

router.get('/permisos', requirePermission('accesos:ver'), AccesosController.listarPermisos);

export default router;
