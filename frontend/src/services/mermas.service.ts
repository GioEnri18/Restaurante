import { mermasAdapter } from '../adapters/mermas.adapter';
import { MermaModel, MermasListadoModel, MotivoMerma, UnidadMedida } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const mermasService = {
  async listar(
    params: {
      page?: number;
      motivo?: string;
      ingredienteId?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
    signal?: AbortSignal,
  ): Promise<MermasListadoModel> {
    const qs = buildQueryString({ ...params, limit: 15 });
    const res = await httpClient.get<unknown>(`/mermas${qs}`, { signal });
    return mermasAdapter.fromListadoJson(
      res.data,
      res.meta ?? { page: 1, limit: 15, total: 0, totalPages: 1 },
    );
  },

  async registrar(payload: {
    ingredienteId: number;
    cantidad: number;
    unidad: UnidadMedida;
    motivo: MotivoMerma;
    observacion?: string;
    idempotencyKey?: string;
  }): Promise<MermaModel> {
    const res = await httpClient.post<unknown>('/mermas', payload);
    return mermasAdapter.fromMermaJson(res.data);
  },
};
