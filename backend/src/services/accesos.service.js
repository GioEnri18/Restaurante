const bcrypt = require('bcryptjs');
const { Op, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA, ROL_ADMIN_CODIGO } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { env } = require('../config/env');
const { Permiso, Rol, RolPermiso, Usuario, UsuarioPermiso } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { PermisosCache } = require('../shared/services/permisosCache');
const { revocarSesionesUsuario } = require('./auth.service');

function datosNomina(usuario) {
    return {
        fechaIngreso: usuario.fechaIngreso ?? null,
        sueldoMensual: usuario.sueldoMensual ? Number(usuario.sueldoMensual) : null,
    };
}

async function obtenerRolParaAlta(rolId, transaction) {
    const rol = await Rol.findOne({ where: { id: rolId, activo: true }, transaction });
    if (!rol) throw new NotFoundError('El rol seleccionado no existe o está inactivo');
    if (rol.codigo.toUpperCase() === 'MESERO') {
        throw new BadRequestError('El rol Mesero está reservado para cuentas históricas de esta operación exprés');
    }
    return rol;
}

async function auditarNomina(admin, usuario, anterior, clientMeta, tx) {
    const nuevo = datosNomina(usuario);
    if (anterior && nuevo.fechaIngreso === anterior.fechaIngreso && nuevo.sueldoMensual === anterior.sueldoMensual) return;
    await AuditService.registrar({
        sucursalId: admin.sucursalId,
        usuarioId: admin.id,
        accion: ACCIONES_AUDITORIA.GESTION_NOMINA,
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorAnterior: anterior,
        valorNuevo: nuevo,
        motivo: 'Registro de sueldo y fecha de ingreso',
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
    }, tx);
}

