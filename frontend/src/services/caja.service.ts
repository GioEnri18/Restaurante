import { cajaAdapter } from '../adapters/caja.adapter';
import { CajaMovimientoModel, CajaSesionModel, PaginationMeta } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface VoucherConciliado {
  ventaId: number;
  referencia: string;
  monto: number;
}

interface VouchersTurno {
  cajaId: number;
  ventas: {
    ventaId: number;
    monto: number;
    referenciaPago?: string | null;
    numeroFactura?: string | null;
    fecha: string;
  }[];
  montoInicial?: number;
  totalIngresosExtra?: number;
  totalEgresosEfectivo?: number;
  totalEgresosTarjeta?: number;
  montoEsperadoEfectivo: number;
  totalVentasEfectivo: number;
  totalVentasTarjeta: number;
  totalCobrosVentas: number;
  totalTarjetaNeto: number;
  totalGeneralEsperado: number;
  ajusteTarjeta: number;
}

export type FiltroMovimientoCaja = 'TODOS' | 'VENTAS' | 'EGRESOS';

export const cajaService = {
  async obtenerActual(): Promise<CajaSesionModel | null> {
    const res = await httpClient.get<unknown | null>('/caja/actual?incluirMovimientos=false');
    return res.data ? cajaAdapter.fromSesionJson(res.data) : null;
  },

  // autorizacion: usuario y contraseña del supervisor (Administrador/Auditor) cuando quien opera no puede autorizarse
  async abrir(
    montoInicial: number,
    observaciones?: string,
    autorizacion?: { identifier: string; password: string },
  ): Promise<CajaSesionModel> {
    const res = await httpClient.post<unknown>('/caja/abrir', { montoInicial, observaciones, autorizacion });
    return cajaAdapter.fromSesionJson(res.data);
  },

  async cerrar(
    payload: {
      cajaId: number;
      montoContadoEfectivo: number;
      vouchers: VoucherConciliado[];
      observacionesCierre?: string;
      autorizacion?: { identifier: string; password: string };
    },
  ): Promise<CajaSesionModel> {
    const res = await httpClient.post<unknown>('/caja/cerrar', payload);
    return cajaAdapter.fromSesionJson(res.data);
  },

  async obtenerVouchersTurno(page: number): Promise<VouchersTurno & { meta: PaginationMeta }> {
    const res = await httpClient.get<VouchersTurno>(`/caja/vouchers${buildQueryString({ page })}`);
    if (!res.meta) throw new Error('No se pudo verificar la lista completa de vouchers');
    return { ...res.data, meta: res.meta };
  },

  async listarHistorial(page = 1): Promise<{ items: CajaSesionModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ page, limit: 15 });
    const res = await httpClient.get<unknown[]>(`/caja/historial${qs}`);
    return {
      items: (res.data ?? []).map((s) => cajaAdapter.fromSesionJson(s)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },

  async obtenerMovimientos(page: number, filtro: FiltroMovimientoCaja): Promise<{
    items: CajaMovimientoModel[];
    meta: PaginationMeta;
  }> {
    const res = await httpClient.get<unknown[]>(`/caja/movimientos${buildQueryString({ page, filtro })}`);
    if (!res.meta) throw new Error('No se pudo cargar la página de movimientos');
    return { items: (res.data ?? []).map(cajaAdapter.fromMovimientoJson), meta: res.meta };
  },
};
