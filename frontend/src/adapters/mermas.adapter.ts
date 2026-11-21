import {
  MermaModel,
  MermasListadoModel,
  MotivoMerma,
  PaginationMeta,
  UnidadMedida,
} from '../models';

/** Ingrediente embebido en la respuesta JSON de una merma. */
interface RawMermaIngredienteJson {
  id?: number | string;
  nombre?: string;
  codigo?: string;
}

/** Usuario embebido en la respuesta JSON de una merma. */
interface RawMermaUsuarioJson {
  nombreCompleto?: string;
}

/** Respuesta JSON cruda de un registro de merma desde /api/v1/mermas. */
interface RawMermaJson {
  id?: number | string;
  ingredienteId?: number | string;
  ingrediente?: RawMermaIngredienteJson | null;
  usuario?: RawMermaUsuarioJson | null;
  cantidadOriginal?: number | string;
  unidadOriginal?: string;
  cantidadOz?: number | string;
  costoEstimado?: number | string;
  motivo?: string;
  observacion?: string | null;
  fecha?: string;
  createdAt?: string;
}

/** Totales agregados de desperdicios en la respuesta del listado de mermas. */
interface RawMermasResumenJson {
  costoTotalMermas?: number | string;
  totalOzMermadas?: number | string;
  totalLbMermadas?: number | string;
}

/** Respuesta JSON cruda del listado paginado de mermas. */
interface RawMermasListadoJson {
  items?: unknown[];
  resumen?: RawMermasResumenJson | null;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Normaliza la unidad de medida a la unión permitida (lb | oz). */
function toUnidadMedida(value: unknown): UnidadMedida {
  return value === 'lb' ? 'lb' : 'oz';
}

/** Normaliza el motivo de merma a la unión de dominio permitida. */
function toMotivoMerma(value: unknown): MotivoMerma {
  if (
    value === 'VENCIMIENTO' ||
    value === 'DANO' ||
    value === 'ERROR_PREPARACION' ||
    value === 'ACCIDENTE' ||
    value === 'OTRO'
  ) {
    return value;
  }
  return 'OTRO';
}

// Adaptador de Mermas: traduce JSON de desperdicios y totales de pérdidas
export const mermasAdapter = {
  fromMermaJson(raw: unknown): MermaModel {
    const data = asRecord<RawMermaJson>(raw);
    const ingrediente = asRecord<RawMermaIngredienteJson>(data.ingrediente);
    const usuario = asRecord<RawMermaUsuarioJson>(data.usuario);

    return {
      id: Number(data.id),
      ingredienteId: Number(data.ingredienteId ?? ingrediente.id ?? 0),
      ingredienteNombre: String(ingrediente.nombre ?? '—'),
      ingredienteCodigo: String(ingrediente.codigo ?? ''),
      usuarioNombre: String(usuario.nombreCompleto ?? '—'),
      cantidadOriginal: Number(data.cantidadOriginal ?? 0),
      unidadOriginal: toUnidadMedida(data.unidadOriginal),
      cantidadOz: Number(data.cantidadOz ?? 0),
      costoEstimado: Number(data.costoEstimado ?? 0),
      motivo: toMotivoMerma(data.motivo),
      observacion: data.observacion ?? null,
      fecha: String(data.fecha ?? data.createdAt ?? ''),
    };
  },

  fromListadoJson(rawData: unknown, meta: PaginationMeta): MermasListadoModel {
    const data = asRecord<RawMermasListadoJson>(rawData);
    const resumen = asRecord<RawMermasResumenJson>(data.resumen);

    return {
      items: asArray<unknown>(data.items).map((m) => this.fromMermaJson(m)),
      resumen: {
        costoTotalMermas: Number(resumen.costoTotalMermas ?? 0),
        totalOzMermadas: Number(resumen.totalOzMermadas ?? 0),
        totalLbMermadas: Number(resumen.totalLbMermadas ?? 0),
      },
      meta,
    };
  },
};
