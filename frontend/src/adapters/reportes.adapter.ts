import { ReporteResumenModel, SerieVentasDiaModel, TopProductoModel } from '../models';

// Adaptador de Reportes: traduce JSON de KPIs, series diarias y productos más vendidos
export const reportesAdapter = {
  fromResumenJson(raw: any): ReporteResumenModel {
    const k = raw.kpis ?? {};
    return {
      periodo: {
        fechaDesde: String(raw.periodo?.fechaDesde ?? ''),
        fechaHasta: String(raw.periodo?.fechaHasta ?? ''),
      },
      kpis: {
        cantidadVentas: Number(k.cantidadVentas ?? 0),
        ingresosTotales: Number(k.ingresosTotales ?? 0),
        subtotalSinIva: Number(k.subtotalSinIva ?? 0),
        ivaTotal: Number(k.ivaTotal ?? 0),
        costoRecetasTotal: Number(k.costoRecetasTotal ?? 0),
        costoMermasTotal: Number(k.costoMermasTotal ?? 0),
        cantidadMermas: Number(k.cantidadMermas ?? 0),
        totalCompras: Number(k.totalCompras ?? 0),
        utilidadBruta: Number(k.utilidadBruta ?? 0),
        margenBrutoPct: Number(k.margenBrutoPct ?? 0),
        ticketPromedio: Number(k.ticketPromedio ?? 0),
      },
      porMetodoPago: raw.porMetodoPago ?? {},
      porTipoServicio: raw.porTipoServicio ?? {},
    };
  },

  fromSerieJson(rawList: any[]): SerieVentasDiaModel[] {
    return (rawList ?? []).map((d: any) => ({
      fecha: String(d.fecha ?? ''),
      cantidadVentas: Number(d.cantidadVentas ?? 0),
      ingresos: Number(d.ingresos ?? 0),
      costos: Number(d.costos ?? 0),
      utilidad: Number(d.utilidad ?? 0),
    }));
  },

  fromTopProductosJson(rawList: any[]): TopProductoModel[] {
    return (rawList ?? []).map((p: any) => ({
      platilloId: Number(p.platilloId ?? 0),
      nombre: String(p.nombre ?? ''),
      cantidadVendida: Number(p.cantidadVendida ?? 0),
      ingresos: Number(p.ingresos ?? 0),
      costoTotal: Number(p.costoTotal ?? 0),
      utilidad: Number(p.utilidad ?? 0),
    }));
  },
};
