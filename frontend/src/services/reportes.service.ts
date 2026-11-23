import { reportesAdapter } from '../adapters/reportes.adapter';
import { PaginationMeta, ReporteResumenModel, SerieVentasDiaModel, TopProductoModel } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const reportesService = {
  async obtenerResumen(fechaDesde?: string, fechaHasta?: string, signal?: AbortSignal): Promise<ReporteResumenModel> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    const res = await httpClient.get<unknown>(`/reportes/resumen${qs}`, { signal });
    return reportesAdapter.fromResumenJson(res.data);
  },

  async obtenerVentasPeriodo(
    fechaDesde: string,
    fechaHasta: string,
    page = 1,
    signal?: AbortSignal,
  ): Promise<{
    items: SerieVentasDiaModel[];
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({ fechaDesde, fechaHasta, page });
    const res = await httpClient.get<unknown[]>(`/reportes/ventas-periodo${qs}`, { signal });
    return {
      items: reportesAdapter.fromSerieJson(res.data ?? []),
      meta: res.meta ?? { page: 1, limit: 15, total: res.data?.length ?? 0, totalPages: 1 },
    };
  },

  async obtenerTopProductos(
    fechaDesde: string,
    fechaHasta: string,
    page = 1,
    signal?: AbortSignal,
  ): Promise<{
    items: TopProductoModel[];
    meta: PaginationMeta;
  }> {
    const qs = buildQueryString({ fechaDesde, fechaHasta, page, limit: 15 });
    const res = await httpClient.get<unknown[]>(`/reportes/productos-mas-vendidos${qs}`, { signal });
    return {
      items: reportesAdapter.fromTopProductosJson(res.data ?? []),
      meta: res.meta ?? { page: 1, limit: 15, total: res.data?.length ?? 0, totalPages: 1 },
    };
  },

  async descargarPdf(fechaDesde?: string, fechaHasta?: string): Promise<void> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    await httpClient.downloadFile(
      `/reportes/exportar/pdf${qs}`,
      `reporte-pos-${fechaDesde || 'inicio'}-${fechaHasta || 'fin'}.pdf`,
    );
  },

  async descargarExcel(fechaDesde?: string, fechaHasta?: string): Promise<void> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    await httpClient.downloadFile(
      `/reportes/exportar/excel${qs}`,
      `reporte-pos-${fechaDesde || 'inicio'}-${fechaHasta || 'fin'}.xlsx`,
    );
  },
};
