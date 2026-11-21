const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { env } = require('../config/env');
const { obtenerPermisosEfectivos } = require('../middlewares/authenticate');
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

class AuthService {
  static async login(identifier, password, clientMeta) {
    const cleanIdentifier = identifier.trim();
    const auditId = sanitizarIdentificadorAuditoria(cleanIdentifier);

    const usuario = await Usuario.findOne({
      where: {
        [Op.or]: [
          { username: { [Op.iLike]: cleanIdentifier } },
          { email: { [Op.iLike]: cleanIdentifier } },
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

    // Fase 2.2: Validar contraseña ANTES de revelar si la cuenta está desactivada (mismo mensaje genérico)
    if (!usuario || !usuario.rol || !usuario.sucursal || !passwordValido) {
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

    await usuario.update({ ultimoAcceso: new Date() });
    const permisos = await obtenerPermisosEfectivos(usuario.id, usuario.rolId);

    const token = jwt.sign(
      {
        sub: usuario.id,
        username: usuario.username,
        rolCodigo: usuario.rol.codigo,
        sucursalId: usuario.sucursalId,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN },
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

module.exports = { AuthService, sanitizarIdentificadorAuditoria };
