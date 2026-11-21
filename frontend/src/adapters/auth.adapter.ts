import { LoginResultModel, UsuarioSesionModel } from '../models';

// Adaptador de Autenticación: traduce el JSON de /api/v1/auth a modelos de dominio limpios
export const authAdapter = {
  fromUsuarioJson(raw: any): UsuarioSesionModel {
    return {
      id: Number(raw.id),
      username: String(raw.username ?? ''),
      nombreCompleto: String(raw.nombreCompleto ?? ''),
      email: String(raw.email ?? ''),
      sucursal: {
        id: Number(raw.sucursal?.id ?? 0),
        codigo: String(raw.sucursal?.codigo ?? ''),
        nombre: String(raw.sucursal?.nombre ?? ''),
        nit: String(raw.sucursal?.nit ?? 'CF'),
        direccion: String(raw.sucursal?.direccion ?? ''),
        telefono: raw.sucursal?.telefono ?? null,
        serieFactura: String(raw.sucursal?.serieFactura ?? 'A'),
      },
      rol: {
        id: Number(raw.rol?.id ?? 0),
        codigo: String(raw.rol?.codigo ?? ''),
        nombre: String(raw.rol?.nombre ?? ''),
        vistaInicial: String(raw.rol?.vistaInicial ?? '/ventas'),
      },
      permisos: Array.isArray(raw.permisos) ? raw.permisos.map(String) : [],
    };
  },

  fromLoginJson(raw: any): LoginResultModel {
    return {
      token: String(raw.token ?? ''),
      usuario: this.fromUsuarioJson(raw.usuario ?? {}),
    };
  },
};
