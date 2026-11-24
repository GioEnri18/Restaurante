import { accesosAdapter } from '../adapters/accesos.adapter';
import { PaginationMeta, PermisoModel, RolModel, UsuarioAdminModel } from '../models';
import { buildQueryString, httpClient } from './httpClient';

export const accesosService = {
  async listarUsuarios(page = 1, signal?: AbortSignal): Promise<{ items: UsuarioAdminModel[]; meta: PaginationMeta }> {
    const res = await httpClient.get<unknown[]>(`/accesos/usuarios${buildQueryString({ page })}`, { signal });
    return {
      items: (res.data ?? []).map((u) => accesosAdapter.fromUsuarioJson(u)),
      meta: res.meta ?? { page: 1, limit: 15, total: res.data?.length ?? 0, totalPages: 1 },
    };
  },

  async obtenerLongitudMinimaPassword(): Promise<number> {
    const res = await httpClient.get<{ longitudMinima: number }>('/accesos/usuarios/politica-password');
    return res.data.longitudMinima;
  },

  async crearUsuario(payload: {
    nombreCompleto: string;
    username: string;
    email: string;
    password: string;
    fechaIngreso: string;
    sueldoMensual: number;
    rolId: number;
    permisosPersonalizados?: Array<{ permisoId: number; permitido: boolean }>;
  }) {
    return httpClient.post('/accesos/usuarios', payload);
  },

  async actualizarUsuario(
    id: number,
    payload: {
      nombreCompleto?: string;
      email?: string;
      password?: string;
      fechaIngreso?: string;
      fechaBajaNomina?: string | null;
      sueldoMensual?: number;
      rolId?: number;
      permisosPersonalizados?: Array<{ permisoId: number; permitido: boolean }>;
    },
  ) {
    return httpClient.put(`/accesos/usuarios/${id}`, payload);
  },

  async cambiarEstadoUsuario(id: number, activo: boolean) {
    return httpClient.patch(`/accesos/usuarios/${id}/estado`, { activo });
  },

  async listarRoles(signal?: AbortSignal): Promise<RolModel[]> {
    const res = await httpClient.get<unknown[]>('/accesos/roles', { signal });
    return (res.data ?? []).map((r) => accesosAdapter.fromRolJson(r));
  },

  async crearRol(payload: {
    codigo: string;
    nombre: string;
    descripcion?: string;
    vistaInicial: string;
    permisoIds: number[];
  }) {
    return httpClient.post('/accesos/roles', payload);
  },

  async actualizarPermisosRol(rolId: number, permisoIds: number[], vistaInicial?: string) {
    return httpClient.put(`/accesos/roles/${rolId}/permisos`, { permisoIds, vistaInicial });
  },

  async listarPermisos(signal?: AbortSignal): Promise<{ lista: PermisoModel[]; porVista: Record<string, PermisoModel[]> }> {
    const res = await httpClient.get<unknown>('/accesos/permisos', { signal });
    return accesosAdapter.fromPermisosJson(res.data);
  },
};
