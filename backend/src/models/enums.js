// Enumeraciones de dominio compartidas (coinciden 1:1 con los ENUM nativos de PostgreSQL)
const EstadoMesa = {
    DISPONIBLE: 'DISPONIBLE',
    OCUPADA: 'OCUPADA',
    RESERVADA: 'RESERVADA',
};
const TipoServicio = {
    MOSTRADOR: 'MOSTRADOR',
    LLEVAR: 'LLEVAR',
    MESA: 'MESA',
    DELIVERY: 'DELIVERY',
};
const MetodoPago = {
    EFECTIVO: 'EFECTIVO',
    TARJETA: 'TARJETA',
};
const EstadoVenta = {
    COMPLETADA: 'COMPLETADA',
    ANULADA: 'ANULADA',
};
const EstadoFactura = {
    EMITIDA: 'EMITIDA',
    ANULADA: 'ANULADA',
};
const EstadoComanda = {
    PENDIENTE: 'PENDIENTE',
    EN_PREPARACION: 'EN_PREPARACION',
    LISTA: 'LISTA',
    ENTREGADA: 'ENTREGADA',
};
const EstadoCaja = {
    ABIERTA: 'ABIERTA',
    CERRADA: 'CERRADA',
};
const TipoMovimientoCaja = {
    INGRESO_VENTA: 'INGRESO_VENTA',
    INGRESO_MANUAL: 'INGRESO_MANUAL',
    EGRESO_MANUAL: 'EGRESO_MANUAL',
    EGRESO_ANULACION: 'EGRESO_ANULACION',
};
const TipoMovimientoInventario = {
    ENTRADA_COMPRA: 'ENTRADA_COMPRA',
    SALIDA_VENTA: 'SALIDA_VENTA',
    SALIDA_MERMA: 'SALIDA_MERMA',
    AJUSTE_MANUAL: 'AJUSTE_MANUAL',
    REVERSION_ANULACION: 'REVERSION_ANULACION',
};
const MotivoMerma = {
    VENCIMIENTO: 'VENCIMIENTO',
    DANO: 'DANO',
    ERROR_PREPARACION: 'ERROR_PREPARACION',
    ACCIDENTE: 'ACCIDENTE',
    OTRO: 'OTRO',
};
const UnidadMedida = {
    lb: 'lb',
    oz: 'oz',
};

module.exports = {
  EstadoMesa,
  TipoServicio,
  MetodoPago,
  EstadoVenta,
  EstadoFactura,
  EstadoComanda,
  EstadoCaja,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
  MotivoMerma,
  UnidadMedida,
};
