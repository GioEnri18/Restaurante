const { Router } = require('express');
const { z } = require('zod');
const { env } = require('../config/env');
const { AccesosController } = require('../controllers/accesos.controller');
const { authenticate } = require('../middlewares/authenticate');
const { requireAdmin, requirePermission } = require('../middlewares/authorize');
const { validate } = require('../middlewares/validate');
const { idParamsSchema } = require('../shared/validators/common.validators');
// Auditoría P1: política de contraseñas (longitud configurable, letras y números, tope por bcrypt)
const passwordSchema = z
    .string()
    .min(env.PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${env.PASSWORD_MIN_LENGTH} caracteres`)
    .max(72, 'La contraseña no puede superar 72 caracteres')
    .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
    .regex(/\d/, 'La contraseña debe incluir al menos un número');
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
    password: passwordSchema,
    rolId: z.coerce.number().int().positive(),
    permisosPersonalizados: z.array(permisoOverrideSchema).max(200).optional(),
});
const actualizarUsuarioSchema = z.object({
    nombreCompleto: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().email('Correo electrónico inválido').max(120).optional(),
    password: passwordSchema.optional().or(z.literal('')),
    rolId: z.coerce.number().int().positive().optional(),
    permisosPersonalizados: z.array(permisoOverrideSchema).max(200).optional(),
});
const estadoUsuarioSchema = z.object({
    activo: z.boolean(),
});
const crearRolSchema = z.object({
    codigo: z.string().trim().min(2).max(40),
    nombre: z.string().trim().min(2).max(80),
    descripcion: z.string().trim().max(250).optional(),
    vistaInicial: z.string().trim().startsWith('/').default('/ventas'),
    permisoIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
});
const actualizarPermisosRolSchema = z.object({
    permisoIds: z.array(z.coerce.number().int().positive()).max(200),
    vistaInicial: z.string().trim().startsWith('/').optional(),
});
const router = Router();
// DOBLE CANDADO: Autenticado + Rol Administrador exclusivo
router.use(authenticate, requireAdmin);
router.get('/usuarios', requirePermission('accesos:ver'), AccesosController.listarUsuarios);
router.post('/usuarios', requirePermission('accesos:gestionar'), validate(crearUsuarioSchema), AccesosController.crearUsuario);
router.put('/usuarios/:id', requirePermission('accesos:gestionar'), validate(idParamsSchema, 'params'), validate(actualizarUsuarioSchema), AccesosController.actualizarUsuario);
router.patch('/usuarios/:id/estado', requirePermission('accesos:gestionar'), validate(idParamsSchema, 'params'), validate(estadoUsuarioSchema), AccesosController.cambiarEstadoUsuario);
router.get('/roles', requirePermission('accesos:ver'), AccesosController.listarRoles);
router.post('/roles', requirePermission('accesos:gestionar'), validate(crearRolSchema), AccesosController.crearRol);
router.put('/roles/:id/permisos', requirePermission('accesos:gestionar'), validate(idParamsSchema, 'params'), validate(actualizarPermisosRolSchema), AccesosController.actualizarPermisosRol);
router.get('/permisos', requirePermission('accesos:ver'), AccesosController.listarPermisos);
module.exports = router;
