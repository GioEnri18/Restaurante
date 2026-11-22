const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { PERMISOS_CATALOGO } = require('../config/constants');
const { disconnectDatabase, sequelize, withTransaction } = require('../config/database');
const { env } = require('../config/env');
const { Permiso, Rol, RolPermiso, Sucursal, Usuario } = require('../models');

/**
 * Bootstrap limpio para producción:
 * 1. Crea la sucursal principal (el trigger SQL precarga automáticamente el menú base BX).
 * 2. Sincroniza el catálogo oficial de permisos maestros.
 * 3. Crea/sincroniza los 4 roles del negocio: ADMIN, CAJERO, MESERO y AUDITOR (con caja:autorizar).
 * 4. Crea el primer usuario Administrador usando ADMIN_PASSWORD (obligatoria, >= PASSWORD_MIN_LENGTH).
 */
async function main() {
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword || adminPassword.length < env.PASSWORD_MIN_LENGTH) {
    console.error(
      `❌ ADMIN_PASSWORD es obligatoria y debe tener al menos ${env.PASSWORD_MIN_LENGTH} caracteres.`,
    );
    process.exit(1);
  }

  const sucursalCodigo = process.env.SUCURSAL_CODIGO?.trim() || 'SUC-01';
  const sucursalNombre = process.env.SUCURSAL_NOMBRE?.trim() || 'Sucursal Principal';
  const sucursalNit = process.env.SUCURSAL_NIT?.trim() || 'CF';
  const sucursalDireccion = process.env.SUCURSAL_DIRECCION?.trim() || 'Guatemala';
  const sucursalTelefono = process.env.SUCURSAL_TELEFONO?.trim() || null;
  const sucursalSerie = process.env.SUCURSAL_SERIE_FACTURA?.trim() || 'A';

  const adminUsername = (process.env.ADMIN_USERNAME?.trim() || 'admin').toLowerCase();
  const adminEmail = (process.env.ADMIN_EMAIL?.trim() || 'admin@restaurante.gt').toLowerCase();
  const adminNombre = process.env.ADMIN_NOMBRE?.trim() || 'Administrador Principal';

  console.log('🚀 Iniciando bootstrap limpio de producción (POS Restaurante Guatemala)...');
  await sequelize.authenticate();

  const passwordHash = await bcrypt.hash(adminPassword, env.BCRYPT_SALT_ROUNDS);

  const resumen = await withTransaction(async (transaction) => {
    const [sucursal, sucursalCreada] = await Sucursal.findOrCreate({
      where: { codigo: sucursalCodigo },
      defaults: {
        codigo: sucursalCodigo,
        nombre: sucursalNombre,
        nit: sucursalNit,
        direccion: sucursalDireccion,
        telefono: sucursalTelefono,
        serieFactura: sucursalSerie,
        correlativoActual: 0,
        correlativoComanda: 0,
      },
      transaction,
    });

    const permisosMap = new Map();
    for (const p of PERMISOS_CATALOGO) {
      const [permiso] = await Permiso.findOrCreate({
        where: { codigo: p.codigo },
        defaults: { ...p },
        transaction,
      });
      await permiso.update(
        { descripcion: p.descripcion, vista: p.vista, accion: p.accion },
        { transaction },
      );
      permisosMap.set(permiso.codigo, permiso.id);
    }

    const rolesConfig = [
      {
        codigo: 'ADMIN',
        nombre: 'Administrador',
        descripcion: 'Control total del restaurante, reportes, auditoría y administración de accesos',
        vistaInicial: '/reportes',
        esSistema: true,
        permisos: PERMISOS_CATALOGO.map((p) => p.codigo),
      },
      {
        codigo: 'CAJERO',
        nombre: 'Cajero',
        descripcion: 'Toma de órdenes en mostrador y control/cuadre de caja diaria',
        vistaInicial: '/ventas',
        esSistema: true,
        permisos: [
          'ventas:ver',
          'ventas:crear',
          'caja:ver',
          'caja:abrir',
          'caja:movimiento',
          'caja:cerrar',
        ],
      },
      {
        codigo: 'MESERO',
        nombre: 'Mesero',
        descripcion: 'Atención en mesa y pedidos para llevar desde el menú táctil',
        vistaInicial: '/ventas',
        esSistema: true,
        permisos: ['ventas:ver', 'ventas:crear', 'facturas:ver'],
      },
      {
        codigo: 'AUDITOR',
        nombre: 'Auditor',
        descripcion:
          'Supervisión de caja y consulta de solo lectura sobre reportes, auditoría, facturas, inventario y mermas',
        vistaInicial: '/auditoria',
        esSistema: false,
        permisos: [
          'reportes:ver',
          'reportes:exportar',
          'auditoria:ver',
          'facturas:ver',
          'caja:ver',
          'caja:autorizar',
          'inventario:ver',
          'mermas:ver',
        ],
      },
    ];

    const rolesMap = new Map();
    for (const rc of rolesConfig) {
      const [rol] = await Rol.findOrCreate({
        where: { codigo: rc.codigo },
        defaults: {
          codigo: rc.codigo,
          nombre: rc.nombre,
          descripcion: rc.descripcion,
          vistaInicial: rc.vistaInicial,
          esSistema: rc.esSistema,
        },
        transaction,
      });
      await rol.update(
        {
          nombre: rc.nombre,
          descripcion: rc.descripcion,
          vistaInicial: rc.vistaInicial,
        },
        { transaction },
      );
      rolesMap.set(rol.codigo, rol.id);

      const permisoIdsDeseados = rc.permisos
        .map((codigoPermiso) => permisosMap.get(codigoPermiso))
        .filter((id) => Boolean(id));

      for (const permisoId of permisoIdsDeseados) {
        await RolPermiso.findOrCreate({
          where: { rolId: rol.id, permisoId },
          defaults: { rolId: rol.id, permisoId },
          transaction,
        });
      }
    }

    let admin = await Usuario.findOne({
      where: {
        [Op.or]: [{ username: adminUsername }, { email: adminEmail }],
      },
      transaction,
    });
    let adminCreado = false;

    if (!admin) {
      admin = await Usuario.create(
        {
          sucursalId: sucursal.id,
          rolId: rolesMap.get('ADMIN'),
          nombreCompleto: adminNombre,
          username: adminUsername,
          email: adminEmail,
          passwordHash,
          activo: true,
        },
        { transaction },
      );
      adminCreado = true;
    }

    return {
      sucursal: `${sucursal.codigo} - ${sucursal.nombre} (${sucursalCreada ? 'creada' : 'existente'})`,
      permisos: permisosMap.size,
      roles: Array.from(rolesMap.keys()),
      admin: `${admin.username} / ${admin.email} (${adminCreado ? 'creado' : 'ya existía, sin cambios'})`,
    };
  });

  console.log('✅ Bootstrap de producción completado exitosamente:');
  console.log(`   • Sucursal : ${resumen.sucursal}`);
  console.log(`   • Permisos : ${resumen.permisos}`);
  console.log(`   • Roles    : ${resumen.roles.join(', ')}`);
  console.log(`   • Admin    : ${resumen.admin}`);
}

main()
  .catch((error) => {
    console.error('❌ Error en bootstrap de producción:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectDatabase();
  });
