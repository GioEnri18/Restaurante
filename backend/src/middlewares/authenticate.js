const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { Permiso, Rol, RolPermiso, Sucursal, Usuario, UsuarioPermiso } = require('../models');
const { UnauthorizedError } = require('../shared/errors/AppError');

/**
 * Calcula los permisos efectivos combinando permisos del rol + overrides por usuario.
 */
async function obtenerPermisosEfectivos(usuarioId, rolId) {
  const [rolPermisos, usuarioPermisos] = await Promise.all([
    RolPermiso.findAll({
      where: { rolId },
      include: [{ model: Permiso, as: 'permiso', attributes: ['codigo'] }],
    }),
    UsuarioPermiso.findAll({
      where: { usuarioId },
      include: [{ model: Permiso, as: 'permiso', attributes: ['codigo'] }],
    }),
  ]);

  const setPermisos = new Set(rolPermisos.map((rp) => rp.permiso?.codigo).filter((c) => Boolean(c)));

  for (const up of usuarioPermisos) {
    const codigo = up.permiso?.codigo;
    if (!codigo) continue;
    if (up.permitido) setPermisos.add(codigo);
    else setPermisos.delete(codigo);
  }

  return Array.from(setPermisos).sort();
}

/**
 * Fase 2.3: Usa exclusivamente `req.ip` (controlado por `app.set('trust proxy', env.TRUST_PROXY)`),
 * evitando leer manualmente el encabezado falsificable `x-forwarded-for`.
 */
function extractClientMeta(req) {
  const ipAddress = req.ip || req.socket?.remoteAddress || 'desconocida';
  const userAgent = req.headers['user-agent'] || 'desconocido';
  return { ipAddress, userAgent };
}

/**
 * Fase 2.7: Extrae el JWT primero desde la cookie `httpOnly` de sesión y mantiene
 * el header `Authorization: Bearer` como respaldo opcional para clientes CLI/pruebas.
 */
function extractJwtToken(req) {
  const cookieToken = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }

  return null;
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
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new UnauthorizedError('Token inválido o expirado');
    }

    const usuario = await Usuario.findByPk(Number(decoded.sub), {
      include: [
        { model: Rol, as: 'rol' },
        { model: Sucursal, as: 'sucursal' },
      ],
    });

    if (!usuario || !usuario.activo || !usuario.rol?.activo || !usuario.sucursal?.activa) {
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

module.exports = { obtenerPermisosEfectivos, extractClientMeta, authenticate };
