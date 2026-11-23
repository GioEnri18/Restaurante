import { inventarioAdapter } from '../adapters/inventario.adapter';
import {
  CompraModel,
  IngredienteModel,
  InventarioMovimientoModel,
  PaginationMeta,
  ProveedorModel,
  UnidadMedida,
} from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const inventarioService = {
  async listarIngredientes(search?: string, signal?: AbortSignal): Promise<IngredienteModel[]> {
    const qs = buildQueryString({ search });
    const res = await httpClient.get<unknown[]>(`/inventario/ingredientes${qs}`, { signal });
    return (res.data ?? []).map((i) => inventarioAdapter.fromIngredienteJson(i));
  },

  async listarExistencias(
    page: number,
    search: string,
    porReponer: boolean,
    signal?: AbortSignal,
  ): Promise<{
    items: IngredienteModel[];
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({ page, search: search.trim() || undefined, porReponer: String(porReponer) });
    const res = await httpClient.get<unknown[]>(`/inventario/ingredientes${qs}`, { signal });
    return {
      items: (res.data ?? []).map(inventarioAdapter.fromIngredienteJson),
      meta: res.meta ?? { page: 1, limit: 15, total: res.data?.length ?? 0, totalPages: 1 },
    };
  },

  async listarAlertas(signal?: AbortSignal): Promise<IngredienteModel[]> {
    const res = await httpClient.get<unknown[]>('/inventario/alertas', { signal });
    return (res.data ?? []).map(inventarioAdapter.fromIngredienteJson);
  },

  async crearIngrediente(payload: {
    codigo: string;
    nombre: string;
    proveedorId?: number | null;
    stockMinimo: number;
    unidadStockMinimo: UnidadMedida;
    stockInicial?: number;
    unidadStockInicial?: UnidadMedida;
    precioPorLb?: number;
  }): Promise<IngredienteModel> {
    const res = await httpClient.post<unknown>('/inventario/ingredientes', payload);
    return inventarioAdapter.fromIngredienteJson(res.data);
  },

  async ajustarStock(
    ingredienteId: number,
    payload: {
      tipoAjuste: 'ENTRADA' | 'SALIDA';
      cantidad: number;
      unidad: UnidadMedida;
      motivo: string;
    },
  ) {
    return httpClient.post(`/inventario/ingredientes/${ingredienteId}/ajustar`, payload);
  },

  async listarProveedores(signal?: AbortSignal): Promise<ProveedorModel[]> {
    const res = await httpClient.get<unknown[]>('/inventario/proveedores', { signal });
    return (res.data ?? []).map((p) => inventarioAdapter.fromProveedorJson(p));
  },

  async crearProveedor(payload: {
    nombre: string;
    nit?: string;
    telefono?: string;
    email?: string;
    contacto?: string;
  }): Promise<ProveedorModel> {
    const res = await httpClient.post<unknown>('/inventario/proveedores', payload);
    return inventarioAdapter.fromProveedorJson(res.data);
  },

  async listarCompras(page = 1, signal?: AbortSignal): Promise<{ items: CompraModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ page, limit: 15 });
    const res = await httpClient.get<unknown[]>(`/inventario/compras${qs}`, { signal });
    return {
      items: (res.data ?? []).map((c) => inventarioAdapter.fromCompraJson(c)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },

  async registrarCompra(payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    items: Array<{ ingredienteId: number; cantidad: number; unidad: UnidadMedida; precioUnitario: number }>;
  }): Promise<CompraModel> {
    const res = await httpClient.post<unknown>('/inventario/compras', payload);
    return inventarioAdapter.fromCompraJson(res.data);
  },

  async listarMovimientos(
    params: {
      page?: number;
      ingredienteId?: string;
      tipo?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ items: InventarioMovimientoModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params, limit: 15 });
    const res = await httpClient.get<unknown[]>(`/inventario/movimientos${qs}`, { signal });
    return {
      items: (res.data ?? []).map((m) => inventarioAdapter.fromMovimientoJson(m)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },
};
