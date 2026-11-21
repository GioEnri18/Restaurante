import { LoginResultModel, UsuarioSesionModel } from '../models';

/** Sucursal embebida en la respuesta JSON de la sesión autenticada. */
interface RawSucursalJson {
  id?: number | string;
  codigo?: string;
  nombre?: string;
  nit?: string;
  direccion?: string;
  telefono?: string | null;
  serieFactura?: string;
}

/** Rol embebido en la respuesta JSON de la sesión autenticada. */
interface RawRolSesionJson {
  id?: number | string;
  codigo?: string;
  nombre?: string;
  vistaInicial?: string;
}

/** Respuesta JSON cruda del usuario autenticado desde /api/v1/auth/me. */
interface RawUsuarioSesionJson {
  id?: number | string;
  username?: string;
  nombreCompleto?: string;
  email?: string;
  sucursal?: RawSucursalJson | null;
  rol?: RawRolSesionJson | null;
  permisos?: unknown[];
}

/** Respuesta JSON cruda del inicio de sesión desde /api/v1/auth/login. */
interface RawLoginJson {
  token?: string | null;
  usuario?: unknown;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

// Adaptador de Autenticación: traduce el JSON de /api/v1/auth a modelos de dominio limpios
export const authAdapter = {
  fromUsuarioJson(raw: unknown): UsuarioSesionModel {
    const data = asRecord<RawUsuarioSesionJson>(raw);
    const sucursal = asRecord<RawSucursalJson>(data.sucursal);
    const rol = asRecord<RawRolSesionJson>(data.rol);

    return {
      id: Number(data.id),
      username: String(data.username ?? ''),
      nombreCompleto: String(data.nombreCompleto ?? ''),
      email: String(data.email ?? ''),
      sucursal: {
        id: Number(sucursal.id ?? 0),
        codigo: String(sucursal.codigo ?? ''),
        nombre: String(sucursal.nombre ?? ''),
        nit: String(sucursal.nit ?? 'CF'),
        direccion: String(sucursal.direccion ?? ''),
        telefono: sucursal.telefono ?? null,
        serieFactura: String(sucursal.serieFactura ?? 'A'),
      },
      rol: {
        id: Number(rol.id ?? 0),
        codigo: String(rol.codigo ?? ''),
        nombre: String(rol.nombre ?? ''),
        vistaInicial: String(rol.vistaInicial ?? '/ventas'),
      },
      permisos: asArray<unknown>(data.permisos).map(String),
    };
  },

  fromLoginJson(raw: unknown): LoginResultModel {
    const data = asRecord<RawLoginJson>(raw);
    return {
      token: data.token ? String(data.token) : undefined,
      usuario: this.fromUsuarioJson(data.usuario),
    };
  },
};
