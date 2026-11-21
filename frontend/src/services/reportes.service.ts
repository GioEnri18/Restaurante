import { reportesAdapter } from '../adapters/reportes.adapter';
import { ReporteResumenModel, SerieVentasDiaModel, TopProductoModel } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const reportesService = {
  async obtenerResumen(fechaDesde?: string, fechaHasta?: string): Promise<ReporteResumenModel> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    const res = await httpClient.get<unknown>(`/reportes/resumen${qs}`);
    return reportesAdapter.fromResumenJson(res.data);
  },

  async obtenerVentasPeriodo(fechaDesde?: string, fechaHasta?: string): Promise<SerieVentasDiaModel[]> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    const res = await httpClient.get<unknown[]>(`/reportes/ventas-periodo${qs}`);
    return reportesAdapter.fromSerieJson(res.data ?? []);
  },

  async obtenerTopProductos(fechaDesde?: string, fechaHasta?: string): Promise<TopProductoModel[]> {
    const qs = buildQueryString({ fechaDesde, fechaHasta, limit: 10 });
    const res = await httpClient.get<unknown[]>(`/reportes/productos-mas-vendidos${qs}`);
    return reportesAdapter.fromTopProductosJson(res.data ?? []);
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
