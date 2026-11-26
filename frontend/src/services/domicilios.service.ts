import { domiciliosAdapter } from '../adapters/domicilios.adapter';
import { ventasAdapter } from '../adapters/ventas.adapter';
import {
  AdvertenciaStockModel,
  ClienteDomicilioModel,
  DomiciliosResumenModel,
  EstadoPedidoDomicilio,
  MetodoPago,
  ModalidadPagoDomicilio,
  PaginationMeta,
  PedidoDomicilioModel,
  TicketImprimibleModel,
  ZonaEntregaModel,
} from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface CrearZonaPayload {
  nombre: string;
  descripcion?: string | null;
  costoEnvio: number;
  tiempoEstimadoMin: number;
  pedidoMinimo: number;
  activa?: boolean;
}

export interface CrearPedidoDomicilioPayload {
  idempotencyKey: string;
  zonaEntregaId: number;
  modalidadPago: ModalidadPagoDomicilio;
  metodoPago: MetodoPago;
  montoRecibido?: number;
  montoConQuePaga?: number | null;
  referenciaPago?: string | null;
  clienteId?: number;
  cliente?: {
    nombre: string;
    telefono: string;
    nit?: string | null;
    notas?: string | null;
  };
  direccionEntregaId?: number;
  direccionNueva?: {
    alias?: string;
    direccion: string;
    referencia?: string | null;
    zonaEntregaId?: number | null;
    esPrincipal?: boolean;
  };
  observaciones?: string | null;
  cortesiaMotivo?: string | null;
  autorizacionCortesia?: { identifier: string; password: string };
  items: Array<{
    platilloId: number;
    cantidad: number;
    cantidadCortesia?: number;
    notas?: string | null;
  }>;
}

export interface LiquidarPedidoPayload {
  idempotencyKey: string;
  metodoPago: 'EFECTIVO' | 'TARJETA';
  montoRecibidoRepartidor?: number;
  referenciaPago?: string | null;
  observaciones?: string | null;
}

interface ListadoPedidosApiResponse {
  ok: boolean;
  data: unknown[];
  resumen?: unknown;
  serverTime?: string;
  meta?: PaginationMeta;
}

/** Construye un TicketImprimibleModel listo para PrintTicketsModal con la sección de entrega */
export function construirTicketEntregaDesdePedido(
  pedido: PedidoDomicilioModel,
  sucursal: { nombre: string; nit: string; direccion: string; telefono: string | null },
  ticketVenta?: TicketImprimibleModel,
): TicketImprimibleModel {
  const entrega = {
    numeroPedido: pedido.numeroPedido,
    modalidadPago: pedido.modalidadPago,
    metodoPagoEsperado: pedido.metodoPagoEsperado,
    clienteNombre: pedido.clienteNombre,
    clienteTelefono: pedido.clienteTelefono,
    direccion: pedido.direccion ?? 'Dirección protegida',
    referencia: pedido.referencia,
    zonaNombre: pedido.zonaNombre,
    costoEnvio: pedido.costoEnvio,
    subtotalPlatillos: pedido.subtotalPlatillos,
    total: pedido.total,
    montoConQuePaga: pedido.montoConQuePaga,
    observaciones: pedido.observaciones,
  };

  if (ticketVenta) {
    return { ...ticketVenta, entrega };
  }

  return {
    sucursal,
    factura: {
      id: pedido.venta?.factura?.id ?? 0,
      numeroCompleto: pedido.venta?.factura?.numeroCompleto ?? pedido.numeroPedido,
      serie: 'DOM',
      clienteNit: pedido.clienteNit,
      clienteNombre: pedido.clienteNombre,
      clienteDireccion: pedido.direccion ?? 'Ciudad',
      subtotalSinIva: Math.round((pedido.total / 1.12) * 100) / 100,
      ivaMonto: Math.round((pedido.total - pedido.total / 1.12) * 100) / 100,
      costoEnvio: pedido.costoEnvio,
      zonaEntregaNombre: pedido.zonaNombre,
      total: pedido.total,
      estado: 'EMITIDA',
      reimpresionesCount: 0,
      felEstado: 'NO_APLICA',
      felUuid: null,
      createdAt: pedido.createdAt,
    },
    comanda: pedido.comanda
      ? {
          numeroComanda: pedido.comanda.numeroComanda,
          tipoServicio: 'DELIVERY',
          mesaNumero: null,
          nombreTurno: `${pedido.numeroPedido} · ${pedido.clienteNombre}`,
          costoEnvio: pedido.costoEnvio,
          direccionEntrega: pedido.direccion,
          referenciaEntrega: pedido.referencia,
          zonaEntregaNombre: pedido.zonaNombre,
          createdAt: pedido.comanda.createdAt,
        }
      : undefined,
    entrega,
    venta: {
      id: pedido.ventaId ?? 0,
      tipoServicio: 'DELIVERY',
      metodoPago: pedido.metodoPagoEsperado,
      costoEnvio: pedido.costoEnvio,
      montoRecibido: pedido.montoConQuePaga ?? pedido.total,
      cambio: 0,
      cajeroNombre: pedido.creadoPor?.nombreCompleto ?? 'POS',
      detalles: pedido.detalles.map((d) => ({
        id: d.id,
        nombrePlatillo: d.nombrePlatillo,
        cantidad: d.cantidad,
        precioUnitario: d.precioUnitario,
        subtotal: d.subtotal,
        cantidadCortesia: d.cantidadCortesia,
        notas: d.notas,
      })),
    },
  };
}

