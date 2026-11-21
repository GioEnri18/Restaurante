import { authAdapter } from '../adapters/auth.adapter';
import { LoginResultModel, UsuarioSesionModel } from '../models';
import { httpClient } from './httpClient';

export const authService = {
  async login(identifier: string, password: string): Promise<LoginResultModel> {
    const res = await httpClient.post<unknown>('/auth/login', { identifier, password });
    return authAdapter.fromLoginJson(res.data);
  },

  async logout(): Promise<void> {
    await httpClient.post('/auth/logout');
  },

  async me(): Promise<UsuarioSesionModel> {
    const res = await httpClient.get<unknown>('/auth/me');
    return authAdapter.fromUsuarioJson(res.data);
  },
};
