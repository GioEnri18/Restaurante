import { auditoriaAdapter } from '../adapters/auditoria.adapter';
import {
  AuditoriaCatalogoModel,
  AuditoriaDetalleModel,
  AuditoriaLogModel,
  AuditoriaResumenModel,
  PaginationMeta,
  PersonaNominaModel,
} from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface AuditoriaQueryParams {
  page?: number;
  limit?: number;
  usuarioId?: string;
  aprobadorId?: string;
  cajaSesionId?: string;
  accion?: string;
  severidad?: string;
  entidad?: string;
  entidadId?: string;
  impactoMin?: string;
  impactoMax?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export const auditoriaService = {
  async listarNomina(signal?: AbortSignal): Promise<PersonaNominaModel[]> {
    const res = await httpClient.get<PersonaNominaModel[]>('/auditoria/nomina', { signal });
    return res.data;
  },

  async listar(
    params: AuditoriaQueryParams,
    signal?: AbortSignal,
  ): Promise<{ items: AuditoriaLogModel[]; meta: PaginationMeta }> {
    const qs = buildQueryString({ ...params, limit: params.limit ?? 15 });
    const res = await httpClient.get<unknown[]>(`/auditoria${qs}`, { signal });
    return {
      items: (res.data ?? []).map((l) => auditoriaAdapter.fromLogJson(l)),
      meta: res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    };
  },

  async obtenerResumen(
    params: Omit<AuditoriaQueryParams, 'page' | 'limit'>,
    signal?: AbortSignal,
  ): Promise<AuditoriaResumenModel> {
    const qs = buildQueryString({ ...params });
    const res = await httpClient.get<unknown>(`/auditoria/resumen${qs}`, { signal });
    return auditoriaAdapter.fromResumenJson(res.data);
  },

  async obtenerDetalle(id: number, signal?: AbortSignal): Promise<AuditoriaDetalleModel> {
    const res = await httpClient.get<unknown>(`/auditoria/${id}`, { signal });
    return auditoriaAdapter.fromDetalleJson(res.data);
  },

  async exportarCsv(params: Omit<AuditoriaQueryParams, 'page' | 'limit'>): Promise<void> {
    const qs = buildQueryString({ ...params });
    const sufijo = params.fechaDesde || params.fechaHasta
      ? `-${params.fechaDesde || 'inicio'}-${params.fechaHasta || 'hoy'}`
      : '';
    await httpClient.downloadFile(`/auditoria/exportar${qs}`, `auditoria-pos${sufijo}.csv`);
  },

  async obtenerCatalogo(signal?: AbortSignal): Promise<AuditoriaCatalogoModel> {
    const res = await httpClient.get<unknown>('/auditoria/acciones', { signal });
    return auditoriaAdapter.fromCatalogoJson(res.data);
  },
};
