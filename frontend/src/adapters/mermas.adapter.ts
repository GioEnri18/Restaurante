import { MermaModel, MermasListadoModel, PaginationMeta } from '../models';

// Adaptador de Mermas: traduce JSON de desperdicios y totales de pérdidas
export const mermasAdapter = {
  fromMermaJson(raw: any): MermaModel {
    return {
      id: Number(raw.id),
      ingredienteId: Number(raw.ingredienteId ?? raw.ingrediente?.id ?? 0),
      ingredienteNombre: String(raw.ingrediente?.nombre ?? '—'),
      ingredienteCodigo: String(raw.ingrediente?.codigo ?? ''),
      usuarioNombre: String(raw.usuario?.nombreCompleto ?? '—'),
      cantidadOriginal: Number(raw.cantidadOriginal ?? 0),
      unidadOriginal: raw.unidadOriginal ?? 'oz',
      cantidadOz: Number(raw.cantidadOz ?? 0),
      costoEstimado: Number(raw.costoEstimado ?? 0),
      motivo: raw.motivo ?? 'OTRO',
      observacion: raw.observacion ?? null,
      fecha: String(raw.fecha ?? raw.createdAt ?? ''),
    };
  },

  fromListadoJson(rawData: any, meta: PaginationMeta): MermasListadoModel {
    return {
      items: (rawData?.items ?? []).map((m: any) => this.fromMermaJson(m)),
      resumen: {
        costoTotalMermas: Number(rawData?.resumen?.costoTotalMermas ?? 0),
        totalOzMermadas: Number(rawData?.resumen?.totalOzMermadas ?? 0),
        totalLbMermadas: Number(rawData?.resumen?.totalLbMermadas ?? 0),
      },
      meta,
    };
  },
};
