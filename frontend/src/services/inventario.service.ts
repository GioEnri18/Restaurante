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

export interface MermaPorIngredienteItem {
  ingredienteId: number;
  codigo: string;
  nombre: string;
  stockActualOz: number;
  cantidadRegistros: number;
  totalOz: number;
  totalLb: number;
  costoTotal: number;
  porcentajeCosto: number;
  motivoPrincipal: string | null;
  ultimaMerma: string | null;
}

export interface MermaPorIngredienteResumen {
  ingredientesConMerma: number;
  totalRegistros: number;
  totalOzMermadas: number;
  totalLbMermadas: number;
  costoTotalMermas: number;
}

export interface IngredienteEnNegativoItem extends IngredienteModel {
  deficitOz: number;
  deficitLb: number;
}

export interface ResumenEnNegativo {
  cantidadIngredientes: number;
  totalDeficitOz: number;
  totalDeficitLb: number;
}

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
    soloNegativos = false,
  ): Promise<{
    items: IngredienteModel[];
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({
      page,
      search: search.trim() || undefined,
      porReponer: String(porReponer),
      soloNegativos: soloNegativos ? 'true' : undefined,
    });
    const res = await httpClient.get<unknown[]>(`/inventario/ingredientes${qs}`, { signal });
    return {
      items: (res.data ?? []).map(inventarioAdapter.fromIngredienteJson),
      meta: res.meta ?? { page: 1, limit: 15, total: res.data?.length ?? 0, totalPages: 1 },
    };
  },

  async listarEnNegativo(signal?: AbortSignal): Promise<{
    items: IngredienteEnNegativoItem[];
    resumen: ResumenEnNegativo;
  }> {
    const res = (await httpClient.get<unknown[]>('/inventario/en-negativo', {
      signal,
    })) as unknown as {
      data?: unknown[];
      resumen?: Partial<ResumenEnNegativo>;
    };
    const items = (res.data ?? []).map((raw) => {
      const base = inventarioAdapter.fromIngredienteJson(raw);
      const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const deficitOz = Number(r.deficitOz ?? Math.abs(Math.min(0, base.stockActualOz)));
      const deficitLb = Number(r.deficitLb ?? Math.abs(Math.min(0, base.stockActualLb)));
      return { ...base, deficitOz, deficitLb };
    });
    return {
      items,
      resumen: {
        cantidadIngredientes: Number(res.resumen?.cantidadIngredientes ?? items.length),
        totalDeficitOz: Number(res.resumen?.totalDeficitOz ?? 0),
        totalDeficitLb: Number(res.resumen?.totalDeficitLb ?? 0),
      },
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

  async listarMermasPorIngrediente(
    params: {
      page?: number;
      limit?: number;
      search?: string;
      motivo?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      ordenar?: 'costo' | 'cantidad' | 'registros';
    },
    signal?: AbortSignal,
  ): Promise<{
    items: MermaPorIngredienteItem[];
    resumen: MermaPorIngredienteResumen;
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({
      page: params.page ?? 1,
      limit: params.limit ?? 10,
      search: params.search?.trim() || undefined,
      motivo: params.motivo || undefined,
      fechaDesde: params.fechaDesde || undefined,
      fechaHasta: params.fechaHasta || undefined,
      ordenar: params.ordenar || 'costo',
    });
    const res = (await httpClient.get<MermaPorIngredienteItem[]>(
      `/inventario/mermas-por-ingrediente${qs}`,
      { signal },
    )) as unknown as {
      data?: MermaPorIngredienteItem[];
      resumen?: MermaPorIngredienteResumen;
      meta?: PaginationMeta;
    };
    return {
      items: res.data ?? [],
      resumen: res.resumen ?? {
        ingredientesConMerma: 0,
        totalRegistros: 0,
        totalOzMermadas: 0,
        totalLbMermadas: 0,
        costoTotalMermas: 0,
      },
      meta: res.meta ?? { page: 1, limit: 10, total: 0, totalPages: 1 },
    };
  },
};
