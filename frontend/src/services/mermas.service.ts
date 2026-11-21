import { mermasAdapter } from '../adapters/mermas.adapter';
import { env } from '../config/env';
import { MermaModel, MermasListadoModel, MotivoMerma, UnidadMedida } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const mermasService = {
  async listar(params: {
    page?: number;
    motivo?: string;
    ingredienteId?: string;
    fechaDesde?: string;
    fechaHasta?: string;
  }): Promise<MermasListadoModel> {
    const qs = buildQueryString({ ...params, limit: env.FACTURAS_PAGE_SIZE });
    const res = await httpClient.get<unknown>(`/mermas${qs}`);
    return mermasAdapter.fromListadoJson(
      res.data,
      res.meta ?? { page: 1, limit: env.FACTURAS_PAGE_SIZE, total: 0, totalPages: 1 },
    );
  },

  async registrar(payload: {
    ingredienteId: number;
    cantidad: number;
    unidad: UnidadMedida;
    motivo: MotivoMerma;
    observacion?: string;
  }): Promise<MermaModel> {
    const res = await httpClient.post<unknown>('/mermas', payload);
    return mermasAdapter.fromMermaJson(res.data);
  },
};
