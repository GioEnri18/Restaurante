import {
  AlertaMenuEspecialModel,
  EstadoMenuEspecial,
  MenuDataModel,
  MenuEspecialModel,
  MesaModel,
  MetodoPago,
  TicketImprimibleModel,
  TipoServicio,
} from '../models';

/** Platillo asignado a un menú especial en JSON. */
interface RawMenuEspecialPlatilloJson {
  platilloId?: number | string;
  sku?: string;
  nombre?: string;
  categoriaNombre?: string;
  precioRegular?: number | string;
  precioEspecial?: number | string | null;
}

/** Respuesta JSON cruda de un menú especial desde /api/v1/ventas/menus-especiales. */
interface RawMenuEspecialJson {
  id?: number | string;
  nombre?: string;
  descripcion?: string | null;
  fechaInicio?: string;
  fechaFin?: string;
  fechaInicioLocal?: string;
  fechaFinLocal?: string;
  diasAvisoPrevio?: number | string;
  activo?: boolean;
  esMenuPrincipal?: boolean;
  creadoPor?: string;
  estado?: string;
  diasRestantes?: number | string;
  requiereAtencion?: boolean;
  mensajeAviso?: string | null;
  platillos?: unknown[];
}

/** Respuesta JSON cruda de una alerta de menú especial. */
interface RawAlertaMenuEspecialJson {
  id?: number | string;
  nombre?: string;
  fechaInicio?: string;
  fechaFin?: string;
  estado?: string;
  diasRestantes?: number | string;
  platillosCount?: number | string;
  platillos?: unknown[];
  requiereAtencion?: boolean;
  mensaje?: string | null;
  mensajeAviso?: string | null;
}

/** Categoría de platillos en la respuesta JSON del menú POS. */
interface RawCategoriaJson {
  id?: number | string;
  nombre?: string;
  descripcion?: string | null;
  orden?: number | string;
}

/** Ingrediente de la receta de un platillo en JSON. */
interface RawRecetaItemJson {
  ingredienteId?: number | string;
  ingredienteNombre?: string;
  cantidadOz?: number | string;
  stockActualOz?: number | string;
}

/** Platillo disponible en la respuesta JSON del menú POS. */
interface RawPlatilloJson {
  id?: number | string;
  categoriaId?: number | string;
  categoriaNombre?: string;
  sku?: string;
  nombre?: string;
  descripcion?: string | null;
  imagenUrl?: string | null;
  precioVenta?: number | string;
  precioRegular?: number | string;
  esEspecialHoy?: boolean;
  costoReceta?: number | string;
  disponible?: boolean;
  stockDisponible?: boolean;
  receta?: unknown[];
}

/** Mesa del restaurante en la respuesta JSON del menú POS. */
interface RawMesaJson {
  id?: number | string;
  numero?: string;
  capacidad?: number | string;
  estado?: string;
}

/** Resumen del menú especial activo actualmente en el POS. */
interface RawMenuEspecialActivoJson {
  id?: number | string;
  nombre?: string;
  descripcion?: string | null;
  fechaInicio?: string;
  fechaFin?: string;
  esMenuPrincipal?: boolean;
  platillosIds?: unknown[];
}

/** Respuesta JSON cruda de /api/v1/ventas/menu. */
interface RawMenuDataJson {
  cajaAbierta?: boolean;
  cajaSesionId?: number | string | null;
  habilitarMesas?: boolean;
  tipoServicioDefault?: string;
  categorias?: unknown[];
  platillos?: unknown[];
  mesas?: unknown[];
  menuEspecialActivo?: RawMenuEspecialActivoJson | null;
  alertasMenusEspeciales?: unknown[];
}

/** Sucursal embebida en la respuesta de confirmación de venta. */
interface RawTicketSucursalJson {
  nombre?: string;
  nit?: string;
  direccion?: string;
  telefono?: string | null;
}

