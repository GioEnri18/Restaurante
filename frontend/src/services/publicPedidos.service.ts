import { env } from '../config/env';
import { EstadoPedidoDomicilio, TipoEntregaPedido } from '../models';
import { buildQueryString } from './httpClient';

export interface SucursalPublicaModel {
  id?: number;
  codigo: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
}

export interface CategoriaPublicaModel {
  id: number;
  nombre: string;
  orden: number;
}

export interface PlatilloPublicoModel {
  id: number;
  categoriaId: number;
  categoriaNombre: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precioVenta: number;
  esEspecialHoy: boolean;
}

export interface ZonaPublicaModel {
  id: number;
  nombre: string;
  descripcion: string | null;
  costoEnvio: number;
  tiempoEstimadoMin: number;
  pedidoMinimo: number;
}

export interface MenuPublicoModel {
  sucursal: SucursalPublicaModel;
  menuEspecialActivo: { nombre: string; descripcion: string | null } | null;
  categorias: CategoriaPublicaModel[];
  platillos: PlatilloPublicoModel[];
  zonas: ZonaPublicaModel[];
}

export interface CrearPedidoPublicoPayload {
  idempotencyKey: string;
  codigoSucursal?: string;
  tipoEntrega: TipoEntregaPedido;
  zonaEntregaId?: number | null;
  direccion?: string | null;
  referencia?: string | null;
  metodoPagoEsperado: 'EFECTIVO' | 'TARJETA';
  montoConQuePaga?: number | null;
  observaciones?: string | null;
  empresaWeb?: string | null;
  formIniciadoEn?: number | null;
  captchaToken?: string | null;
  cliente: {
    nombre: string;
    telefono: string;
    nit?: string | null;
  };
  items: Array<{
    platilloId: number;
    cantidad: number;
    notas?: string | null;
  }>;
}

export interface PedidoPublicoSeguimientoModel {
  trackingToken: string;
  trackingExpiraEn: string | null;
  trackingTtlHoras: number;
  numeroPedido: string;
  tipoEntrega: TipoEntregaPedido;
  origen: 'WEB' | 'POS';
  estado: EstadoPedidoDomicilio;
  modalidadPago: 'CONTRA_ENTREGA' | 'PREPAGADO';
  metodoPagoEsperado: string;
  clientePrimerNombre: string;
  zonaNombre: string;
  tiempoEstimadoMin: number;
  subtotalPlatillos: number;
  costoEnvio: number;
  total: number;
  observaciones: string | null;
  motivoCierre: string | null;
  createdAt: string;
  updatedAt: string;
  entregadoEn: string | null;
  sucursal: SucursalPublicaModel | null;
  detalles: Array<{
    id: number;
    nombrePlatillo: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    notas: string | null;
  }>;
  historial: Array<{
    estado: EstadoPedidoDomicilio;
    createdAt: string;
  }>;
}

async function publicRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensaje =
      payload?.error?.message ||
      payload?.message ||
      `No se pudo completar la operación (HTTP ${res.status})`;
    throw new Error(mensaje);
  }
  return payload.data as T;
}

export const publicPedidosService = {
  obtenerMenu(
    params: { sucursal?: string; search?: string; categoriaId?: number } = {},
    signal?: AbortSignal,
  ): Promise<MenuPublicoModel> {
    const qs = buildQueryString({
      sucursal: params.sucursal || undefined,
      search: params.search || undefined,
      categoriaId: params.categoriaId || undefined,
    });
    return publicRequest<MenuPublicoModel>(`/public/menu${qs}`, { signal });
  },

  crearPedido(payload: CrearPedidoPublicoPayload): Promise<PedidoPublicoSeguimientoModel> {
    return publicRequest<PedidoPublicoSeguimientoModel>('/public/pedidos', {
      method: 'POST',
      body: payload,
    });
  },

  consultarSeguimiento(
    token: string,
    signal?: AbortSignal,
  ): Promise<PedidoPublicoSeguimientoModel> {
    return publicRequest<PedidoPublicoSeguimientoModel>(
      `/public/pedidos/${encodeURIComponent(token)}`,
      { signal },
    );
  },
};
