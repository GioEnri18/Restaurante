const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { EstadoPedidoDomicilio, MetodoPago } = require('./enums');

// ==================== ZONA_ENTREGA ====================
// Catálogo de zonas de cobertura con tarifa de envío (IVA 12% incluido) y pedido mínimo
class ZonaEntrega extends Model { }
ZonaEntrega.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    nombre: { type: DataTypes.STRING(100), allowNull: false },
    descripcion: { type: DataTypes.STRING(250), allowNull: true },
    costoEnvio: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'costo_envio' },
    tiempoEstimadoMin: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      field: 'tiempo_estimado_min',
    },
    pedidoMinimo: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'pedido_minimo' },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'zonas_entrega', timestamps: true, createdAt: true, updatedAt: true },
);

// ==================== CLIENTE ====================
// Registro de clientes de domicilio identificados por teléfono único por sucursal
class Cliente extends Model { }
Cliente.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    nombre: { type: DataTypes.STRING(150), allowNull: false },
    telefono: { type: DataTypes.STRING(25), allowNull: false },
    nit: { type: DataTypes.STRING(25), allowNull: true },
    notas: { type: DataTypes.STRING(250), allowNull: true },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'clientes', timestamps: true, createdAt: true, updatedAt: true },
);

// ==================== DIRECCION_ENTREGA ====================
// Direcciones de entrega reutilizables por cliente, con zona sugerida y referencia
class DireccionEntrega extends Model { }
DireccionEntrega.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    clienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'cliente_id' },
    zonaEntregaId: { type: DataTypes.INTEGER, allowNull: true, field: 'zona_entrega_id' },
    alias: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Principal' },
    direccion: { type: DataTypes.STRING(250), allowNull: false },
    referencia: { type: DataTypes.STRING(250), allowNull: true },
    esPrincipal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'es_principal' },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'direcciones_entrega', timestamps: true, createdAt: true, updatedAt: true },
);

// ==================== PEDIDO_DOMICILIO ====================
// Ciclo de vida completo del servicio a domicilio (PREPAGADO y CONTRA_ENTREGA)
class PedidoDomicilio extends Model { }
PedidoDomicilio.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    numeroPedido: { type: DataTypes.STRING(30), allowNull: false, field: 'numero_pedido' },
    clienteId: { type: DataTypes.INTEGER, allowNull: false, field: 'cliente_id' },
    direccionEntregaId: { type: DataTypes.INTEGER, allowNull: true, field: 'direccion_entrega_id' },
    zonaEntregaId: { type: DataTypes.INTEGER, allowNull: true, field: 'zona_entrega_id' },
    creadoPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'creado_por_id' },
    tipoEntrega: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'DELIVERY',
      field: 'tipo_entrega',
    },
    origen: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'POS',
      field: 'origen',
    },
    trackingToken: {
      type: DataTypes.STRING(40),
      allowNull: true,
      field: 'tracking_token',
    },
    repartidorId: { type: DataTypes.INTEGER, allowNull: true, field: 'repartidor_id' },
    ventaId: { type: DataTypes.INTEGER, allowNull: true, unique: true, field: 'venta_id' },
    estado: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: EstadoPedidoDomicilio.NUEVO,
    },
    modalidadPago: { type: DataTypes.STRING(20), allowNull: false, field: 'modalidad_pago' },
    metodoPagoEsperado: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: MetodoPago.EFECTIVO,
      field: 'metodo_pago_esperado',
    },
    subtotalPlatillos: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'subtotal_platillos' },
    costoEnvio: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'costo_envio' },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    // Snapshots inmutables al momento de crear el pedido
    zonaNombreSnapshot: { type: DataTypes.STRING(100), allowNull: false, field: 'zona_nombre_snapshot' },
    tiempoEstimadoMin: { type: DataTypes.INTEGER, allowNull: false, field: 'tiempo_estimado_min' },
    direccionSnapshot: { type: DataTypes.STRING(250), allowNull: false, field: 'direccion_snapshot' },
    referenciaSnapshot: { type: DataTypes.STRING(250), allowNull: true, field: 'referencia_snapshot' },
    clienteNombreSnapshot: { type: DataTypes.STRING(150), allowNull: false, field: 'cliente_nombre_snapshot' },
    clienteTelefonoSnapshot: { type: DataTypes.STRING(25), allowNull: false, field: 'cliente_telefono_snapshot' },
    clienteNitSnapshot: {
      type: DataTypes.STRING(25),
      allowNull: false,
      defaultValue: 'CF',
      field: 'cliente_nit_snapshot',
    },
    observaciones: { type: DataTypes.STRING(300), allowNull: true },
    montoConQuePaga: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'monto_con_que_paga' },
    montoRecibidoRepartidor: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'monto_recibido_repartidor',
    },
    diferenciaLiquidacion: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      field: 'diferencia_liquidacion',
    },
    referenciaPagoLiquidacion: {
      type: DataTypes.STRING(80),
      allowNull: true,
      field: 'referencia_pago_liquidacion',
    },
    liquidadoPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'liquidado_por_id' },
    liquidadoEn: { type: DataTypes.DATE, allowNull: true, field: 'liquidado_en' },
    motivoCierre: { type: DataTypes.STRING(300), allowNull: true, field: 'motivo_cierre' },
    mermaGenerada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'merma_generada' },
    facturaAnuladaCierre: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'factura_anulada_cierre',
    },
    asignadoEn: { type: DataTypes.DATE, allowNull: true, field: 'asignado_en' },
    despachadoEn: { type: DataTypes.DATE, allowNull: true, field: 'despachado_en' },
    entregadoEn: { type: DataTypes.DATE, allowNull: true, field: 'entregado_en' },
    canceladoEn: { type: DataTypes.DATE, allowNull: true, field: 'cancelado_en' },
    fallidoEn: { type: DataTypes.DATE, allowNull: true, field: 'fallido_en' },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: false, field: 'idempotency_key' },
    idempotencyHuella: { type: DataTypes.STRING(64), allowNull: false, field: 'idempotency_huella' },
    liquidacionIdempotencyKey: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'liquidacion_idempotency_key',
    },
    liquidacionIdempotencyHuella: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'liquidacion_idempotency_huella',
    },
  },
  { sequelize, tableName: 'pedidos_domicilio', timestamps: true, createdAt: true, updatedAt: true },
);

