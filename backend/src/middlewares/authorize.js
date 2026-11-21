const { ROL_ADMIN_CODIGO } = require('../config/constants');
const { ForbiddenError, UnauthorizedError } = require('../shared/errors/AppError');

/** Exige que el usuario tenga AL MENOS UNO de los permisos indicados */
function requirePermission(...permisosRequeridos) {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const tienePermiso = permisosRequeridos.some((permiso) =>
      req.user.permisos.includes(permiso),
    );
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

/** Exige que el usuario tenga TODOS los permisos indicados (Fase 2.6) */
function requireAllPermissions(...permisosRequeridos) {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }

    const faltantes = permisosRequeridos.filter(
      (permiso) => !req.user.permisos.includes(permiso),
    );
    if (faltantes.length > 0) {
      next(
        new ForbiddenError(
          `Acceso denegado. Permisos requeridos: ${faltantes.join(' y ')}`,
        ),
      );
      return;
    }

    next();
  };
}

function requireAdmin(req, _res, next) {
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

module.exports = { requirePermission, requireAllPermissions, requireAdmin };
