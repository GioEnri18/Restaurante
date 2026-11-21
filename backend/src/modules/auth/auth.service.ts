import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ACCIONES_AUDITORIA } from '../../config/constants';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { obtenerPermisosEfectivos } from '../../shared/middlewares/authenticate';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { AuthModel } from './auth.model';

export class AuthService {
  static async login(identifier: string, password: string, clientMeta: ClientMeta) {
    const usuario = await AuthModel.findByUsernameOrEmail(identifier.trim());

    if (!usuario) {
      await AuditService.registrar({
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        valorNuevo: { identifier, motivo: 'Usuario no encontrado' },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError('Credenciales inválidas');
    }

    if (!usuario.activo || !usuario.rol.activo || !usuario.sucursal.activa) {
      await AuditService.registrar({
        sucursalId: usuario.sucursalId,
        usuarioId: usuario.id,
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorNuevo: { identifier, motivo: 'Cuenta, rol o sucursal inactiva' },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError('Tu cuenta se encuentra desactivada. Contacta al administrador.');
    }

    const passwordValido = await bcrypt.compare(password, usuario.passwordHash);
    if (!passwordValido) {
      await AuditService.registrar({
        sucursalId: usuario.sucursalId,
        usuarioId: usuario.id,
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorNuevo: { identifier, motivo: 'Contraseña incorrecta' },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError('Credenciales inválidas');
    }

    await AuthModel.updateUltimoAcceso(usuario.id);
    const permisos = await obtenerPermisosEfectivos(usuario.id, usuario.rolId);

    const token = jwt.sign(
      {
        sub: usuario.id,
        username: usuario.username,
        rolCodigo: usuario.rol.codigo,
        sucursalId: usuario.sucursalId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] },
    );

    await AuditService.registrar({
      sucursalId: usuario.sucursalId,
      usuarioId: usuario.id,
      accion: ACCIONES_AUDITORIA.LOGIN_EXITOSO,
      entidad: 'Usuario',
      entidadId: usuario.id,
      valorNuevo: {
        username: usuario.username,
        rol: usuario.rol.codigo,
        sucursal: usuario.sucursal.codigo,
      },
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent,
    });

    return {
      token,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombreCompleto: usuario.nombreCompleto,
        email: usuario.email,
        sucursal: {
          id: usuario.sucursal.id,
          codigo: usuario.sucursal.codigo,
          nombre: usuario.sucursal.nombre,
          nit: usuario.sucursal.nit,
          direccion: usuario.sucursal.direccion,
          telefono: usuario.sucursal.telefono,
          serieFactura: usuario.sucursal.serieFactura,
        },
        rol: {
          id: usuario.rol.id,
          codigo: usuario.rol.codigo,
          nombre: usuario.rol.nombre,
          vistaInicial: usuario.rol.vistaInicial,
        },
        permisos,
      },
    };
  }

  static async logout(user: AuthenticatedUser, clientMeta: ClientMeta) {
    await AuditService.registrar({
      sucursalId: user.sucursalId,
      usuarioId: user.id,
      accion: ACCIONES_AUDITORIA.LOGOUT,
      entidad: 'Usuario',
      entidadId: user.id,
      valorNuevo: { username: user.username },
      ipAddress: clientMeta.ipAddress,
      userAgent: clientMeta.userAgent,
    });
  }

  static async getProfile(user: AuthenticatedUser) {
    const sucursal = await AuthModel.findSucursalById(user.sucursalId);
    return {
      id: user.id,
      username: user.username,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      sucursal,
      rol: {
        id: user.rolId,
        codigo: user.rolCodigo,
        nombre: user.rolNombre,
        vistaInicial: user.vistaInicial,
      },
      permisos: user.permisos,
    };
  }
}
