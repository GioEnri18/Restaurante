const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { UnidadMedida } = require('./enums');
// ==================== PROVEEDOR ====================
class Proveedor extends Model {
}
Proveedor.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    nit: { type: DataTypes.STRING(25), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(120), allowNull: true },
    contacto: { type: DataTypes.STRING(100), allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'proveedores', timestamps: true, createdAt: true, updatedAt: true });
// ==================== INGREDIENTE ====================
class Ingrediente extends Model {
}
Ingrediente.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    proveedorId: { type: DataTypes.INTEGER, allowNull: true, field: 'proveedor_id' },
    codigo: { type: DataTypes.STRING(30), allowNull: false },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    unidadBase: { type: DataTypes.STRING(10), allowNull: false, defaultValue: UnidadMedida.oz, field: 'unidad_base' },
    stockActualOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0, field: 'stock_actual_oz' },
    stockMinimoOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 16, field: 'stock_minimo_oz' },
    costoPromedioOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0, field: 'costo_promedio_oz' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { sequelize, tableName: 'ingredientes', timestamps: true, createdAt: true, updatedAt: true });
// ==================== COMPRA ====================
class Compra extends Model {
}
Compra.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    proveedorId: { type: DataTypes.INTEGER, allowNull: false, field: 'proveedor_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    numeroDocumento: { type: DataTypes.STRING(60), allowNull: true, field: 'numero_documento' },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    observaciones: { type: DataTypes.STRING(300), allowNull: true },
    fechaCompra: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'fecha_compra' },
}, { sequelize, tableName: 'compras', timestamps: true, createdAt: true, updatedAt: false });
// ==================== COMPRA_DETALLE ====================
class CompraDetalle extends Model {
}
CompraDetalle.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    compraId: { type: DataTypes.INTEGER, allowNull: false, field: 'compra_id' },
    ingredienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'ingrediente_id' },
    cantidadLb: { type: DataTypes.DECIMAL(10, 4), allowNull: false, field: 'cantidad_lb' },
    cantidadOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'cantidad_oz' },
    precioPorLb: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'precio_por_lb' },
    costoPorOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'costo_por_oz' },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, { sequelize, tableName: 'compra_detalles', timestamps: false });
// ==================== INVENTARIO_MOVIMIENTO (KARDEX) ====================
class InventarioMovimiento extends Model {
}
InventarioMovimiento.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    ingredienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'ingrediente_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    cantidadOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'cantidad_oz' },
    stockAnteriorOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'stock_anterior_oz' },
    stockNuevoOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'stock_nuevo_oz' },
    costoUnitarioOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0, field: 'costo_unitario_oz' },
    referenciaTipo: { type: DataTypes.STRING(40), allowNull: true, field: 'referencia_tipo' },
    referenciaId: { type: DataTypes.INTEGER, allowNull: true, field: 'referencia_id' },
    motivo: { type: DataTypes.STRING(300), allowNull: true },
}, { sequelize, tableName: 'inventario_movimientos', timestamps: true, createdAt: true, updatedAt: false });
// ==================== MERMA ====================
class Merma extends Model {
}
Merma.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    ingredienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'ingrediente_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    cantidadOriginal: { type: DataTypes.DECIMAL(10, 4), allowNull: false, field: 'cantidad_original' },
    unidadOriginal: { type: DataTypes.STRING(10), allowNull: false, field: 'unidad_original' },
    cantidadOz: { type: DataTypes.DECIMAL(12, 4), allowNull: false, field: 'cantidad_oz' },
    costoEstimado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'costo_estimado' },
    motivo: { type: DataTypes.STRING(30), allowNull: false },
    observacion: { type: DataTypes.STRING(300), allowNull: true },
    pedidoDomicilioId: { type: DataTypes.INTEGER, allowNull: true, field: 'pedido_domicilio_id' },
    idempotencyKey: { type: DataTypes.UUID, field: 'idempotency_key' },
    idempotencyHuella: { type: DataTypes.STRING(64), field: 'idempotency_huella' },
    fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, { sequelize, tableName: 'mermas', timestamps: true, createdAt: true, updatedAt: false });

module.exports = {
  Proveedor,
  Ingrediente,
  Compra,
  CompraDetalle,
  InventarioMovimiento,
  Merma,
};
