import { PermisoModel, RolModel, UsuarioAdminModel } from '../models';

/** Rol resumido embebido en la respuesta JSON de un usuario administrativo. */
interface RawRolResumenJson {
  id?: number | string;
  codigo?: string;
  nombre?: string;
  vistaInicial?: string;
}

/** Permiso personalizado (override) asignado directamente a un usuario. */
interface RawPermisoPersonalizadoJson {
  permisoId?: number | string;
  codigo?: string;
  permitido?: boolean;
}

/** Respuesta JSON cruda de un usuario desde /api/v1/accesos/usuarios. */
interface RawUsuarioAdminJson {
  id?: number | string;
  nombreCompleto?: string;
  username?: string;
  email?: string;
  activo?: boolean;
  ultimoAcceso?: string | null;
  fechaIngreso?: string | null;
  fechaBajaNomina?: string | null;
  sueldoMensual?: number | string | null;
  rol?: RawRolResumenJson | null;
  permisosEfectivos?: unknown[];
  permisosPersonalizados?: unknown[];
}

/** Permiso resumido dentro de la definición JSON de un rol. */
interface RawRolPermisoJson {
  id?: number | string;
  codigo?: string;
  vista?: string;
  accion?: string;
}

/** Respuesta JSON cruda de un rol desde /api/v1/accesos/roles. */
interface RawRolJson {
  id?: number | string;
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  vistaInicial?: string;
  esSistema?: boolean;
  usuariosCount?: number | string;
  permisos?: unknown[];
}

/** Elemento individual del catálogo de permisos en JSON. */
interface RawPermisoJson {
  id?: number | string;
  codigo?: string;
  vista?: string;
  accion?: string;
  descripcion?: string;
}

/** Respuesta JSON cruda del catálogo de permisos desde /api/v1/accesos/permisos. */
interface RawPermisosCatalogoJson {
  lista?: unknown[];
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

// Adaptador de Accesos (Solo Admin): traduce JSON de usuarios, roles y catálogo de permisos
export const accesosAdapter = {
  fromUsuarioJson(raw: unknown): UsuarioAdminModel {
    const data = asRecord<RawUsuarioAdminJson>(raw);
    const rol = asRecord<RawRolResumenJson>(data.rol);

    return {
      id: Number(data.id),
      nombreCompleto: String(data.nombreCompleto ?? ''),
      username: String(data.username ?? ''),
      email: String(data.email ?? ''),
      activo: Boolean(data.activo),
      ultimoAcceso: data.ultimoAcceso ?? null,
      fechaIngreso: data.fechaIngreso ?? null,
      fechaBajaNomina: data.fechaBajaNomina ?? null,
      sueldoMensual: data.sueldoMensual == null ? null : Number(data.sueldoMensual),
      rol: {
        id: Number(rol.id ?? 0),
        codigo: String(rol.codigo ?? ''),
        nombre: String(rol.nombre ?? ''),
        vistaInicial: String(rol.vistaInicial ?? '/ventas'),
      },
      permisosEfectivos: asArray<unknown>(data.permisosEfectivos).map(String),
      permisosPersonalizados: asArray<unknown>(data.permisosPersonalizados).map((item) => {
        const p = asRecord<RawPermisoPersonalizadoJson>(item);
        return {
          permisoId: Number(p.permisoId),
          codigo: String(p.codigo ?? ''),
          permitido: Boolean(p.permitido),
        };
      }),
    };
  },

  fromRolJson(raw: unknown): RolModel {
    const data = asRecord<RawRolJson>(raw);

    return {
      id: Number(data.id),
      codigo: String(data.codigo ?? ''),
      nombre: String(data.nombre ?? ''),
      descripcion: data.descripcion ?? null,
      vistaInicial: String(data.vistaInicial ?? '/ventas'),
      esSistema: Boolean(data.esSistema),
      usuariosCount: Number(data.usuariosCount ?? 0),
      permisos: asArray<unknown>(data.permisos).map((item) => {
        const p = asRecord<RawRolPermisoJson>(item);
        return {
          id: Number(p.id),
          codigo: String(p.codigo ?? ''),
          vista: String(p.vista ?? ''),
          accion: String(p.accion ?? ''),
        };
      }),
    };
  },

  fromPermisosJson(raw: unknown): { lista: PermisoModel[]; porVista: Record<string, PermisoModel[]> } {
    const data = asRecord<RawPermisosCatalogoJson>(raw);
    const lista: PermisoModel[] = asArray<unknown>(data.lista).map((item) => {
      const p = asRecord<RawPermisoJson>(item);
      return {
        id: Number(p.id),
        codigo: String(p.codigo ?? ''),
        vista: String(p.vista ?? ''),
        accion: String(p.accion ?? ''),
        descripcion: String(p.descripcion ?? ''),
      };
    });

    const porVista: Record<string, PermisoModel[]> = {};
    for (const p of lista) {
      if (!porVista[p.vista]) porVista[p.vista] = [];
      porVista[p.vista].push(p);
    }

    return { lista, porVista };
  },
};
