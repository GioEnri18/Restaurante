import { create } from 'zustand';
import { env } from '../config/env';
import { UsuarioSesionModel } from '../models';
import { authService } from '../services/auth.service';
import { useCartStore } from './cart.store';

interface AuthState {
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

/**
 * Store de autenticación (Fase 2.7):
 * - El JWT ya NO se almacena en localStorage; vive exclusivamente en cookie `httpOnly` gestionada por el backend.
 * - Al iniciar la app, `hydrate()` consulta `/auth/me` con `credentials: 'include'` para restaurar el perfil.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  usuario: null,
  loading: false,
  initialized: false,

  login: async (identifier, password) => {
    set({ loading: true });
    try {
      // Limpia cualquier clave heredada de versiones anteriores
      try {
        localStorage.removeItem(env.AUTH_STORAGE_KEY);
      } catch {
        // Ignora entornos sin localStorage
      }

      const result = await authService.login(identifier, password);
      set({
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
      if (get().usuario) {
        await authService.logout();
      }
    } catch {
      // Ignora fallo de red al cerrar sesión
    } finally {
      // Limpia el carrito persistido al cerrar sesión para no filtrar pedidos entre usuarios
      useCartStore.getState().clearCart();
      useCartStore.persist.clearStorage();
      set({ usuario: null, initialized: true });
    }
  },

  hydrate: async () => {
    try {
      const perfil = await authService.me();
      set({ usuario: perfil, initialized: true });
    } catch {
      set({ usuario: null, initialized: true });
    }
  },

  clearSession: () => {
    useCartStore.getState().clearCart();
    useCartStore.persist.clearStorage();
    set({ usuario: null });
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
