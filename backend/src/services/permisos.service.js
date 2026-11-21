const { Permiso, RolPermiso, UsuarioPermiso } = require('../models');

/**
 * Regla de negocio de RBAC (antes vivía en el middleware HTTP `authenticate` y el servicio de
 * autenticación la importaba de ahí): permisos del rol + overrides por usuario.
 * Un override `permitido=true` agrega el permiso; `permitido=false` lo quita aunque el rol lo tenga.
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

module.exports = { obtenerPermisosEfectivos };
