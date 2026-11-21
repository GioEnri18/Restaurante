import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { ACCIONES_AUDITORIA, ROL_ADMIN_CODIGO } from '../../config/constants';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { AccesosModel } from './accesos.model';

export class AccesosService {
  static async listarUsuarios(sucursalId: number) {
    const usuarios = await AccesosModel.findUsuarios(sucursalId);
    return usuarios.map((u) => {
      const baseSet = new Set(u.rol.rolPermisos.map((rp) => rp.permiso.codigo));
      for (const up of u.usuarioPermisos) {
        if (up.permitido) baseSet.add(up.permiso.codigo);
        else baseSet.delete(up.permiso.codigo);
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
        createdAt: u.createdAt,
        rol: {
          id: u.rol.id,
          codigo: u.rol.codigo,
          nombre: u.rol.nombre,
          vistaInicial: u.rol.vistaInicial,
        },
        permisosEfectivos: Array.from(baseSet).sort(),
        permisosPersonalizados: u.usuarioPermisos.map((up) => ({
          permisoId: up.permisoId,
          codigo: up.permiso.codigo,
          permitido: up.permitido,
        })),
      };
    });
  }

  static async crearUsuario(
    adminUser: AuthenticatedUser,
    input: {
      nombreCompleto: string;
      username: string;
      email: string;
      password: string;
      rolId: number;
      permisosPersonalizados?: Array<{ permisoId: number; permitido: boolean }>;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const rol = await tx.rol.findUnique({ where: { id: input.rolId } });
      if (!rol) {
        throw new NotFoundError('El rol seleccionado no existe');
      }

      const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

      const usuario = await tx.usuario.create({
        data: {
          sucursalId: adminUser.sucursalId,
          rolId: input.rolId,
          nombreCompleto: input.nombreCompleto.trim(),
          username: input.username.trim().toLowerCase(),
          email: input.email.trim().toLowerCase(),
          passwordHash,
          usuarioPermisos: input.permisosPersonalizados?.length
            ? {
                create: input.permisosPersonalizados.map((p) => ({
                  permisoId: p.permisoId,
                  permitido: p.permitido,
                })),
              }
            : undefined,
        },
        select: {
          id: true,
          nombreCompleto: true,
          username: true,
          email: true,
          activo: true,
          rol: { select: { id: true, codigo: true, nombre: true } },
        },
      });

      await AuditService.registrar(
        {
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
            rol: usuario.rol.codigo,
          },
          motivo: 'Creación de usuario desde panel de Accesos',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return usuario;
    });
  }

  static async actualizarUsuario(
    adminUser: AuthenticatedUser,
    targetUserId: number,
    input: {
      nombreCompleto?: string;
      email?: string;
      password?: string;
      rolId?: number;
      permisosPersonalizados?: Array<{ permisoId: number; permitido: boolean }>;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.usuario.findFirst({
        where: { id: targetUserId, sucursalId: adminUser.sucursalId },
        include: {
          rol: true,
          usuarioPermisos: { include: { permiso: true } },
        },
      });

      if (!actual) {
        throw new NotFoundError('Usuario no encontrado');
      }

      if (input.rolId && targetUserId === adminUser.id && input.rolId !== actual.rolId) {
        throw new BadRequestError('No puedes cambiar tu propio rol de Administrador');
      }

      let passwordHash: string | undefined;
      if (input.password && input.password.trim().length > 0) {
        passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
      }

      if (input.permisosPersonalizados !== undefined) {
        await tx.usuarioPermiso.deleteMany({ where: { usuarioId: targetUserId } });
      }

      const actualizado = await tx.usuario.update({
        where: { id: targetUserId },
        data: {
          nombreCompleto: input.nombreCompleto ? input.nombreCompleto.trim() : actual.nombreCompleto,
          email: input.email ? input.email.trim().toLowerCase() : actual.email,
          rolId: input.rolId ?? actual.rolId,
          ...(passwordHash ? { passwordHash } : {}),
          ...(input.permisosPersonalizados !== undefined
            ? {
                usuarioPermisos: {
                  create: input.permisosPersonalizados.map((p) => ({
                    permisoId: p.permisoId,
                    permitido: p.permitido,
                  })),
                },
              }
            : {}),
        },
        include: {
          rol: true,
          usuarioPermisos: { include: { permiso: true } },
        },
      });

      const cambioPermisos =
        actual.rolId !== actualizado.rolId || input.permisosPersonalizados !== undefined;

      await AuditService.registrar(
        {
          sucursalId: adminUser.sucursalId,
          usuarioId: adminUser.id,
          accion: cambioPermisos
            ? ACCIONES_AUDITORIA.CAMBIO_PERMISOS
            : ACCIONES_AUDITORIA.GESTION_USUARIO,
          entidad: 'Usuario',
          entidadId: targetUserId,
          valorAnterior: {
            nombreCompleto: actual.nombreCompleto,
            email: actual.email,
            rol: actual.rol.codigo,
            overrides: actual.usuarioPermisos.map((up) => ({
              permiso: up.permiso.codigo,
              permitido: up.permitido,
            })),
          },
          valorNuevo: {
            nombreCompleto: actualizado.nombreCompleto,
            email: actualizado.email,
            rol: actualizado.rol.codigo,
            passwordActualizado: Boolean(passwordHash),
            overrides: actualizado.usuarioPermisos.map((up) => ({
              permiso: up.permiso.codigo,
              permitido: up.permitido,
            })),
          },
          motivo: 'Actualización de usuario / permisos',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

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
    });
  }

  static async cambiarEstadoUsuario(
    adminUser: AuthenticatedUser,
    targetUserId: number,
    activo: boolean,
    clientMeta: ClientMeta,
  ) {
    if (targetUserId === adminUser.id && !activo) {
      throw new BadRequestError('No puedes desactivar tu propia cuenta de Administrador');
    }

    return prisma.$transaction(async (tx) => {
      const actual = await tx.usuario.findFirst({
        where: { id: targetUserId, sucursalId: adminUser.sucursalId },
      });
      if (!actual) {
        throw new NotFoundError('Usuario no encontrado');
      }

      const actualizado = await tx.usuario.update({
        where: { id: targetUserId },
        data: { activo },
        select: { id: true, username: true, nombreCompleto: true, activo: true },
      });

      await AuditService.registrar(
        {
          sucursalId: adminUser.sucursalId,
          usuarioId: adminUser.id,
          accion: ACCIONES_AUDITORIA.GESTION_USUARIO,
          entidad: 'Usuario',
          entidadId: targetUserId,
          valorAnterior: { username: actual.username, activo: actual.activo },
          valorNuevo: { username: actualizado.username, activo: actualizado.activo },
          motivo: activo ? 'Activación de usuario' : 'Desactivación de usuario',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return actualizado;
    });
  }

  static async listarRoles() {
    const roles = await AccesosModel.findRoles();
    return roles.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      vistaInicial: r.vistaInicial,
      esSistema: r.esSistema,
      activo: r.activo,
      usuariosCount: r._count.usuarios,
      permisos: r.rolPermisos.map((rp) => ({
        id: rp.permiso.id,
        codigo: rp.permiso.codigo,
        vista: rp.permiso.vista,
        accion: rp.permiso.accion,
      })),
    }));
  }

