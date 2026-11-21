import { NextFunction, Request, Response } from 'express';
import { ROL_ADMIN_CODIGO } from '../../config/constants';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

/**
 * Middleware RBAC dinámico: verifica si el usuario posee al menos uno de los permisos indicados.
 */
export function requirePermission(...permisosRequeridos: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const tienePermiso = permisosRequeridos.some((permiso) => req.user!.permisos.includes(permiso));
    if (!tienePermiso) {
      next(
        new ForbiddenError(
          `Acceso denegado. Permiso requerido: ${permisosRequeridos.join(' o ')}`,
        ),
      );
      return;
    }

    next();
  };
}

/**
 * Doble candado exclusivo para el módulo de Accesos:
 * Exige explícitamente que el usuario tenga rol Administrador además de los permisos correspondientes.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }

  if (req.user.rolCodigo !== ROL_ADMIN_CODIGO) {
    next(new ForbiddenError('Acceso exclusivo para el rol Administrador'));
    return;
  }

  next();
}
