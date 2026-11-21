import { PermisoModel, RolModel, UsuarioAdminModel } from '../models';

// Adaptador de Accesos (Solo Admin): traduce JSON de usuarios, roles y catálogo de permisos
export const accesosAdapter = {
  fromUsuarioJson(raw: any): UsuarioAdminModel {
    return {
      id: Number(raw.id),
      nombreCompleto: String(raw.nombreCompleto ?? ''),
      username: String(raw.username ?? ''),
      email: String(raw.email ?? ''),
      activo: Boolean(raw.activo),
      ultimoAcceso: raw.ultimoAcceso ?? null,
      rol: {
        id: Number(raw.rol?.id ?? 0),
        codigo: String(raw.rol?.codigo ?? ''),
        nombre: String(raw.rol?.nombre ?? ''),
        vistaInicial: String(raw.rol?.vistaInicial ?? '/ventas'),
      },
      permisosEfectivos: Array.isArray(raw.permisosEfectivos)
        ? raw.permisosEfectivos.map(String)
        : [],
      permisosPersonalizados: (raw.permisosPersonalizados ?? []).map((p: any) => ({
        permisoId: Number(p.permisoId),
        codigo: String(p.codigo ?? ''),
        permitido: Boolean(p.permitido),
      })),
    };
  },

  fromRolJson(raw: any): RolModel {
    return {
      id: Number(raw.id),
      codigo: String(raw.codigo ?? ''),
      nombre: String(raw.nombre ?? ''),
      descripcion: raw.descripcion ?? null,
      vistaInicial: String(raw.vistaInicial ?? '/ventas'),
      esSistema: Boolean(raw.esSistema),
      usuariosCount: Number(raw.usuariosCount ?? 0),
      permisos: (raw.permisos ?? []).map((p: any) => ({
        id: Number(p.id),
        codigo: String(p.codigo ?? ''),
        vista: String(p.vista ?? ''),
        accion: String(p.accion ?? ''),
      })),
    };
  },

  fromPermisosJson(raw: any): { lista: PermisoModel[]; porVista: Record<string, PermisoModel[]> } {
    const lista: PermisoModel[] = (raw?.lista ?? []).map((p: any) => ({
      id: Number(p.id),
      codigo: String(p.codigo ?? ''),
      vista: String(p.vista ?? ''),
      accion: String(p.accion ?? ''),
      descripcion: String(p.descripcion ?? ''),
    }));

    const porVista: Record<string, PermisoModel[]> = {};
    for (const p of lista) {
      if (!porVista[p.vista]) porVista[p.vista] = [];
      porVista[p.vista].push(p);
    }

    return { lista, porVista };
  },
};
