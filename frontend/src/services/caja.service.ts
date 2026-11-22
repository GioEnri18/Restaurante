import { cajaAdapter } from '../adapters/caja.adapter';
import { env } from '../config/env';
import { CajaSesionModel, MetodoPago, PaginationMeta } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const cajaService = {
  async obtenerActual(): Promise<CajaSesionModel | null> {
    const res = await httpClient.get<unknown | null>('/caja/actual');
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

  async registrarMovimiento(payload: {
    tipo: 'INGRESO_MANUAL' | 'EGRESO_MANUAL';
    monto: number;
    descripcion: string;
    metodoPago?: MetodoPago;
  }) {
    return httpClient.post('/caja/movimientos', payload);
  },

  async cerrar(
    montoContadoEfectivo: number,
    observacionesCierre?: string,
    autorizacion?: { identifier: string; password: string },
  ): Promise<CajaSesionModel> {
    const res = await httpClient.post<unknown>('/caja/cerrar', {
      montoContadoEfectivo,
      observacionesCierre,
      autorizacion,
    });
    return cajaAdapter.fromSesionJson(res.data);
  },

  async listarHistorial(page = 1): Promise<{ items: CajaSesionModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ page, limit: env.FACTURAS_PAGE_SIZE });
    const res = await httpClient.get<unknown[]>(`/caja/historial${qs}`);
    return {
      items: (res.data ?? []).map((s) => cajaAdapter.fromSesionJson(s)),
      meta: res.meta ?? { page: 1, limit: env.FACTURAS_PAGE_SIZE, total: 0, totalPages: 1 },
    };
  },
};
