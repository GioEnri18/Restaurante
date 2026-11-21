import { inventarioAdapter } from '../adapters/inventario.adapter';
import { env } from '../config/env';
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
  async listarIngredientes(search?: string): Promise<IngredienteModel[]> {
    const qs = buildQueryString({ search });
    const res = await httpClient.get<unknown[]>(`/inventario/ingredientes${qs}`);
    return (res.data ?? []).map((i) => inventarioAdapter.fromIngredienteJson(i));
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

  async listarProveedores(): Promise<ProveedorModel[]> {
    const res = await httpClient.get<unknown[]>('/inventario/proveedores');
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

  async listarCompras(page = 1): Promise<{ items: CompraModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ page, limit: env.FACTURAS_PAGE_SIZE });
    const res = await httpClient.get<unknown[]>(`/inventario/compras${qs}`);
    return {
      items: (res.data ?? []).map((c) => inventarioAdapter.fromCompraJson(c)),
      meta: res.meta ?? { page: 1, limit: env.FACTURAS_PAGE_SIZE, total: 0, totalPages: 1 },
    };
  },

  async registrarCompra(payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    items: Array<{ ingredienteId: number; cantidadLb: number; precioPorLb: number }>;
  }): Promise<CompraModel> {
    const res = await httpClient.post<unknown>('/inventario/compras', payload);
    return inventarioAdapter.fromCompraJson(res.data);
  },

  async listarMovimientos(params: {
    page?: number;
    ingredienteId?: string;
    tipo?: string;
  }): Promise<{ items: InventarioMovimientoModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params, limit: env.DEFAULT_PAGE_SIZE });
    const res = await httpClient.get<unknown[]>(`/inventario/movimientos${qs}`);
    return {
      items: (res.data ?? []).map((m) => inventarioAdapter.fromMovimientoJson(m)),
      meta: res.meta ?? { page: 1, limit: env.DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 },
    };
  },
};
