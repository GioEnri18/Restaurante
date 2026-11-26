import { ReporteResumenModel, SerieVentasDiaModel, TopProductoModel } from '../models';

/** Rango de fechas incluido en la respuesta JSON del resumen de reportes. */
interface RawPeriodoJson {
  fechaDesde?: string;
  fechaHasta?: string;
}

/** Indicadores clave (KPIs) recibidos en JSON desde /api/v1/reportes/resumen. */
interface RawReporteKpisJson {
  cantidadVentas?: number | string;
  ingresosTotales?: number | string;
  subtotalSinIva?: number | string;
  ivaTotal?: number | string;
  costoRecetasTotal?: number | string;
  costoMermasTotal?: number | string;
  cantidadMermas?: number | string;
  totalCompras?: number | string;
  valorInventarioActual?: number | string;
  insumosConStockSinCosto?: number | string;
  ingredientesEnNegativoCount?: number | string;
  deficitTotalInventarioOz?: number | string;
  deficitTotalInventarioLb?: number | string;
  utilidadBruta?: number | string;
  margenBrutoPct?: number | string;
  ticketPromedio?: number | string;
}

/** Agregado individual por método de pago o tipo de servicio. */
interface RawAgregadoItemJson {
  cantidad?: number | string;
  total?: number | string;
}

/** Respuesta JSON cruda del resumen ejecutivo de reportes. */
interface RawReporteResumenJson {
  periodo?: RawPeriodoJson | null;
  kpis?: RawReporteKpisJson | null;
  porMetodoPago?: unknown;
  porTipoServicio?: unknown;
}

/** Punto diario en la serie histórica de ventas por periodo. */
interface RawSerieVentasDiaJson {
  fecha?: string;
  cantidadVentas?: number | string;
  ingresos?: number | string;
  ingresosSinIva?: number | string;
  costos?: number | string;
  mermas?: number | string;
  utilidad?: number | string;
}

/** Elemento JSON del ranking de productos más vendidos. */
interface RawTopProductoJson {
  platilloId?: number | string;
  nombre?: string;
  cantidadVendida?: number | string;
  ingresos?: number | string;
  costoTotal?: number | string;
  utilidad?: number | string;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Convierte un diccionario JSON crudo en un mapa normalizado de `{ cantidad, total }`. */
function asAgregadoRecord(raw: unknown): Record<string, { cantidad: number; total: number }> {
  const source = asRecord<Record<string, unknown>>(raw);
  const result: Record<string, { cantidad: number; total: number }> = {};

  for (const [clave, valor] of Object.entries(source)) {
    const item = asRecord<RawAgregadoItemJson>(valor);
    result[clave] = {
      cantidad: Number(item.cantidad ?? 0),
      total: Number(item.total ?? 0),
    };
  }

  return result;
}

// Adaptador de Reportes: traduce JSON de KPIs, series diarias y productos más vendidos
export const reportesAdapter = {
  fromResumenJson(raw: unknown): ReporteResumenModel {
    const data = asRecord<RawReporteResumenJson>(raw);
    const periodo = asRecord<RawPeriodoJson>(data.periodo);
    const k = asRecord<RawReporteKpisJson>(data.kpis);

    return {
      periodo: {
        fechaDesde: String(periodo.fechaDesde ?? ''),
        fechaHasta: String(periodo.fechaHasta ?? ''),
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
        valorInventarioActual: k.valorInventarioActual == null ? null : Number(k.valorInventarioActual),
        insumosConStockSinCosto: Number(k.insumosConStockSinCosto ?? 0),
        ingredientesEnNegativoCount: Number(k.ingredientesEnNegativoCount ?? 0),
        deficitTotalInventarioOz: Number(k.deficitTotalInventarioOz ?? 0),
        deficitTotalInventarioLb: Number(k.deficitTotalInventarioLb ?? 0),
        utilidadBruta: Number(k.utilidadBruta ?? 0),
        margenBrutoPct: Number(k.margenBrutoPct ?? 0),
        ticketPromedio: Number(k.ticketPromedio ?? 0),
      },
      porMetodoPago: asAgregadoRecord(data.porMetodoPago),
      porTipoServicio: asAgregadoRecord(data.porTipoServicio),
    };
  },

  fromSerieJson(rawList: unknown): SerieVentasDiaModel[] {
    return asArray<unknown>(rawList).map((item) => {
      const d = asRecord<RawSerieVentasDiaJson>(item);
      return {
        fecha: String(d.fecha ?? ''),
        cantidadVentas: Number(d.cantidadVentas ?? 0),
        ingresos: Number(d.ingresos ?? 0),
        ingresosSinIva: Number(d.ingresosSinIva ?? 0),
        costos: Number(d.costos ?? 0),
        mermas: Number(d.mermas ?? 0),
        utilidad: Number(d.utilidad ?? 0),
      };
    });
  },

  fromTopProductosJson(rawList: unknown): TopProductoModel[] {
    return asArray<unknown>(rawList).map((item) => {
      const p = asRecord<RawTopProductoJson>(item);
      return {
        platilloId: Number(p.platilloId ?? 0),
        nombre: String(p.nombre ?? ''),
        cantidadVendida: Number(p.cantidadVendida ?? 0),
        ingresos: Number(p.ingresos ?? 0),
        costoTotal: Number(p.costoTotal ?? 0),
        utilidad: Number(p.utilidad ?? 0),
      };
    });
  },
};
