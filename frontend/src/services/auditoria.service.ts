import { auditoriaAdapter } from '../adapters/auditoria.adapter';
import { AuditoriaLogModel, PaginationMeta, PersonaNominaModel } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const auditoriaService = {
  async listarNomina(signal?: AbortSignal): Promise<PersonaNominaModel[]> {
    const res = await httpClient.get<PersonaNominaModel[]>('/auditoria/nomina', { signal });
    return res.data;
  },
  async listar(
    params: {
      page?: number;
      usuarioId?: string;
      accion?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ items: AuditoriaLogModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params, limit: 15 });
    const res = await httpClient.get<unknown[]>(`/auditoria${qs}`, { signal });
    return {
      items: (res.data ?? []).map((l) => auditoriaAdapter.fromLogJson(l)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },

  async obtenerCatalogo(signal?: AbortSignal): Promise<{
    acciones: string[];
    usuarios: Array<{ id: number; username: string; nombreCompleto: string }>;
  }> {
    const res = await httpClient.get<{
      acciones: string[];
      usuarios: Array<{ id: number; username: string; nombreCompleto: string }>;
    }>('/auditoria/acciones', { signal });
    return res.data;
  },
};
