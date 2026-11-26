import { FacturaDetalleModel, FacturaResumenModel, MetodoPago, TipoServicio } from '../models';

/** Referencia mínima de usuario en registros de factura. */
interface RawFacturaUsuarioRefJson {
  nombreCompleto?: string;
}

/** Referencia mínima de mesa asociada a la venta de una factura. */
interface RawFacturaMesaRefJson {
  numero?: string | null;
}

/** Comanda de cocina embebida dentro de la venta de una factura. */
interface RawFacturaComandaJson {
  numeroComanda?: string | null;
  tipoServicio?: string;
  mesaNumero?: string | null;
  nombreTurno?: string | null;
  costoEnvio?: number | string;
  direccionEntrega?: string | null;
  referenciaEntrega?: string | null;
  zonaEntregaNombre?: string | null;
  createdAt?: string;
}

/** Detalle de platillo vendido dentro de la venta asociada a la factura. */
interface RawFacturaVentaDetalleJson {
  id?: number | string;
  nombrePlatillo?: string;
  cantidad?: number | string;
  precioUnitario?: number | string;
  subtotal?: number | string;
  cantidadCortesia?: number | string;
  consumoPendiente?: boolean;
  costoPendiente?: boolean;
  notas?: string | null;
}

/** Venta embebida en la respuesta JSON de una factura. */
interface RawFacturaVentaJson {
  id?: number | string;
  tipoServicio?: string;
  metodoPago?: string;
  costoEnvio?: number | string;
  montoRecibido?: number | string;
  cambio?: number | string;
  usuario?: RawFacturaUsuarioRefJson | null;
  mesa?: RawFacturaMesaRefJson | null;
  comanda?: RawFacturaComandaJson | null;
  detalles?: unknown[];
}

/** Datos de sucursal embebidos en el detalle imprimible de la factura. */
interface RawFacturaSucursalJson {
  nombre?: string;
  nit?: string;
  direccion?: string;
  telefono?: string | null;
}

