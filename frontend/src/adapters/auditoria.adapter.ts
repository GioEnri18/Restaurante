import { AuditoriaLogModel } from '../models';

/** Rol embebido dentro del usuario que ejecutó la acción auditada. */
interface RawAuditoriaRolJson {
  nombre?: string;
}

/** Usuario embebido en la respuesta JSON de un registro de auditoría. */
interface RawAuditoriaUsuarioJson {
  nombreCompleto?: string;
  username?: string;
  rol?: RawAuditoriaRolJson | null;
}

/** Respuesta JSON cruda de un registro de auditoría desde /api/v1/auditoria. */
interface RawAuditoriaLogJson {
  id?: number | string;
  accion?: string;
  entidad?: string;
  entidadId?: string | number | null;
  usuario?: RawAuditoriaUsuarioJson | null;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  motivo?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

// Adaptador de Auditoría: traduce JSON de registros inmutables (anterior vs nuevo)
export const auditoriaAdapter = {
  fromLogJson(raw: unknown): AuditoriaLogModel {
    const data = asRecord<RawAuditoriaLogJson>(raw);
    const usuario = asRecord<RawAuditoriaUsuarioJson>(data.usuario);
    const rol = asRecord<RawAuditoriaRolJson>(usuario.rol);

    return {
      id: Number(data.id),
      accion: String(data.accion ?? ''),
      entidad: String(data.entidad ?? ''),
      entidadId: data.entidadId ? String(data.entidadId) : null,
      usuarioNombre: String(usuario.nombreCompleto ?? 'Sistema / Anónimo'),
      usuarioUsername: String(usuario.username ?? '—'),
      rolNombre: String(rol.nombre ?? '—'),
      valorAnterior: data.valorAnterior ?? null,
      valorNuevo: data.valorNuevo ?? null,
      motivo: data.motivo ?? null,
      ipAddress: data.ipAddress ?? null,
      createdAt: String(data.createdAt ?? ''),
    };
  },
};
