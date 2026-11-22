const bcrypt = require('bcryptjs');
const { Op, col, fn, where } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { Rol, Usuario } = require('../models');
const { BadRequestError, ForbiddenError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { DUMMY_PASSWORD_HASH, registrarIntentoFallido, sanitizarIdentificadorAuditoria } = require('./auth.service');
const { obtenerPermisosEfectivos } = require('./permisos.service');

const PERMISO_AUTORIZAR_CAJA = 'caja:autorizar';
const MENSAJE_RECHAZO = 'Autorización de supervisor inválida';

/**
 * Control dual de caja: quien abre o cierra caja sin el permiso `caja:autorizar` (p. ej. un cajero)
 * necesita el usuario y la contraseña de un supervisor (Administrador o Auditor) que:
 *  - sea un usuario distinto de quien opera la caja,
 *  - esté activo, en la misma sucursal y con rol activo,
 *  - tenga el permiso `caja:autorizar`.
 * Quien ya tiene `caja:autorizar` (un administrador que opera la caja) se autoriza a sí mismo.
 *
 * Seguridad: siempre se ejecuta bcrypt (incluso si el usuario no existe), cada contraseña incorrecta
 * suma al bloqueo temporal de esa cuenta (igual que el login) y los rechazos quedan en auditoría.
 *
 * @returns {{ id: number, username: string, autoAutorizado: boolean }}
 */
async function verificarAutorizacionCaja(user, autorizacion, operacion, clientMeta) {
  if (user.permisos?.includes(PERMISO_AUTORIZAR_CAJA)) {
    return { id: user.id, username: user.username, autoAutorizado: true };
  }

  if (!autorizacion?.identifier || !autorizacion?.password) {
    throw new BadRequestError(
      `Para ${operacion} la caja se requiere el usuario y la contraseña de un administrador o auditor`,
      [{ campo: 'autorizacion', mensaje: 'Ingresa las credenciales del supervisor que autoriza' }],
    );
  }

  const identificador = autorizacion.identifier.trim().toLowerCase();
  const supervisor = await Usuario.findOne({
    where: {
      [Op.or]: [
        where(fn('lower', col('Usuario.username')), identificador),
        where(fn('lower', col('Usuario.email')), identificador),
      ],
    },
    include: [{ model: Rol, as: 'rol' }],
  });

  // Siempre se compara (aunque no exista) para no revelar por tiempo qué usuarios existen
  const passwordValido = await bcrypt.compare(
    autorizacion.password,
    supervisor ? supervisor.passwordHash : DUMMY_PASSWORD_HASH,
  );
  const bloqueado = Boolean(supervisor?.bloqueadoHasta && supervisor.bloqueadoHasta > new Date());

  const rechazar = async (motivo, mensaje = MENSAJE_RECHAZO) => {
    await AuditService.registrar({
      sucursalId: user.sucursalId,
      usuarioId: user.id,
      accion: ACCIONES_AUDITORIA.AUTORIZACION_CAJA_RECHAZADA,
      entidad: 'CajaSesion',
      valorNuevo: { operacion, supervisor: sanitizarIdentificadorAuditoria(identificador), motivo },
      ipAddress: clientMeta?.ipAddress,
      userAgent: clientMeta?.userAgent,
    });
    throw new ForbiddenError(mensaje);
  };

  if (!supervisor || bloqueado || !passwordValido) {
    if (supervisor && !bloqueado && !passwordValido) {
      await registrarIntentoFallido(supervisor.id);
    }
    await rechazar(bloqueado ? 'Supervisor bloqueado temporalmente' : 'Credenciales incorrectas');
  }

  if (supervisor.id === user.id) {
    await rechazar('Autorización propia', 'La caja debe autorizarla un supervisor distinto de quien la opera');
  }
  if (!supervisor.activo || !supervisor.rol?.activo || supervisor.sucursalId !== user.sucursalId) {
    await rechazar('Supervisor inactivo o de otra sucursal');
  }
  const permisos = await obtenerPermisosEfectivos(supervisor.id, supervisor.rolId);
  if (!permisos.includes(PERMISO_AUTORIZAR_CAJA)) {
    await rechazar('Sin permiso caja:autorizar', 'El usuario indicado no puede autorizar operaciones de caja');
  }

  await supervisor.update({ intentosFallidos: 0 });
  return { id: supervisor.id, username: supervisor.username, autoAutorizado: false };
}

module.exports = { verificarAutorizacionCaja, PERMISO_AUTORIZAR_CAJA };
