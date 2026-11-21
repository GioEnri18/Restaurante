import { AuditoriaLogModel } from '../models';

// Adaptador de Auditoría: traduce JSON de registros inmutables (anterior vs nuevo)
export const auditoriaAdapter = {
  fromLogJson(raw: any): AuditoriaLogModel {
    return {
      id: Number(raw.id),
      accion: String(raw.accion ?? ''),
      entidad: String(raw.entidad ?? ''),
      entidadId: raw.entidadId ? String(raw.entidadId) : null,
      usuarioNombre: String(raw.usuario?.nombreCompleto ?? 'Sistema / Anónimo'),
      usuarioUsername: String(raw.usuario?.username ?? '—'),
      rolNombre: String(raw.usuario?.rol?.nombre ?? '—'),
      valorAnterior: raw.valorAnterior ?? null,
      valorNuevo: raw.valorNuevo ?? null,
      motivo: raw.motivo ?? null,
      ipAddress: raw.ipAddress ?? null,
      createdAt: String(raw.createdAt ?? ''),
    };
  },
};
