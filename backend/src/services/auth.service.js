const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op, QueryTypes, col, fn, where } = require('sequelize');
const { ACCIONES_AUDITORIA, JWT_ALGORITHM } = require('../config/constants');
const { sequelize } = require('../config/database');
const { env } = require('../config/env');
const { obtenerPermisosEfectivos } = require('./permisos.service');
const { Rol, Sucursal, Usuario } = require('../models');
const { UnauthorizedError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');

// Fase 2.2: Hash bcrypt válido generado con el mismo env.BCRYPT_SALT_ROUNDS para igualar tiempos de respuesta
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy_timing_protection_pos_gt', env.BCRYPT_SALT_ROUNDS);

/**
 * Fase 2.2: Enmascara y resume el identificador para auditoría de login fallido.
 * Evita registrar accidentalmente una contraseña escrita en el campo de usuario.
 */
function sanitizarIdentificadorAuditoria(raw) {
  const clean = String(raw || '').trim();
  const normalized = clean.toLowerCase();
  const hashCorto = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  const prefijo = clean.length <= 2 ? '**' : `${clean.slice(0, 2)}***`;
  return {
    identifierMasked: prefijo,
    identifierHash: hashCorto,
  };
}

/**
 * Auditoría P0.2: incremento atómico de intentos fallidos. Al llegar al máximo se bloquea la
 * cuenta durante AUTH_LOCKOUT_MINUTES y el contador vuelve a 0.
 */
async function registrarIntentoFallido(usuarioId) {
  await sequelize.query(
    `UPDATE usuarios
     SET intentos_fallidos = CASE
           WHEN intentos_fallidos + 1 >= :max THEN 0
           ELSE intentos_fallidos + 1
         END,
         bloqueado_hasta = CASE
           WHEN intentos_fallidos + 1 >= :max THEN NOW() + (:minutos || ' minutes')::interval
           ELSE bloqueado_hasta
         END
     WHERE id = :usuarioId`,
    {
      replacements: {
        usuarioId,
        max: env.AUTH_LOCKOUT_MAX_ATTEMPTS,
        minutos: String(env.AUTH_LOCKOUT_MINUTES),
      },
      type: QueryTypes.UPDATE,
    },
  );
}

/**
 * Auditoría P0.3: incrementa token_version para revocar todos los JWT vigentes del usuario.
 * Acepta una transacción opcional para usarse dentro de operaciones de Accesos.
 */
async function revocarSesionesUsuario(usuarioId, transaction) {
  await Usuario.increment('tokenVersion', { by: 1, where: { id: usuarioId }, transaction });
}

class AuthService {
  static async login(identifier, password, clientMeta) {
    const cleanIdentifier = identifier.trim();
    const auditId = sanitizarIdentificadorAuditoria(cleanIdentifier);

    // Auditoría P0.2: comparación EXACTA insensible a mayúsculas (ILIKE trataba % y _ como comodines)
    const identificadorNormalizado = cleanIdentifier.toLowerCase();
    const usuario = await Usuario.findOne({
      where: {
        [Op.or]: [
          where(fn('lower', col('Usuario.username')), identificadorNormalizado),
          where(fn('lower', col('Usuario.email')), identificadorNormalizado),
        ],
      },
      include: [
        { model: Rol, as: 'rol' },
        { model: Sucursal, as: 'sucursal' },
      ],
    });

    // Fase 2.2: Ejecutar SIEMPRE bcrypt.compare (incluso si el usuario no existe) para mitigar timing attacks
    const hashAComparar = usuario ? usuario.passwordHash : DUMMY_PASSWORD_HASH;
    const passwordValido = await bcrypt.compare(password, hashAComparar);

    // Auditoría P0.2: cuenta bloqueada temporalmente por intentos fallidos.
    // Solo se revela el bloqueo si la contraseña es correcta (mismo criterio que Fase 2.2).
    const bloqueada = Boolean(usuario?.bloqueadoHasta && usuario.bloqueadoHasta > new Date());
    if (bloqueada) {
      await AuditService.registrar({
        sucursalId: usuario.sucursalId,
        usuarioId: usuario.id,
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorNuevo: { ...auditId, motivo: 'Cuenta bloqueada temporalmente' },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError(
        passwordValido
          ? 'Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.'
          : 'Credenciales inválidas',
      );
    }

    // Fase 2.2: Validar contraseña ANTES de revelar si la cuenta está desactivada (mismo mensaje genérico)
    if (!usuario || !usuario.rol || !usuario.sucursal || !passwordValido) {
      if (usuario && !passwordValido) {
        await registrarIntentoFallido(usuario.id);
      }
      await AuditService.registrar({
        sucursalId: usuario?.sucursalId ?? null,
        usuarioId: usuario?.id ?? null,
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        entidadId: usuario?.id ?? null,
        valorNuevo: {
          ...auditId,
          motivo: usuario ? 'Contraseña incorrecta' : 'Usuario no encontrado',
        },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError('Credenciales inválidas');
    }

    // Solo si la contraseña SÍ es correcta, informar cuando la cuenta/rol/sucursal está inactiva
    if (!usuario.activo || !usuario.rol.activo || !usuario.sucursal.activa) {
      await AuditService.registrar({
        sucursalId: usuario.sucursalId,
        usuarioId: usuario.id,
        accion: ACCIONES_AUDITORIA.LOGIN_FALLIDO,
        entidad: 'Usuario',
        entidadId: usuario.id,
        valorNuevo: {
          ...auditId,
          motivo: 'Cuenta, rol o sucursal inactiva',
        },
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      });
      throw new UnauthorizedError('Tu cuenta se encuentra desactivada. Contacta al administrador.');
    }

    await usuario.update({ ultimoAcceso: new Date(), intentosFallidos: 0, bloqueadoHasta: null });
    const permisos = await obtenerPermisosEfectivos(usuario.id, usuario.rolId);

    // Auditoría P0.3: `ver` liga el token a token_version; al incrementarla se revocan las sesiones
    const token = jwt.sign(
      {
        sub: usuario.id,
        ver: usuario.tokenVersion,
        username: usuario.username,
        rolCodigo: usuario.rol.codigo,
        sucursalId: usuario.sucursalId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM },
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

  static async logout(user, clientMeta) {
    // Auditoría P0.3: invalida en servidor todos los JWT emitidos para el usuario
    await revocarSesionesUsuario(user.id);
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

  static async getProfile(user) {
    const sucursal = await Sucursal.findByPk(user.sucursalId, {
      attributes: ['id', 'codigo', 'nombre', 'nit', 'direccion', 'telefono', 'serieFactura'],
    });
    return {
      id: user.id,
      username: user.username,
      nombreCompleto: user.nombreCompleto,
      email: user.email,
      sucursal: sucursal ? sucursal.get({ plain: true }) : null,
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

module.exports = {
  AuthService,
  sanitizarIdentificadorAuditoria,
  revocarSesionesUsuario,
};
