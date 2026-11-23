import { facturasAdapter } from '../adapters/facturas.adapter';
import { FacturaDetalleModel, FacturaResumenModel, PaginationMeta } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface FacturasQuery {
  page?: number;
  numero?: string;
  cliente?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  montoMin?: string;
  montoMax?: string;
  estado?: string;
}

export const facturasService = {
  async listar(
    query: FacturasQuery,
    signal?: AbortSignal,
  ): Promise<{ items: FacturaResumenModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({
      ...query,
      limit: 15,
    });
    const res = await httpClient.get<unknown[]>(`/facturas${qs}`, { signal });
    return {
      items: (res.data ?? []).map((item) => facturasAdapter.fromResumenJson(item)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },

  async obtenerDetalle(id: number): Promise<FacturaDetalleModel> {
    const res = await httpClient.get<unknown>(`/facturas/${id}`);
    return facturasAdapter.fromDetalleJson(res.data);
  },

  async reimprimir(id: number): Promise<FacturaDetalleModel> {
    const res = await httpClient.post<unknown>(`/facturas/${id}/reimprimir`);
    return facturasAdapter.fromDetalleJson(res.data);
  },

  async anular(id: number, motivo: string, reintegrarInventario: boolean) {
    const res = await httpClient.post<unknown>(`/facturas/${id}/anular`, {
      motivo,
      reintegrarInventario,
    });
    return res.data;
  },
};