/** Respuesta JSON cruda de una factura desde /api/v1/facturas. */
interface RawFacturaJson {
  id?: number | string;
  ventaId?: number | string;
  numeroCompleto?: string;
  serie?: string;
  clienteNit?: string;
  clienteNombre?: string;
  clienteDireccion?: string;
  subtotalSinIva?: number | string;
  ivaMonto?: number | string;
  costoEnvio?: number | string;
  zonaEntregaNombre?: string | null;
  total?: number | string;
  estado?: string;
  motivoAnulacion?: string | null;
  anuladaEn?: string | null;
  reimpresionesCount?: number | string;
  felEstado?: string;
  felUuid?: string | null;
  createdAt?: string;
  sucursal?: RawFacturaSucursalJson | null;
  venta?: RawFacturaVentaJson | null;
  anuladaPor?: RawFacturaUsuarioRefJson | null;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Normaliza el estado de la factura a la unión de dominio permitida. */
function toEstadoFactura(value: unknown): 'EMITIDA' | 'ANULADA' {
  return value === 'ANULADA' ? 'ANULADA' : 'EMITIDA';
}

/** Normaliza el tipo de servicio con valor por defecto seguro. */
function toTipoServicio(value: unknown, fallback: TipoServicio): TipoServicio {
  if (
    value === 'MOSTRADOR' ||
    value === 'LLEVAR' ||
    value === 'MESA' ||
    value === 'DELIVERY'
  ) {
    return value;
  }
  return fallback;
}

/** Normaliza el método de pago a la unión de dominio permitida. */
function toMetodoPago(value: unknown): MetodoPago {
  return value === 'TARJETA' || value === 'SIN_COBRO' ? value : 'EFECTIVO';
}

// Adaptador de Facturas: traduce JSON de listado, detalle y reimpresión
export const facturasAdapter = {
  fromResumenJson(raw: unknown): FacturaResumenModel {
    const data = asRecord<RawFacturaJson>(raw);
    const venta = asRecord<RawFacturaVentaJson>(data.venta);
    const vendedor = asRecord<RawFacturaUsuarioRefJson>(venta.usuario);
    const mesa = asRecord<RawFacturaMesaRefJson>(venta.mesa);
    const comanda = asRecord<RawFacturaComandaJson>(venta.comanda);
    const anuladaPor = asRecord<RawFacturaUsuarioRefJson>(data.anuladaPor);

    return {
      id: Number(data.id),
      numeroCompleto: String(data.numeroCompleto ?? ''),
      clienteNit: String(data.clienteNit ?? 'CF'),
      clienteNombre: String(data.clienteNombre ?? 'Consumidor Final'),
      subtotalSinIva: Number(data.subtotalSinIva ?? 0),
      ivaMonto: Number(data.ivaMonto ?? 0),
      total: Number(data.total ?? 0),
      estado: toEstadoFactura(data.estado),
      motivoAnulacion: data.motivoAnulacion ?? null,
      reimpresionesCount: Number(data.reimpresionesCount ?? 0),
      createdAt: String(data.createdAt ?? ''),
      tipoServicio: toTipoServicio(venta.tipoServicio, 'MESA'),
      metodoPago: toMetodoPago(venta.metodoPago),
      vendedorNombre: String(vendedor.nombreCompleto ?? '—'),
      mesaNumero: mesa.numero ?? null,
      numeroComanda: comanda.numeroComanda ?? null,
      anuladaPorNombre: anuladaPor.nombreCompleto ?? null,
    };
  },

  fromDetalleJson(raw: unknown): FacturaDetalleModel {
    const data = asRecord<RawFacturaJson>(raw);
    const sucursal = asRecord<RawFacturaSucursalJson>(data.sucursal);
    const venta = asRecord<RawFacturaVentaJson>(data.venta);
    const cajero = asRecord<RawFacturaUsuarioRefJson>(venta.usuario);
    const mesa = asRecord<RawFacturaMesaRefJson>(venta.mesa);
    const anuladaPor = asRecord<RawFacturaUsuarioRefJson>(data.anuladaPor);
    const tieneComanda =
      venta.comanda !== null && venta.comanda !== undefined && typeof venta.comanda === 'object';
    const comanda = tieneComanda ? asRecord<RawFacturaComandaJson>(venta.comanda) : undefined;

    return {
      sucursal: {
        nombre: String(sucursal.nombre ?? ''),
        nit: String(sucursal.nit ?? ''),
        direccion: String(sucursal.direccion ?? ''),
        telefono: sucursal.telefono ?? null,
      },
      factura: {
        id: Number(data.id),
        numeroCompleto: String(data.numeroCompleto ?? ''),
        serie: String(data.serie ?? 'A'),
        clienteNit: String(data.clienteNit ?? 'CF'),
        clienteNombre: String(data.clienteNombre ?? 'Consumidor Final'),
        clienteDireccion: String(data.clienteDireccion ?? 'Ciudad'),
        subtotalSinIva: Number(data.subtotalSinIva ?? 0),
        ivaMonto: Number(data.ivaMonto ?? 0),
        costoEnvio: Number(data.costoEnvio ?? venta.costoEnvio ?? 0),
        zonaEntregaNombre: data.zonaEntregaNombre ?? comanda?.zonaEntregaNombre ?? null,
        total: Number(data.total ?? 0),
        estado: toEstadoFactura(data.estado),
        reimpresionesCount: Number(data.reimpresionesCount ?? 0),
        felEstado: String(data.felEstado ?? 'NO_APLICA'),
        felUuid: data.felUuid ?? null,
        createdAt: String(data.createdAt ?? ''),
      },
      comanda: comanda
        ? {
            numeroComanda: String(comanda.numeroComanda ?? ''),
            tipoServicio: toTipoServicio(comanda.tipoServicio ?? venta.tipoServicio, 'MOSTRADOR'),
            mesaNumero: comanda.mesaNumero ?? mesa.numero ?? null,
            nombreTurno: comanda.nombreTurno ?? null,
            costoEnvio: Number(comanda.costoEnvio ?? venta.costoEnvio ?? 0),
            direccionEntrega: comanda.direccionEntrega ?? null,
            referenciaEntrega: comanda.referenciaEntrega ?? null,
            zonaEntregaNombre: comanda.zonaEntregaNombre ?? data.zonaEntregaNombre ?? null,
            createdAt: String(comanda.createdAt ?? data.createdAt ?? ''),
          }
        : undefined,
      venta: {
        id: Number(venta.id ?? data.ventaId ?? 0),
        tipoServicio: toTipoServicio(venta.tipoServicio, 'MESA'),
        metodoPago: toMetodoPago(venta.metodoPago),
        costoEnvio: Number(venta.costoEnvio ?? data.costoEnvio ?? 0),
        montoRecibido: Number(venta.montoRecibido ?? data.total ?? 0),
        cambio: Number(venta.cambio ?? 0),
        cajeroNombre: String(cajero.nombreCompleto ?? '—'),
        detalles: asArray<unknown>(venta.detalles).map((item) => {
          const d = asRecord<RawFacturaVentaDetalleJson>(item);
          return {
            id: Number(d.id),
            nombrePlatillo: String(d.nombrePlatillo ?? ''),
            cantidad: Number(d.cantidad ?? 0),
            precioUnitario: Number(d.precioUnitario ?? 0),
            subtotal: Number(d.subtotal ?? 0),
            cantidadCortesia: Number(d.cantidadCortesia ?? 0),
            consumoPendiente: Boolean(d.consumoPendiente),
            costoPendiente: Boolean(d.costoPendiente),
            notas: d.notas ?? null,
          };
        }),
      },
      motivoAnulacion: data.motivoAnulacion ?? null,
      anuladaEn: data.anuladaEn ?? null,
      anuladaPorNombre: anuladaPor.nombreCompleto ?? null,
    };
  },
};
