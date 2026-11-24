import { reportesAdapter } from '../adapters/reportes.adapter';
import { PaginationMeta, ReporteResumenModel, SerieVentasDiaModel, TopProductoModel } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface BalanceEconomico {
  periodo: { fechaDesde: string; fechaHasta: string };
  cobrosEfectivo: number;
  cobrosTarjeta: number;
  totalCobrado: number;
  ingresosManuales: number;
  totalEntradasRegistradas: number;
  iva: number;
  cantidadVentas: number;
  cantidadAnuladas: number;
  totalAnulado: number;
  cantidadMermas: number;
  ticketPromedio: number;
  ventasSinIva: number;
  costoVendido: number;
  costoCortesias: number;
  valorCortesias: number;
  unidadesCortesia: number;
  mermas: number;
  sueldos: number;
  alquiler: number;
  alquilerMensual: number;
  otrosGastos: number;
  gastosTotales: number;
  compras: number;
  inventarioActual: number;
  egresosSinClasificar: number;
  resultado: number;
  lineasCostoPendiente: number;
  lineasConsumoPendiente: number;
  personalConDatosPendientes: number;
}

export interface DatosGasto {
  fecha: string;
  monto: string;
  concepto: string;
}

export interface GastoOperativo extends Omit<DatosGasto, 'monto'> {
  id: number;
  monto: number;
  version: number;
}

export const reportesService = {
  async registrarGasto(gasto: DatosGasto & { registroId: string }): Promise<void> {
    await httpClient.post('/reportes/gastos', gasto);
  },
  async editarGasto(id: number, gasto: DatosGasto & { version: number }): Promise<void> {
    await httpClient.put(`/reportes/gastos/${id}`, gasto);
  },
  async anularGasto(id: number, version: number, motivo: string): Promise<void> {
    await httpClient.post(`/reportes/gastos/${id}/anular`, { version, motivo });
  },
  async listarGastos(fechaDesde: string, fechaHasta: string, page: number, signal: AbortSignal) {
    const qs = buildQueryString({ fechaDesde, fechaHasta, page });
    const res = await httpClient.get<GastoOperativo[]>(`/reportes/gastos${qs}`, { signal });
    return {
      items: res.data ?? [],
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },
  async obtenerBalance(fechaDesde: string, fechaHasta: string, signal?: AbortSignal): Promise<BalanceEconomico> {
    const qs = buildQueryString({ fechaDesde, fechaHasta });
    const res = await httpClient.get<BalanceEconomico>(`/reportes/balance${qs}`, { signal });
    return res.data;
  },
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