class AccesosService {
    static async listarUsuarios(sucursalId) {
        const usuarios = await Usuario.findAll({
            where: { sucursalId },
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: Rol,
                    as: 'rol',
                    include: [
                        {
                            model: RolPermiso,
                            as: 'rolPermisos',
                            include: [{ model: Permiso, as: 'permiso' }],
                        },
                    ],
                },
                {
                    model: UsuarioPermiso,
                    as: 'usuarioPermisos',
                    include: [{ model: Permiso, as: 'permiso' }],
                },
            ],
        });
        return usuarios.map((u) => {
            const baseSet = new Set((u.rol?.rolPermisos ?? [])
                .map((rp) => rp.permiso?.codigo)
                .filter((c) => Boolean(c)));
            for (const up of u.usuarioPermisos ?? []) {
                const codigo = up.permiso?.codigo;
                if (!codigo)
                    continue;
                if (up.permitido)
                    baseSet.add(codigo);
                else
                    baseSet.delete(codigo);
            }
            return {
                id: u.id,
                sucursalId: u.sucursalId,
                rolId: u.rolId,
                nombreCompleto: u.nombreCompleto,
                username: u.username,
                email: u.email,
                activo: u.activo,
                ultimoAcceso: u.ultimoAcceso,
                ...datosNomina(u),
                createdAt: u.createdAt,
                rol: u.rol
                    ? {
                        id: u.rol.id,
                        codigo: u.rol.codigo,
                        nombre: u.rol.nombre,
                        vistaInicial: u.rol.vistaInicial,
                    }
                    : null,
                permisosEfectivos: Array.from(baseSet).sort(),
                permisosPersonalizados: (u.usuarioPermisos ?? []).map((up) => ({
                    permisoId: up.permisoId,
                    codigo: up.permiso?.codigo ?? '',
                    permitido: up.permitido,
                })),
            };
        });
    }
    static async crearUsuario(adminUser, input, clientMeta) {
        return withTransaction(async (tx) => {
            const rol = await obtenerRolParaAlta(input.rolId, tx);
            const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
            const usuario = await Usuario.create({
                sucursalId: adminUser.sucursalId,
                rolId: input.rolId,
                nombreCompleto: input.nombreCompleto.trim(),
                username: input.username.trim().toLowerCase(),
                email: input.email.trim().toLowerCase(),
                passwordHash,
                fechaIngreso: input.fechaIngreso,
                sueldoMensual: input.sueldoMensual,
            }, { transaction: tx });
            if (input.permisosPersonalizados?.length) {
                await UsuarioPermiso.bulkCreate(input.permisosPersonalizados.map((p) => ({
                    usuarioId: usuario.id,
                    permisoId: p.permisoId,
                    permitido: p.permitido,
                })), { transaction: tx });
            }
            await AuditService.registrar({
                sucursalId: adminUser.sucursalId,
                usuarioId: adminUser.id,
                accion: ACCIONES_AUDITORIA.GESTION_USUARIO,
                entidad: 'Usuario',
                entidadId: usuario.id,
                valorAnterior: null,
                valorNuevo: {
                    username: usuario.username,
                    nombreCompleto: usuario.nombreCompleto,
                    email: usuario.email,
                    rol: rol.codigo,
                },
                motivo: 'Creación de usuario desde panel de Accesos',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            await auditarNomina(adminUser, usuario, null, clientMeta, tx);
            return {
                id: usuario.id,
                nombreCompleto: usuario.nombreCompleto,
                username: usuario.username,
                email: usuario.email,
                activo: usuario.activo,
                rol: { id: rol.id, codigo: rol.codigo, nombre: rol.nombre },
            };
        });
    }
    static async actualizarUsuario(adminUser, targetUserId, input, clientMeta) {
        return withTransaction(async (tx) => {
            const actual = await Usuario.findOne({
                where: { id: targetUserId, sucursalId: adminUser.sucursalId },
                include: [
                    { model: Rol, as: 'rol' },
                    {
                        model: UsuarioPermiso,
                        as: 'usuarioPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
                transaction: tx,
                lock: { level: tx.LOCK.UPDATE, of: Usuario },
            });
            if (!actual || !actual.rol) {
                throw new NotFoundError('Usuario no encontrado');
            }
            if (input.rolId && targetUserId === adminUser.id && input.rolId !== actual.rolId) {
                throw new BadRequestError('No puedes cambiar tu propio rol de Administrador');
            }
            if (input.rolId !== undefined && input.rolId !== actual.rolId) {
                await obtenerRolParaAlta(input.rolId, tx);
            }
            const prevNombre = actual.nombreCompleto;
            const prevEmail = actual.email;
            const prevRolCodigo = actual.rol.codigo;
            const prevRolId = actual.rolId;
            const nominaAnterior = datosNomina(actual);
            const prevOverrides = (actual.usuarioPermisos ?? []).map((up) => ({
                permiso: up.permiso?.codigo ?? '',
                permitido: up.permitido,
            }));
            let passwordHash;
            if (input.password && input.password.trim().length > 0) {
                passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
            }
            await actual.update({
                nombreCompleto: input.nombreCompleto ? input.nombreCompleto.trim() : actual.nombreCompleto,
                email: input.email ? input.email.trim().toLowerCase() : actual.email,
                rolId: input.rolId ?? actual.rolId,
                fechaIngreso: input.fechaIngreso ?? actual.fechaIngreso,
                sueldoMensual: input.sueldoMensual ?? actual.sueldoMensual,
                ...(passwordHash ? { passwordHash } : {}),
            }, { transaction: tx });
            await auditarNomina(adminUser, actual, nominaAnterior, clientMeta, tx);
            // Auditoría P0.3: cambiar contraseña o rol cierra todas las sesiones activas del usuario
            const cambioRol = input.rolId !== undefined && input.rolId !== prevRolId;
            if (passwordHash || cambioRol) {
                await revocarSesionesUsuario(targetUserId, tx);
            }
            if (input.permisosPersonalizados !== undefined) {
                await UsuarioPermiso.destroy({ where: { usuarioId: targetUserId }, transaction: tx });
                if (input.permisosPersonalizados.length > 0) {
                    await UsuarioPermiso.bulkCreate(input.permisosPersonalizados.map((p) => ({
                        usuarioId: targetUserId,
                        permisoId: p.permisoId,
                        permitido: p.permitido,
                    })), { transaction: tx });
                }
            }
            const actualizado = await Usuario.findByPk(targetUserId, {
                include: [
                    { model: Rol, as: 'rol' },
                    {
                        model: UsuarioPermiso,
                        as: 'usuarioPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
                transaction: tx,
            });
            const cambioPermisos = prevRolId !== (actualizado?.rolId ?? prevRolId) || input.permisosPersonalizados !== undefined;
            await AuditService.registrar({
                sucursalId: adminUser.sucursalId,
                usuarioId: adminUser.id,
                accion: cambioPermisos
                    ? ACCIONES_AUDITORIA.CAMBIO_PERMISOS
                    : ACCIONES_AUDITORIA.GESTION_USUARIO,
                entidad: 'Usuario',
                entidadId: targetUserId,
                valorAnterior: {
                    nombreCompleto: prevNombre,
                    email: prevEmail,
                    rol: prevRolCodigo,
                    overrides: prevOverrides,
                },
                valorNuevo: {
                    nombreCompleto: actualizado?.nombreCompleto,
                    email: actualizado?.email,
                    rol: actualizado?.rol?.codigo,
                    passwordActualizado: Boolean(passwordHash),
                    overrides: (actualizado?.usuarioPermisos ?? []).map((up) => ({
                        permiso: up.permiso?.codigo ?? '',
                        permitido: up.permitido,
                    })),
                },
                motivo: 'Actualización de usuario / permisos',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return {
                id: actualizado.id,
                nombreCompleto: actualizado.nombreCompleto,
                username: actualizado.username,
                email: actualizado.email,
                activo: actualizado.activo,
                rol: {
                    id: actualizado.rol.id,
                    codigo: actualizado.rol.codigo,
                    nombre: actualizado.rol.nombre,
                },
            };
        }, () => PermisosCache.invalidarUsuario(targetUserId));
    }
    static async cambiarEstadoUsuario(adminUser, targetUserId, activo, clientMeta) {
        if (targetUserId === adminUser.id && !activo) {
            throw new BadRequestError('No puedes desactivar tu propia cuenta de Administrador');
        }
        return withTransaction(async (tx) => {
            const actual = await Usuario.findOne({
                where: { id: targetUserId, sucursalId: adminUser.sucursalId },
                transaction: tx,
            });
            if (!actual) {
                throw new NotFoundError('Usuario no encontrado');
            }
            const prevActivo = actual.activo;
            await actual.update({ activo }, { transaction: tx });
            if (!activo) {
                // Auditoría P0.3: la desactivación también revoca los tokens emitidos
                await revocarSesionesUsuario(targetUserId, tx);
            }
            await AuditService.registrar({
                sucursalId: adminUser.sucursalId,
                usuarioId: adminUser.id,
                accion: ACCIONES_AUDITORIA.GESTION_USUARIO,
                entidad: 'Usuario',
                entidadId: targetUserId,
                valorAnterior: { username: actual.username, activo: prevActivo },
                valorNuevo: { username: actual.username, activo: actual.activo },
                motivo: activo ? 'Activación de usuario' : 'Desactivación de usuario',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return {
                id: actual.id,
                username: actual.username,
                nombreCompleto: actual.nombreCompleto,
                activo: actual.activo,
            };
        });
    }
    static async listarRoles() {
        const [roles, usuariosCounts] = await Promise.all([
            Rol.findAll({
                order: [['id', 'ASC']],
                include: [
                    {
                        model: RolPermiso,
                        as: 'rolPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
            }),
            Usuario.findAll({
                attributes: ['rolId', [fn('COUNT', col('id')), 'cnt']],
                group: ['rolId'],
                raw: true,
            }),
        ]);
        const countMap = new Map(usuariosCounts.map((u) => [Number(u.rolId), Number(u.cnt)]));
        return roles.map((r) => ({
            id: r.id,
            codigo: r.codigo,
            nombre: r.nombre,
            descripcion: r.descripcion,
            vistaInicial: r.vistaInicial,
            esSistema: r.esSistema,
            activo: r.activo,
            usuariosCount: countMap.get(r.id) ?? 0,
            permisos: (r.rolPermisos ?? [])
                .filter((rp) => rp.permiso)
                .map((rp) => ({
                id: rp.permiso.id,
                codigo: rp.permiso.codigo,
                vista: rp.permiso.vista,
                accion: rp.permiso.accion,
            })),
        }));
    }
    static async crearRol(adminUser, input, clientMeta) {
        return withTransaction(async (tx) => {
            const codigo = input.codigo.trim().toUpperCase().replace(/\s+/g, '_');
            const rol = await Rol.create({
                codigo,
                nombre: input.nombre.trim(),
                descripcion: input.descripcion?.trim() || null,
                vistaInicial: input.vistaInicial,
                esSistema: false,
            }, { transaction: tx });
            if (input.permisoIds.length > 0) {
                await RolPermiso.bulkCreate(input.permisoIds.map((permisoId) => ({ rolId: rol.id, permisoId })), { transaction: tx });
            }
            const rolCompleto = await Rol.findByPk(rol.id, {
                include: [
                    {
                        model: RolPermiso,
                        as: 'rolPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
                transaction: tx,
            });
            await AuditService.registrar({
                sucursalId: adminUser.sucursalId,
                usuarioId: adminUser.id,
                accion: ACCIONES_AUDITORIA.GESTION_ROL,
                entidad: 'Rol',
                entidadId: rol.id,
                valorAnterior: null,
                valorNuevo: {
                    codigo: rol.codigo,
                    nombre: rol.nombre,
                    vistaInicial: rol.vistaInicial,
                    permisos: (rolCompleto?.rolPermisos ?? [])
                        .map((rp) => rp.permiso?.codigo)
                        .filter(Boolean),
                },
                motivo: 'Creación de rol configurable',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return (rolCompleto ?? rol).get({ plain: true });
        });
    }
    static async actualizarPermisosRol(adminUser, rolId, input, clientMeta) {
        return withTransaction(async (tx) => {
            const rolActual = await Rol.findByPk(rolId, {
                include: [
                    {
                        model: RolPermiso,
                        as: 'rolPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
                transaction: tx,
            });
            if (!rolActual) {
                throw new NotFoundError('Rol no encontrado');
            }
            const permisosElegidos = input.permisoIds.length > 0
                ? await Permiso.findAll({
                    where: { id: { [Op.in]: input.permisoIds } },
                    transaction: tx,
                })
                : [];
            // Protección: el rol ADMIN siempre debe conservar acceso a Accesos
            if (rolActual.codigo === ROL_ADMIN_CODIGO) {
                const codigos = new Set(permisosElegidos.map((p) => p.codigo));
                if (!codigos.has('accesos:ver') || !codigos.has('accesos:gestionar')) {
                    throw new BadRequestError('El rol Administrador no puede revocarse los permisos del módulo Accesos');
                }
            }
            const prevVista = rolActual.vistaInicial;
            const prevPermisos = (rolActual.rolPermisos ?? [])
                .map((rp) => rp.permiso?.codigo)
                .filter((c) => Boolean(c))
                .sort();
            await RolPermiso.destroy({ where: { rolId }, transaction: tx });
            if (input.vistaInicial) {
                await rolActual.update({ vistaInicial: input.vistaInicial }, { transaction: tx });
            }
            if (permisosElegidos.length > 0) {
                await RolPermiso.bulkCreate(permisosElegidos.map((p) => ({ rolId, permisoId: p.id })), { transaction: tx });
            }
            const rolActualizado = await Rol.findByPk(rolId, {
                include: [
                    {
                        model: RolPermiso,
                        as: 'rolPermisos',
                        include: [{ model: Permiso, as: 'permiso' }],
                    },
                ],
                transaction: tx,
            });
            await AuditService.registrar({
                sucursalId: adminUser.sucursalId,
                usuarioId: adminUser.id,
                accion: ACCIONES_AUDITORIA.CAMBIO_PERMISOS,
                entidad: 'Rol',
                entidadId: rolId,
                valorAnterior: {
                    rol: rolActual.codigo,
                    vistaInicial: prevVista,
                    permisos: prevPermisos,
                },
                valorNuevo: {
                    rol: rolActualizado?.codigo,
                    vistaInicial: rolActualizado?.vistaInicial,
                    permisos: (rolActualizado?.rolPermisos ?? [])
                        .map((rp) => rp.permiso?.codigo)
                        .filter((c) => Boolean(c))
                        .sort(),
                },
                motivo: `Actualización de permisos del rol ${rolActual.nombre}`,
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return (rolActualizado ?? rolActual).get({ plain: true });
        }, () => PermisosCache.invalidarTodo());
    }
    static async listarPermisos() {
        const permisos = await Permiso.findAll({
            order: [
                ['vista', 'ASC'],
                ['accion', 'ASC'],
            ],
        });
        const lista = permisos.map((p) => p.get({ plain: true }));
        const porVista = {};
        for (const p of lista) {
            if (!porVista[p.vista])
                porVista[p.vista] = [];
            porVista[p.vista].push(p);
        }
        return { lista, porVista };
    }
}

module.exports = { AccesosService };