  static async crearRol(
    adminUser: AuthenticatedUser,
    input: {
      codigo: string;
      nombre: string;
      descripcion?: string;
      vistaInicial: string;
      permisoIds: number[];
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const codigo = input.codigo.trim().toUpperCase().replace(/\s+/g, '_');

      const rol = await tx.rol.create({
        data: {
          codigo,
          nombre: input.nombre.trim(),
          descripcion: input.descripcion?.trim() || null,
          vistaInicial: input.vistaInicial,
          esSistema: false,
          rolPermisos: {
            create: input.permisoIds.map((permisoId) => ({ permisoId })),
          },
        },
        include: {
          rolPermisos: { include: { permiso: true } },
        },
      });

      await AuditService.registrar(
        {
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
            permisos: rol.rolPermisos.map((rp) => rp.permiso.codigo),
          },
          motivo: 'Creación de rol configurable',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return rol;
    });
  }

  static async actualizarPermisosRol(
    adminUser: AuthenticatedUser,
    rolId: number,
    input: { permisoIds: number[]; vistaInicial?: string },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const rolActual = await tx.rol.findUnique({
        where: { id: rolId },
        include: { rolPermisos: { include: { permiso: true } } },
      });

      if (!rolActual) {
        throw new NotFoundError('Rol no encontrado');
      }

      const permisosElegidos = await tx.permiso.findMany({
        where: { id: { in: input.permisoIds } },
      });

      // Protección: el rol ADMIN siempre debe conservar acceso a Accesos
      if (rolActual.codigo === ROL_ADMIN_CODIGO) {
        const codigos = new Set(permisosElegidos.map((p) => p.codigo));
        if (!codigos.has('accesos:ver') || !codigos.has('accesos:gestionar')) {
          throw new BadRequestError(
            'El rol Administrador no puede revocarse los permisos del módulo Accesos',
          );
        }
      }

      await tx.rolPermiso.deleteMany({ where: { rolId } });

      const rolActualizado = await tx.rol.update({
        where: { id: rolId },
        data: {
          vistaInicial: input.vistaInicial ?? rolActual.vistaInicial,
          rolPermisos: {
            create: permisosElegidos.map((p) => ({ permisoId: p.id })),
          },
        },
        include: { rolPermisos: { include: { permiso: true } } },
      });

      await AuditService.registrar(
        {
          sucursalId: adminUser.sucursalId,
          usuarioId: adminUser.id,
          accion: ACCIONES_AUDITORIA.CAMBIO_PERMISOS,
          entidad: 'Rol',
          entidadId: rolId,
          valorAnterior: {
            rol: rolActual.codigo,
            vistaInicial: rolActual.vistaInicial,
            permisos: rolActual.rolPermisos.map((rp) => rp.permiso.codigo).sort(),
          },
          valorNuevo: {
            rol: rolActualizado.codigo,
            vistaInicial: rolActualizado.vistaInicial,
            permisos: rolActualizado.rolPermisos.map((rp) => rp.permiso.codigo).sort(),
          },
          motivo: `Actualización de permisos del rol ${rolActual.nombre}`,
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return rolActualizado;
    });
  }

  static async listarPermisos() {
    const permisos = await AccesosModel.findPermisos();
    const porVista: Record<string, typeof permisos> = {};
    for (const p of permisos) {
      if (!porVista[p.vista]) porVista[p.vista] = [];
      porVista[p.vista].push(p);
    }
    return { lista: permisos, porVista };
  }
}
