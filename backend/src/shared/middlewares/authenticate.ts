import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { UnauthorizedError } from '../errors/AppError';

export interface JwtPayloadData {
  sub: number;
  username: string;
  rolCodigo: string;
  sucursalId: number;
}

/**
 * Calcula los permisos efectivos de un usuario combinando:
 * 1) Permisos base de su rol
 * 2) Overrides individuales en usuario_permisos (permitido = true agrega, false revoca)
 */
export async function obtenerPermisosEfectivos(usuarioId: number, rolId: number): Promise<string[]> {
  const [rolPermisos, usuarioPermisos] = await Promise.all([
    prisma.rolPermiso.findMany({
      where: { rolId },
      include: { permiso: { select: { codigo: true } } },
    }),
    prisma.usuarioPermiso.findMany({
      where: { usuarioId },
      include: { permiso: { select: { codigo: true } } },
    }),
  ]);

  const setPermisos = new Set<string>(rolPermisos.map((rp) => rp.permiso.codigo));

  for (const up of usuarioPermisos) {
    if (up.permitido) {
      setPermisos.add(up.permiso.codigo);
    } else {
      setPermisos.delete(up.permiso.codigo);
    }
  }

  return Array.from(setPermisos).sort();
}

export function extractClientMeta(req: Request): { ipAddress: string; userAgent: string } {
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.ip || req.socket.remoteAddress || 'desconocida';
  const userAgent = req.headers['user-agent'] || 'desconocido';
  return { ipAddress, userAgent };
}

/**
 * Middleware de autenticación JWT.
 * Valida firma, vigencia del usuario en BD y carga permisos efectivos actualizados en cada solicitud.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.clientMeta = extractClientMeta(req);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de acceso requerido');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedError('Token de acceso inválido');
    }

    let decoded: JwtPayloadData;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayloadData;
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(decoded.sub) },
      include: {
        rol: true,
        sucursal: true,
      },
    });

    if (!usuario || !usuario.activo || !usuario.rol.activo || !usuario.sucursal.activa) {
      throw new UnauthorizedError('Usuario o sucursal inactiva');
    }

    const permisos = await obtenerPermisosEfectivos(usuario.id, usuario.rolId);

    req.user = {
      id: usuario.id,
      username: usuario.username,
      nombreCompleto: usuario.nombreCompleto,
      email: usuario.email,
      sucursalId: usuario.sucursalId,
      sucursalNombre: usuario.sucursal.nombre,
      rolId: usuario.rolId,
      rolCodigo: usuario.rol.codigo,
      rolNombre: usuario.rol.nombre,
      vistaInicial: usuario.rol.vistaInicial,
      permisos,
    };

    next();
  } catch (error) {
    next(error);
  }
}
