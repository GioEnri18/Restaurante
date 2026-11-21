const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { EstadoMesa } = require('./enums');
// ==================== CATEGORIA ====================
class Categoria extends Model {
}
Categoria.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: true, field: 'sucursal_id' },
    nombre: { type: DataTypes.STRING(80), allowNull: false },
    descripcion: { type: DataTypes.STRING(200), allowNull: true },
    orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'categorias', timestamps: true, createdAt: true, updatedAt: true });
// ==================== PLATILLO ====================
class Platillo extends Model {
}
Platillo.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    categoriaId: { type: DataTypes.INTEGER, allowNull: false, field: 'categoria_id' },
    // Único por sucursal (índice platillos_sucursal_id_sku_key)
    sku: { type: DataTypes.STRING(30), allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    descripcion: { type: DataTypes.STRING(300), allowNull: true },
    precioVenta: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'precio_venta' },
    imagenUrl: { type: DataTypes.STRING(300), allowNull: true, field: 'imagen_url' },
    disponible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'platillos', timestamps: true, createdAt: true, updatedAt: true });
// ==================== RECETA_INGREDIENTE ====================
class RecetaIngrediente extends Model {
}
RecetaIngrediente.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    platilloId: { type: DataTypes.INTEGER, allowNull: false, field: 'platillo_id' },
    ingredienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'ingrediente_id' },
    cantidadOz: { type: DataTypes.DECIMAL(10, 4), allowNull: false, field: 'cantidad_oz' },
}, { sequelize, tableName: 'receta_ingredientes', timestamps: false });
// ==================== MESA ====================
class Mesa extends Model {
}
Mesa.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    numero: { type: DataTypes.STRING(20), allowNull: false },
    capacidad: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: EstadoMesa.DISPONIBLE },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'mesas', timestamps: false });
// ==================== MENU_ESPECIAL ====================
class MenuEspecial extends Model {
}
MenuEspecial.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    creadoPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'creado_por_id' },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    descripcion: { type: DataTypes.STRING(300), allowNull: true },
    fechaInicio: { type: DataTypes.DATE, allowNull: false, field: 'fecha_inicio' },
    fechaFin: { type: DataTypes.DATE, allowNull: false, field: 'fecha_fin' },
    diasAvisoPrevio: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, field: 'dias_aviso_previo' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    esMenuPrincipal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'es_menu_principal' },
}, { sequelize, tableName: 'menus_especiales', timestamps: true, createdAt: true, updatedAt: true });
// ==================== MENU_ESPECIAL_PLATILLO ====================
class MenuEspecialPlatillo extends Model {
}
MenuEspecialPlatillo.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    menuEspecialId: { type: DataTypes.INTEGER, allowNull: false, field: 'menu_especial_id' },
    platilloId: { type: DataTypes.INTEGER, allowNull: false, field: 'platillo_id' },
    precioEspecial: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'precio_especial' },
}, { sequelize, tableName: 'menu_especial_platillos', timestamps: false });

module.exports = {
  Categoria,
  Platillo,
  RecetaIngrediente,
  Mesa,
  MenuEspecial,
  MenuEspecialPlatillo,
};
