const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { EstadoCaja, EstadoComanda, EstadoFactura, EstadoVenta, MetodoPago, TipoServicio } = require('./enums');
// ==================== CAJA_SESION ====================
class CajaSesion extends Model {
}
CajaSesion.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    usuarioAperturaId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_apertura_id' },
    usuarioCierreId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_cierre_id' },
    // Control dual: supervisor (Administrador/Auditor) que autorizó la apertura y el cierre
    usuarioAutorizaAperturaId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_autoriza_apertura_id' },
    usuarioAutorizaCierreId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_autoriza_cierre_id' },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: EstadoCaja.ABIERTA },
    montoInicial: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'monto_inicial' },
    totalVentasEfectivo: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_ventas_efectivo' },
    totalVentasTarjeta: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_ventas_tarjeta' },
    totalIngresosExtra: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_ingresos_extra' },
    totalEgresos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_egresos' },
    totalEgresosTarjeta: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'total_egresos_tarjeta' },
    montoEsperadoEfectivo: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'monto_esperado_efectivo' },
    montoContadoEfectivo: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'monto_contado_efectivo' },
    diferencia: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    observacionesCierre: { type: DataTypes.STRING(300), allowNull: true, field: 'observaciones_cierre' },
    fechaApertura: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'fecha_apertura' },
    fechaCierre: { type: DataTypes.DATE, allowNull: true, field: 'fecha_cierre' },
}, { sequelize, tableName: 'caja_sesiones', timestamps: false });
// ==================== CAJA_MOVIMIENTO ====================
class CajaMovimiento extends Model {
}
CajaMovimiento.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    cajaSesionId: { type: DataTypes.INTEGER, allowNull: false, field: 'caja_sesion_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    ventaId: { type: DataTypes.INTEGER, allowNull: true, field: 'venta_id' },
    tipo: { type: DataTypes.STRING(30), allowNull: false },
    metodoPago: { type: DataTypes.STRING(20), allowNull: false, defaultValue: MetodoPago.EFECTIVO, field: 'metodo_pago' },
    monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    descripcion: { type: DataTypes.STRING(250), allowNull: false },
}, { sequelize, tableName: 'caja_movimientos', timestamps: true, createdAt: true, updatedAt: false });
// ==================== VENTA ====================
class Venta extends Model {
}
Venta.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    cajaSesionId: { type: DataTypes.INTEGER, allowNull: false, field: 'caja_sesion_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: 'usuario_id' },
    mesaId: { type: DataTypes.INTEGER, allowNull: true, field: 'mesa_id' },
    tipoServicio: { type: DataTypes.STRING(20), allowNull: false, defaultValue: TipoServicio.MOSTRADOR, field: 'tipo_servicio' },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: EstadoVenta.COMPLETADA },
    subtotalSinIva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'subtotal_sin_iva' },
    ivaMonto: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'iva_monto' },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    costoTotalReceta: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'costo_total_receta' },
    metodoPago: { type: DataTypes.STRING(20), allowNull: false, field: 'metodo_pago' },
    montoRecibido: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'monto_recibido' },
    cambio: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    referenciaPago: { type: DataTypes.STRING(80), allowNull: true, field: 'referencia_pago' },
    observaciones: { type: DataTypes.STRING(300), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: true, field: 'idempotency_key' },
    idempotencyHuella: { type: DataTypes.STRING(64), allowNull: true, field: 'idempotency_huella' },
    reservaId: { type: DataTypes.INTEGER, allowNull: true, field: 'reserva_id' },
    datosDeliveryJson: { type: DataTypes.JSONB, allowNull: true, field: 'datos_delivery_json' },
}, { sequelize, tableName: 'ventas', timestamps: true, createdAt: true, updatedAt: false });
// ==================== VENTA_DETALLE ====================
class VentaDetalle extends Model {
}
VentaDetalle.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ventaId: { type: DataTypes.INTEGER, allowNull: false, field: 'venta_id' },
    platilloId: { type: DataTypes.INTEGER, allowNull: false, field: 'platillo_id' },
    nombrePlatillo: { type: DataTypes.STRING(120), allowNull: false, field: 'nombre_platillo' },
    cantidad: { type: DataTypes.INTEGER, allowNull: false },
    precioUnitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'precio_unitario' },
    costoUnitarioReceta: { type: DataTypes.DECIMAL(10, 4), allowNull: false, defaultValue: 0, field: 'costo_unitario_receta' },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    notas: { type: DataTypes.STRING(250), allowNull: true },
}, { sequelize, tableName: 'venta_detalles', timestamps: false });
// ==================== FACTURA (INMUTABLE, COMPROBANTE INTERNO) ====================
class Factura extends Model {
}
Factura.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    ventaId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'venta_id' },
    serie: { type: DataTypes.STRING(10), allowNull: false },
    numero: { type: DataTypes.INTEGER, allowNull: false },
    numeroCompleto: { type: DataTypes.STRING(30), allowNull: false, field: 'numero_completo' },
    clienteNit: { type: DataTypes.STRING(25), allowNull: false, defaultValue: 'CF', field: 'cliente_nit' },
    clienteNombre: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Consumidor Final', field: 'cliente_nombre' },
    clienteDireccion: { type: DataTypes.STRING(250), allowNull: true, defaultValue: 'Ciudad', field: 'cliente_direccion' },
    subtotalSinIva: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'subtotal_sin_iva' },
    ivaMonto: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'iva_monto' },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: EstadoFactura.EMITIDA },
    motivoAnulacion: { type: DataTypes.STRING(300), allowNull: true, field: 'motivo_anulacion' },
    anuladaPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'anulada_por_id' },
    anuladaEn: { type: DataTypes.DATE, allowNull: true, field: 'anulada_en' },
    reimpresionesCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'reimpresiones_count' },
    // Las columnas fel_* siguen en la tabla (migraciones antiguas) pero ya no se usan: la factura es un
    // comprobante interno y no se certifica ante la SAT. fel_estado conserva su DEFAULT 'NO_APLICA'.
}, { sequelize, tableName: 'facturas', timestamps: true, createdAt: true, updatedAt: false });
// ==================== COMANDA ====================
class Comanda extends Model {
}
Comanda.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    ventaId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'venta_id' },
    numeroComanda: { type: DataTypes.STRING(30), allowNull: false, field: 'numero_comanda' },
    tipoServicio: { type: DataTypes.STRING(20), allowNull: false, field: 'tipo_servicio' },
    mesaNumero: { type: DataTypes.STRING(20), allowNull: true, field: 'mesa_numero' },
    nombreTurno: { type: DataTypes.STRING(80), allowNull: true, field: 'nombre_turno' },
    estadoCocina: { type: DataTypes.STRING(20), allowNull: false, defaultValue: EstadoComanda.PENDIENTE, field: 'estado_cocina' },
}, { sequelize, tableName: 'comandas', timestamps: true, createdAt: true, updatedAt: false });
// ==================== AUDITORIA_LOG (APPEND-ONLY) ====================
class AuditoriaLog extends Model {
}
AuditoriaLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: true, field: 'sucursal_id' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_id' },
    // Snapshot del rol del actor al momento del evento
    actorRolCodigo: { type: DataTypes.STRING(40), allowNull: true, field: 'actor_rol_codigo' },
    // Supervisor que autorizó la operación en control dual (opcional)
    aprobadorId: { type: DataTypes.INTEGER, allowNull: true, field: 'aprobador_id' },
    // Turno de caja asociado al evento (opcional)
    cajaSesionId: { type: DataTypes.INTEGER, allowNull: true, field: 'caja_sesion_id' },
    accion: { type: DataTypes.STRING(60), allowNull: false },
    // Severidad del evento (NULL en registros históricos previos a la migración; se deriva en lectura)
    severidad: { type: DataTypes.STRING(10), allowNull: true },
    entidad: { type: DataTypes.STRING(60), allowNull: false },
    entidadId: { type: DataTypes.STRING(60), allowNull: true, field: 'entidad_id' },
    valorAnterior: { type: DataTypes.JSONB, allowNull: true, field: 'valor_anterior' },
    valorNuevo: { type: DataTypes.JSONB, allowNull: true, field: 'valor_nuevo' },
    // Código de motivo estandarizado (motivo conserva la nota libre)
    codigoMotivo: { type: DataTypes.STRING(40), allowNull: true, field: 'codigo_motivo' },
    motivo: { type: DataTypes.STRING(300), allowNull: true },
    // Impacto financiero en quetzales (positivo o negativo)
    impactoFinanciero: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'impacto_financiero' },
    // UUID para agrupar múltiples eventos generados por una misma operación de negocio
    correlacionId: { type: DataTypes.UUID, allowNull: true, field: 'correlacion_id' },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true, field: 'ip_address' },
    userAgent: { type: DataTypes.STRING(255), allowNull: true, field: 'user_agent' },
}, { sequelize, tableName: 'auditoria_logs', timestamps: true, createdAt: true, updatedAt: false });

module.exports = {
  CajaSesion,
  CajaMovimiento,
  Venta,
  VentaDetalle,
  Factura,
  Comanda,
  AuditoriaLog,
};
