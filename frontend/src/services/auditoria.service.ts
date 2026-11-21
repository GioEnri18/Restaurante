import { auditoriaAdapter } from '../adapters/auditoria.adapter';
import { env } from '../config/env';
import { AuditoriaLogModel, PaginationMeta } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const auditoriaService = {
  async listar(params: {
    page?: number;
    usuarioId?: string;
    accion?: string;
    fechaDesde?: string;
    fechaHasta?: string;
  }): Promise<{ items: AuditoriaLogModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params, limit: env.DEFAULT_PAGE_SIZE });
    const res = await httpClient.get<unknown[]>(`/auditoria${qs}`);
    return {
      items: (res.data ?? []).map((l) => auditoriaAdapter.fromLogJson(l)),
      meta: res.meta ?? { page: 1, limit: env.DEFAULT_PAGE_SIZE, total: 0, totalPages: 1 },
    };
  },

  async obtenerCatalogo(): Promise<{
    acciones: string[];
    usuarios: Array<{ id: number; username: string; nombreCompleto: string }>;
  }> {
    const res = await httpClient.get<{
      acciones: string[];
      usuarios: Array<{ id: number; username: string; nombreCompleto: string }>;
    }>('/auditoria/acciones');
    return res.data;
  },
};