/** Factura generada embebida en la respuesta de confirmación de venta. */
interface RawTicketFacturaJson {
  id?: number | string;
  numeroCompleto?: string;
  serie?: string;
  clienteNit?: string;
  clienteNombre?: string;
  clienteDireccion?: string;
  subtotalSinIva?: number | string;
  ivaMonto?: number | string;
  total?: number | string;
  estado?: string;
  reimpresionesCount?: number | string;
  felEstado?: string;
  felUuid?: string | null;
  createdAt?: string;
}

/** Comanda generada embebida en la respuesta de confirmación de venta. */
interface RawTicketComandaJson {
  numeroComanda?: string;
  tipoServicio?: string;
  mesaNumero?: string | null;
  nombreTurno?: string | null;
  createdAt?: string;
}

/** Referencia mínima de cajero dentro de la venta confirmada. */
interface RawTicketUsuarioJson {
  nombreCompleto?: string;
}

/** Línea de detalle de platillo dentro de la venta confirmada. */
interface RawTicketVentaDetalleJson {
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

/** Venta confirmada embebida en la respuesta de /api/v1/ventas/confirmar. */
interface RawTicketVentaJson {
  id?: number | string;
  tipoServicio?: string;
  metodoPago?: string;
  montoRecibido?: number | string;
  cambio?: number | string;
  usuario?: RawTicketUsuarioJson | null;
  detalles?: unknown[];
}

/** Respuesta JSON cruda de /api/v1/ventas/confirmar. */
interface RawConfirmarVentaJson {
  sucursal?: RawTicketSucursalJson | null;
  factura?: RawTicketFacturaJson | null;
  comanda?: RawTicketComandaJson | null;
  venta?: RawTicketVentaJson | null;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Normaliza el estado de un menú especial a la unión de dominio permitida. */
function toEstadoMenuEspecial(
  value: unknown,
  fallback: EstadoMenuEspecial,
): EstadoMenuEspecial {
  if (
    value === 'ACTIVO_HOY' ||
    value === 'PROXIMO_AVISO' ||
    value === 'PROGRAMADO' ||
    value === 'FINALIZADO' ||
    value === 'INACTIVO'
  ) {
    return value;
  }
  return fallback;
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

/** Normaliza el estado de una mesa a la unión de dominio permitida. */
function toEstadoMesa(value: unknown): MesaModel['estado'] {
  if (value === 'DISPONIBLE' || value === 'OCUPADA' || value === 'RESERVADA') {
    return value;
  }
  return 'DISPONIBLE';
}

/** Normaliza el método de pago a la unión de dominio permitida. */
function toMetodoPago(value: unknown): MetodoPago {
  return value === 'TARJETA' || value === 'SIN_COBRO' ? value : 'EFECTIVO';
}

/** Normaliza el estado de la factura emitida. */
function toEstadoFactura(value: unknown): 'EMITIDA' | 'ANULADA' {
  return value === 'ANULADA' ? 'ANULADA' : 'EMITIDA';
}

// Adaptador de Ventas / Menú / Menús Especiales: traduce JSON del backend a modelos limpios
export const ventasAdapter = {
  fromMenuEspecialJson(raw: unknown): MenuEspecialModel {
    const data = asRecord<RawMenuEspecialJson>(raw);

    return {
      id: Number(data.id),
      nombre: String(data.nombre ?? ''),
      descripcion: data.descripcion ?? null,
      fechaInicio: String(data.fechaInicio ?? ''),
      fechaFin: String(data.fechaFin ?? ''),
      fechaInicioLocal: data.fechaInicioLocal,
      fechaFinLocal: data.fechaFinLocal,
      diasAvisoPrevio: Number(data.diasAvisoPrevio ?? 5),
      activo: Boolean(data.activo),
      esMenuPrincipal: Boolean(data.esMenuPrincipal),
      creadoPor: String(data.creadoPor ?? 'Sistema'),
      estado: toEstadoMenuEspecial(data.estado, 'PROGRAMADO'),
      diasRestantes: Number(data.diasRestantes ?? 0),
      requiereAtencion: Boolean(data.requiereAtencion),
      mensajeAviso: data.mensajeAviso ?? null,
      platillos: asArray<unknown>(data.platillos).map((item) => {
        const p = asRecord<RawMenuEspecialPlatilloJson>(item);
        return {
          platilloId: Number(p.platilloId),
          sku: String(p.sku ?? ''),
          nombre: String(p.nombre ?? ''),
          categoriaNombre: String(p.categoriaNombre ?? ''),
          precioRegular: Number(p.precioRegular ?? 0),
          precioEspecial:
            p.precioEspecial !== null && p.precioEspecial !== undefined
              ? Number(p.precioEspecial)
              : null,
        };
      }),
    };
  },

  fromAlertaMenuEspecialJson(raw: unknown): AlertaMenuEspecialModel {
    const data = asRecord<RawAlertaMenuEspecialJson>(raw);

    return {
      id: Number(data.id),
      nombre: String(data.nombre ?? ''),
      fechaInicio: String(data.fechaInicio ?? ''),
      fechaFin: String(data.fechaFin ?? ''),
      estado: toEstadoMenuEspecial(data.estado, 'PROXIMO_AVISO'),
      diasRestantes: Number(data.diasRestantes ?? 0),
      platillosCount: Number(data.platillosCount ?? asArray<unknown>(data.platillos).length),
      requiereAtencion: Boolean(data.requiereAtencion),
      mensaje: data.mensaje ?? data.mensajeAviso ?? null,
    };
  },

  fromMenuJson(raw: unknown): MenuDataModel {
    const data = asRecord<RawMenuDataJson>(raw);
    const tieneMenuEspecialActivo =
      data.menuEspecialActivo !== null &&
      data.menuEspecialActivo !== undefined &&
      typeof data.menuEspecialActivo === 'object';
    const menuEspecialActivo = tieneMenuEspecialActivo
      ? asRecord<RawMenuEspecialActivoJson>(data.menuEspecialActivo)
      : null;

    return {
      cajaAbierta: Boolean(data.cajaAbierta),
      cajaSesionId: data.cajaSesionId ? Number(data.cajaSesionId) : null,
      habilitarMesas: Boolean(data.habilitarMesas),
      tipoServicioDefault: toTipoServicio(data.tipoServicioDefault, 'MOSTRADOR'),
      categorias: asArray<unknown>(data.categorias).map((item) => {
        const c = asRecord<RawCategoriaJson>(item);
        return {
          id: Number(c.id),
          nombre: String(c.nombre ?? ''),
          descripcion: c.descripcion ?? null,
          orden: Number(c.orden ?? 0),
        };
      }),
      platillos: asArray<unknown>(data.platillos).map((item) => {
        const p = asRecord<RawPlatilloJson>(item);
        return {
          id: Number(p.id),
          categoriaId: Number(p.categoriaId),
          categoriaNombre: String(p.categoriaNombre ?? ''),
          sku: String(p.sku ?? ''),
          nombre: String(p.nombre ?? ''),
          descripcion: p.descripcion ?? null,
          imagenUrl: p.imagenUrl ?? null,
          precioVenta: Number(p.precioVenta ?? 0),
          precioRegular: Number(p.precioRegular ?? p.precioVenta ?? 0),
          esEspecialHoy: Boolean(p.esEspecialHoy),
          costoReceta: Number(p.costoReceta ?? 0),
          disponible: Boolean(p.disponible),
          stockDisponible: Boolean(p.stockDisponible),
          receta: asArray<unknown>(p.receta).map((recetaItem) => {
            const r = asRecord<RawRecetaItemJson>(recetaItem);
            return {
              ingredienteId: Number(r.ingredienteId),
              ingredienteNombre: String(r.ingredienteNombre ?? ''),
              cantidadOz: Number(r.cantidadOz ?? 0),
              stockActualOz: Number(r.stockActualOz ?? 0),
            };
          }),
        };
      }),
      mesas: asArray<unknown>(data.mesas).map((item) => {
        const m = asRecord<RawMesaJson>(item);
        return {
          id: Number(m.id),
          numero: String(m.numero ?? ''),
          capacidad: Number(m.capacidad ?? 4),
          estado: toEstadoMesa(m.estado),
        };
      }),
      menuEspecialActivo: menuEspecialActivo
        ? {
            id: Number(menuEspecialActivo.id),
            nombre: String(menuEspecialActivo.nombre ?? ''),
            descripcion: menuEspecialActivo.descripcion ?? null,
            fechaInicio: String(menuEspecialActivo.fechaInicio ?? ''),
            fechaFin: String(menuEspecialActivo.fechaFin ?? ''),
            esMenuPrincipal: Boolean(menuEspecialActivo.esMenuPrincipal),
            platillosIds: asArray<unknown>(menuEspecialActivo.platillosIds).map(Number),
          }
        : null,
      alertasMenusEspeciales: asArray<unknown>(data.alertasMenusEspeciales).map((a) =>
        this.fromAlertaMenuEspecialJson(a),
      ),
    };
  },

  fromConfirmarVentaJson(raw: unknown): TicketImprimibleModel {
    const data = asRecord<RawConfirmarVentaJson>(raw);
    const venta = asRecord<RawTicketVentaJson>(data.venta);
    const cajero = asRecord<RawTicketUsuarioJson>(venta.usuario);
    const factura = asRecord<RawTicketFacturaJson>(data.factura);
    const sucursal = asRecord<RawTicketSucursalJson>(data.sucursal);
    const tieneComanda =
      data.comanda !== null && data.comanda !== undefined && typeof data.comanda === 'object';
    const comanda = tieneComanda ? asRecord<RawTicketComandaJson>(data.comanda) : undefined;

    return {
      sucursal: {
        nombre: String(sucursal.nombre ?? ''),
        nit: String(sucursal.nit ?? ''),
        direccion: String(sucursal.direccion ?? ''),
        telefono: sucursal.telefono ?? null,
      },
      factura: {
        id: Number(factura.id),
        numeroCompleto: String(factura.numeroCompleto ?? ''),
        serie: String(factura.serie ?? 'A'),
        clienteNit: String(factura.clienteNit ?? 'CF'),
        clienteNombre: String(factura.clienteNombre ?? 'Consumidor Final'),
        clienteDireccion: String(factura.clienteDireccion ?? 'Ciudad'),
        subtotalSinIva: Number(factura.subtotalSinIva ?? 0),
        ivaMonto: Number(factura.ivaMonto ?? 0),
        total: Number(factura.total ?? 0),
        estado: toEstadoFactura(factura.estado),
        reimpresionesCount: Number(factura.reimpresionesCount ?? 0),
        felEstado: String(factura.felEstado ?? 'NO_APLICA'),
        felUuid: factura.felUuid ?? null,
        createdAt: String(factura.createdAt ?? new Date().toISOString()),
      },
      comanda: comanda
        ? {
            numeroComanda: String(comanda.numeroComanda ?? ''),
            tipoServicio: toTipoServicio(comanda.tipoServicio, 'MOSTRADOR'),
            mesaNumero: comanda.mesaNumero ?? null,
            nombreTurno: comanda.nombreTurno ?? null,
            createdAt: String(comanda.createdAt ?? new Date().toISOString()),
          }
        : undefined,
      venta: {
        id: Number(venta.id),
        tipoServicio: toTipoServicio(venta.tipoServicio, 'MOSTRADOR'),
        metodoPago: toMetodoPago(venta.metodoPago),
        montoRecibido: Number(venta.montoRecibido ?? 0),
        cambio: Number(venta.cambio ?? 0),
        cajeroNombre: String(cajero.nombreCompleto ?? ''),
        detalles: asArray<unknown>(venta.detalles).map((item) => {
          const d = asRecord<RawTicketVentaDetalleJson>(item);
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
    };
  },
};
