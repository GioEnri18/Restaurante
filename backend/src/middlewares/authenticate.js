const jwt = require('jsonwebtoken');
const { JWT_ALGORITHM } = require('../config/constants');
const { env } = require('../config/env');
const { Rol, Sucursal, Usuario } = require('../models');
const { obtenerPermisosEfectivos } = require('../services/permisos.service');
const { UnauthorizedError } = require('../shared/errors/AppError');
const { PermisosCache } = require('../shared/services/permisosCache');
const { resolverCredencial } = require('../shared/utils/credenciales');

/**
 * Fase 2.3: Usa exclusivamente `req.ip` (controlado por `app.set('trust proxy', env.TRUST_PROXY)`),
 * evitando leer manualmente el encabezado falsificable `x-forwarded-for`.
 */
function extractClientMeta(req) {
  const ipAddress = req.ip || req.socket?.remoteAddress || 'desconocida';
  const userAgent = req.headers['user-agent'] || 'desconocido';
  return { ipAddress, userAgent };
}

/** La misma regla que aplica csrfProtection (ver shared/utils/credenciales.js) */
function extractJwtToken(req) {
  return resolverCredencial(req).token;
}

async function authenticate(req, _res, next) {
  try {
    req.clientMeta = extractClientMeta(req);

    const token = extractJwtToken(req);
    if (!token) {
      throw new UnauthorizedError('Token de acceso requerido');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }

    const usuarioId = Number(decoded.sub);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      throw new UnauthorizedError('Token inválido o expirado');
    }

    const usuario = await Usuario.findByPk(usuarioId, {
      include: [
        { model: Rol, as: 'rol' },
        { model: Sucursal, as: 'sucursal' },
      ],
    });

    if (!usuario || !usuario.activo || !usuario.rol?.activo || !usuario.sucursal?.activa) {
      throw new UnauthorizedError('Usuario o sucursal inactiva');
    }

    // Auditoría P0.3: tokens sin versión o con versión anterior quedan revocados
    // (logout, cambio de contraseña/rol o desactivación incrementan token_version)
    if (decoded.ver !== usuario.tokenVersion) {
      throw new UnauthorizedError('La sesión fue cerrada o revocada. Inicia sesión nuevamente.');
    }

    const permisos = await PermisosCache.obtener(usuario.id, usuario.rolId, () =>
      obtenerPermisosEfectivos(usuario.id, usuario.rolId),
    );

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

module.exports = { extractClientMeta, authenticate };
