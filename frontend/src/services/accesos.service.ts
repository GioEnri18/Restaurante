import { accesosAdapter } from '../adapters/accesos.adapter';
import { PermisoModel, RolModel, UsuarioAdminModel } from '../models';
import { httpClient } from './httpClient';

export const accesosService = {
  async listarUsuarios(): Promise<UsuarioAdminModel[]> {
    const res = await httpClient.get<unknown[]>('/accesos/usuarios');
    return (res.data ?? []).map((u) => accesosAdapter.fromUsuarioJson(u));
  },

  async crearUsuario(payload: {
    nombreCompleto: string;
    username: string;
    email: string;
    password: string;
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
      rolId?: number;
      permisosPersonalizados?: Array<{ permisoId: number; permitido: boolean }>;
    },
  ) {
    return httpClient.put(`/accesos/usuarios/${id}`, payload);
  },

  async cambiarEstadoUsuario(id: number, activo: boolean) {
    return httpClient.patch(`/accesos/usuarios/${id}/estado`, { activo });
  },

  async listarRoles(): Promise<RolModel[]> {
    const res = await httpClient.get<unknown[]>('/accesos/roles');
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

  async listarPermisos(): Promise<{ lista: PermisoModel[]; porVista: Record<string, PermisoModel[]> }> {
    const res = await httpClient.get<unknown>('/accesos/permisos');
    return accesosAdapter.fromPermisosJson(res.data);
  },
};
