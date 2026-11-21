import { create } from 'zustand';
import { env } from '../config/env';
import { UsuarioSesionModel } from '../models';
import { authService } from '../services/auth.service';

interface AuthState {
  token: string | null;
  usuario: UsuarioSesionModel | null;
  loading: boolean;
  initialized: boolean;
  login: (identifier: string, password: string) => Promise<UsuarioSesionModel>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  clearSession: () => void;
  can: (permiso: string) => boolean;
  isAdmin: () => boolean;
}

function loadStoredSession(): { token: string | null; usuario: UsuarioSesionModel | null } {
  try {
    const raw = localStorage.getItem(env.AUTH_STORAGE_KEY);
    if (!raw) return { token: null, usuario: null };
    const parsed = JSON.parse(raw) as { token?: string; usuario?: UsuarioSesionModel };
    return {
      token: parsed.token ?? null,
      usuario: parsed.usuario ?? null,
    };
  } catch {
    return { token: null, usuario: null };
  }
}

const initial = loadStoredSession();

export const useAuthStore = create<AuthState>((set, get) => ({
  token: initial.token,
  usuario: initial.usuario,
  loading: false,
  initialized: false,

  login: async (identifier, password) => {
    set({ loading: true });
    try {
      const result = await authService.login(identifier, password);
      localStorage.setItem(env.AUTH_STORAGE_KEY, JSON.stringify(result));
      set({
        token: result.token,
        usuario: result.usuario,
        loading: false,
        initialized: true,
      });
      return result.usuario;
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      if (get().token) {
        await authService.logout();
      }
    } catch {
      // Ignora fallo de red al cerrar sesión
    } finally {
      localStorage.removeItem(env.AUTH_STORAGE_KEY);
      set({ token: null, usuario: null, initialized: true });
    }
  },

  hydrate: async () => {
    const token = get().token;
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      const perfil = await authService.me();
      localStorage.setItem(env.AUTH_STORAGE_KEY, JSON.stringify({ token, usuario: perfil }));
      set({ usuario: perfil, initialized: true });
    } catch {
      localStorage.removeItem(env.AUTH_STORAGE_KEY);
      set({ token: null, usuario: null, initialized: true });
    }
  },

  clearSession: () => {
    localStorage.removeItem(env.AUTH_STORAGE_KEY);
    set({ token: null, usuario: null });
  },

  can: (permiso: string) => {
    const usuario = get().usuario;
    if (!usuario) return false;
    return usuario.permisos.includes(permiso);
  },

  isAdmin: () => {
    const usuario = get().usuario;
    return Boolean(usuario && usuario.rol.codigo === env.ADMIN_ROLE_CODE);
  },
}));