// ==================== PEDIDO_DOMICILIO_DETALLE ====================
// Líneas de platillos solicitados en un pedido a domicilio
class PedidoDomicilioDetalle extends Model { }
PedidoDomicilioDetalle.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pedidoDomicilioId: { type: DataTypes.INTEGER, allowNull: false, field: 'pedido_domicilio_id' },
    platilloId: { type: DataTypes.INTEGER, allowNull: false, field: 'platillo_id' },
    nombrePlatillo: { type: DataTypes.STRING(120), allowNull: false, field: 'nombre_platillo' },
    cantidad: { type: DataTypes.INTEGER, allowNull: false },
    cantidadCortesia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'cantidad_cortesia' },
    precioUnitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'precio_unitario' },
    subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    notas: { type: DataTypes.STRING(250), allowNull: true },
  },
  { sequelize, tableName: 'pedido_domicilio_detalles', timestamps: false },
);

// ==================== PEDIDO_DOMICILIO_HISTORIAL (APPEND-ONLY) ====================
// Traza cronológica inmutable de cada transición de estado y el usuario responsable
class PedidoDomicilioHistorial extends Model { }
PedidoDomicilioHistorial.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    pedidoDomicilioId: { type: DataTypes.INTEGER, allowNull: false, field: 'pedido_domicilio_id' },
    sucursalId: { type: DataTypes.INTEGER, allowNull: false, field: 'sucursal_id' },
    estadoAnterior: { type: DataTypes.STRING(20), allowNull: true, field: 'estado_anterior' },
    estadoNuevo: { type: DataTypes.STRING(20), allowNull: false, field: 'estado_nuevo' },
    usuarioId: { type: DataTypes.INTEGER, allowNull: true, field: 'usuario_id' },
    observacion: { type: DataTypes.STRING(300), allowNull: true },
  },
  { sequelize, tableName: 'pedido_domicilio_historial', timestamps: true, createdAt: true, updatedAt: false },
);

module.exports = {
  ZonaEntrega,
  Cliente,
  DireccionEntrega,
  PedidoDomicilio,
  PedidoDomicilioDetalle,
  PedidoDomicilioHistorial,
};