export const domiciliosService = {
  async listarZonas(soloActivas = false, signal?: AbortSignal): Promise<ZonaEntregaModel[]> {
    const qs = buildQueryString({ soloActivas: soloActivas ? 'true' : undefined });
    const res = await httpClient.get<unknown[]>(`/domicilios/zonas${qs}`, { signal });
    return (res.data ?? []).map((z) => domiciliosAdapter.fromZonaJson(z));
  },

  async crearZona(payload: CrearZonaPayload): Promise<ZonaEntregaModel> {
    const res = await httpClient.post<unknown>('/domicilios/zonas', payload);
    return domiciliosAdapter.fromZonaJson(res.data);
  },

  async actualizarZona(id: number, payload: Partial<CrearZonaPayload>): Promise<ZonaEntregaModel> {
    const res = await httpClient.put<unknown>(`/domicilios/zonas/${id}`, payload);
    return domiciliosAdapter.fromZonaJson(res.data);
  },

  async buscarClientesPorTelefono(telefono: string, signal?: AbortSignal): Promise<ClienteDomicilioModel[]> {
    const qs = buildQueryString({ telefono });
    const res = await httpClient.get<unknown[]>(`/domicilios/clientes/buscar${qs}`, { signal });
    return (res.data ?? []).map((c) => domiciliosAdapter.fromClienteJson(c));
  },

  async listarClientes(
    filtros: { page?: number; limit?: number; search?: string; soloBloqueados?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<{ items: ClienteDomicilioModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({
      page: filtros.page,
      limit: filtros.limit,
      search: filtros.search || undefined,
      soloBloqueados: filtros.soloBloqueados ? 'true' : undefined,
    });
    const res = (await httpClient.get<unknown[]>(`/domicilios/clientes${qs}`, {
      signal,
    })) as unknown as { data?: unknown[]; meta?: PaginationMeta };
    return {
      items: (res.data ?? []).map((c) => domiciliosAdapter.fromClienteJson(c)),
      meta: res.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  },

  async actualizarBloqueoWebCliente(
    clienteId: number,
    payload: { bloqueado: boolean; motivo: string },
  ): Promise<ClienteDomicilioModel> {
    const res = await httpClient.patch<unknown>(
      `/domicilios/clientes/${clienteId}/bloqueo-web`,
      payload,
    );
    return domiciliosAdapter.fromClienteJson(res.data);
  },

  async listarPedidos(
    filtros: {
      page?: number;
      limit?: number;
      estado?: EstadoPedidoDomicilio | '';
      modalidadPago?: ModalidadPagoDomicilio | '';
      tipoEntrega?: 'DELIVERY' | 'LLEVAR' | '';
      origen?: 'POS' | 'WEB' | '';
      zonaEntregaId?: number | '';
      repartidorId?: number | '';
      soloActivos?: boolean;
      pendientesLiquidar?: boolean;
      fechaDesde?: string;
      fechaHasta?: string;
      desde?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<{
    items: PedidoDomicilioModel[];
    resumen: DomiciliosResumenModel;
    serverTime: string;
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({
      page: filtros.page,
      limit: filtros.limit,
      estado: filtros.estado || undefined,
      modalidadPago: filtros.modalidadPago || undefined,
      tipoEntrega: filtros.tipoEntrega || undefined,
      origen: filtros.origen || undefined,
      zonaEntregaId: filtros.zonaEntregaId || undefined,
      repartidorId: filtros.repartidorId || undefined,
      soloActivos: filtros.soloActivos !== undefined ? String(filtros.soloActivos) : undefined,
      pendientesLiquidar: filtros.pendientesLiquidar ? 'true' : undefined,
      fechaDesde: filtros.fechaDesde || undefined,
      fechaHasta: filtros.fechaHasta || undefined,
      desde: filtros.desde || undefined,
    });
    const res = (await httpClient.get<unknown[]>(`/domicilios/pedidos${qs}`, {
      signal,
    })) as unknown as ListadoPedidosApiResponse;

    return {
      items: (res.data ?? []).map((p) => domiciliosAdapter.fromPedidoJson(p)),
      resumen: domiciliosAdapter.fromResumenJson(res.resumen),
      serverTime: String(res.serverTime ?? new Date().toISOString()),
      meta: res.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  },

  async obtenerPedido(id: number, signal?: AbortSignal): Promise<PedidoDomicilioModel> {
    const res = await httpClient.get<unknown>(`/domicilios/pedidos/${id}`, { signal });
    return domiciliosAdapter.fromPedidoJson(res.data);
  },

  async crearPedido(payload: CrearPedidoDomicilioPayload): Promise<{
    pedido: PedidoDomicilioModel;
    advertenciasStock: AdvertenciaStockModel[];
    ticket?: TicketImprimibleModel;
  }> {
    const res = await httpClient.post<Record<string, unknown>>('/domicilios/pedidos', payload);
    const data = res.data ?? {};
    const pedido = domiciliosAdapter.fromPedidoJson(data.pedido);
    const advertenciasStock = Array.isArray(data.advertenciasStock)
      ? (data.advertenciasStock as AdvertenciaStockModel[])
      : [];
    const ticket = data.ticket ? ventasAdapter.fromConfirmarVentaJson(data.ticket) : undefined;
    return { pedido, advertenciasStock, ticket };
  },

  async actualizarEstado(
    pedidoId: number,
    payload: {
      estadoNuevo: EstadoPedidoDomicilio;
      repartidorId?: number;
      motivo?: string;
      autorizacionSupervisor?: { identifier: string; password: string };
    },
  ): Promise<PedidoDomicilioModel> {
    const res = await httpClient.patch<unknown>(`/domicilios/pedidos/${pedidoId}/estado`, payload);
    return domiciliosAdapter.fromPedidoJson(res.data);
  },

  async liquidarPedido(
    pedidoId: number,
    payload: LiquidarPedidoPayload,
  ): Promise<{
    pedido: PedidoDomicilioModel;
    diferenciaLiquidacion: number;
    ticket?: TicketImprimibleModel;
  }> {
    const res = await httpClient.post<Record<string, unknown>>(
      `/domicilios/pedidos/${pedidoId}/liquidar`,
      payload,
    );
    const data = res.data ?? {};
    return {
      pedido: domiciliosAdapter.fromPedidoJson(data.pedido),
      diferenciaLiquidacion: Number(data.diferenciaLiquidacion ?? 0),
      ticket: data.ticket ? ventasAdapter.fromConfirmarVentaJson(data.ticket) : undefined,
    };
  },
};
