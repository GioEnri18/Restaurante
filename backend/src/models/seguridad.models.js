const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
// ==================== SUCURSAL ====================
class Sucursal extends Model {
}
Sucursal.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    codigo: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    nit: { type: DataTypes.STRING(25), allowNull: false },
    direccion: { type: DataTypes.STRING(250), allowNull: false },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    serieFactura: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'A', field: 'serie_factura' },
    correlativoActual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'correlativo_actual' },
    correlativoComanda: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'correlativo_comanda' },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'sucursales', timestamps: true, createdAt: true, updatedAt: true });
// ==================== ROL ====================
class Rol extends Model {
}
Rol.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    codigo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(80), allowNull: false },
    descripcion: { type: DataTypes.STRING(250), allowNull: true },
    vistaInicial: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '/ventas', field: 'vista_inicial' },
    esSistema: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'es_sistema' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'roles', timestamps: true, createdAt: true, updatedAt: true });
// ==================== PERMISO ====================
class Permiso extends Model {
}
Permiso.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    codigo: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    vista: { type: DataTypes.STRING(40), allowNull: false },
    accion: { type: DataTypes.STRING(40), allowNull: false },
    descripcion: { type: DataTypes.STRING(200), allowNull: false },
}, { sequelize, tableName: 'permisos', timestamps: true, createdAt: true, updatedAt: false });
// ==================== ROL_PERMISO ====================
class RolPermiso extends Model {
}
RolPermiso.init({
    rolId: { type: DataTypes.INTEGER, primaryKey: true, field: 'rol_id' },
    permisoId: { type: DataTypes.INTEGER, primaryKey: true, field: 'permiso_id' },
}, { sequelize, tableName: 'rol_permisos', timestamps: false });
// ==================== USUARIO ====================
class Usuario extends Model {
}
Usuario.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    rolId: { type: DataTypes.INTEGER, allowNull: false, field: 'rol_id' },
    nombreCompleto: { type: DataTypes.STRING(120), allowNull: false, field: 'nombre_completo' },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ultimoAcceso: { type: DataTypes.DATE, allowNull: true, field: 'ultimo_acceso' },
    intentosFallidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'intentos_fallidos' },
    bloqueadoHasta: { type: DataTypes.DATE, allowNull: true, field: 'bloqueado_hasta' },
    tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'token_version' },
}, { sequelize, tableName: 'usuarios', timestamps: true, createdAt: true, updatedAt: true });
// ==================== USUARIO_PERMISO ====================
class UsuarioPermiso extends Model {
}
UsuarioPermiso.init({
    usuarioId: { type: DataTypes.INTEGER, primaryKey: true, field: 'usuario_id' },
    permisoId: { type: DataTypes.INTEGER, primaryKey: true, field: 'permiso_id' },
    permitido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'usuario_permisos', timestamps: false });

module.exports = {
  Sucursal,
  Rol,
  Permiso,
  RolPermiso,
  Usuario,
  UsuarioPermiso,
};
