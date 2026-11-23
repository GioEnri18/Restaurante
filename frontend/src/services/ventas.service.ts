import { ventasAdapter } from '../adapters/ventas.adapter';
import {
  AlertaMenuEspecialModel,
  MenuDataModel,
  MenuEspecialModel,
  MetodoPago,
  TicketImprimibleModel,
  TipoServicio,
} from '../models';
import { buildQueryString, httpClient } from './httpClient';

export interface ConfirmarVentaPayload {
  idempotencyKey?: string;
  tipoServicio: TipoServicio;
  mesaId?: number | null;
  nombreTurno?: string;
  metodoPago: MetodoPago;
  montoRecibido?: number;
  referenciaPago?: string;
  clienteNit?: string;
  clienteNombre?: string;
  clienteDireccion?: string;
  observaciones?: string;
  items: Array<{ platilloId: number; cantidad: number; notas?: string }>;
}

export interface MenuEspecialPayload {
  nombre: string;
  descripcion?: string;
  fechaInicio: string;
  fechaFin: string;
  diasAvisoPrevio?: number;
  activo?: boolean;
  esMenuPrincipal?: boolean;
  platillos?: Array<{ platilloId: number; precioEspecial?: number | null }>;
}

export const ventasService = {
  async obtenerMenu(search?: string, categoriaId?: number): Promise<MenuDataModel> {
    const qs = buildQueryString({ search, categoriaId });
    const res = await httpClient.get<unknown>(`/ventas/menu${qs}`);
    return ventasAdapter.fromMenuJson(res.data);
  },

  async confirmarVenta(payload: ConfirmarVentaPayload): Promise<TicketImprimibleModel> {
    const res = await httpClient.post<unknown>('/ventas/confirmar', payload);
    return ventasAdapter.fromConfirmarVentaJson(res.data);
  },

  async listarMenusEspeciales(): Promise<MenuEspecialModel[]> {
    const res = await httpClient.get<unknown[]>('/ventas/menus-especiales');
    return (res.data ?? []).map((m) => ventasAdapter.fromMenuEspecialJson(m));
  },

  async obtenerAlertasMenusEspeciales(): Promise<AlertaMenuEspecialModel[]> {
    const res = await httpClient.get<unknown[]>('/ventas/menus-especiales/alertas');
    return (res.data ?? []).map((a) => ventasAdapter.fromAlertaMenuEspecialJson(a));
  },

  async crearMenuEspecial(payload: MenuEspecialPayload) {
    return httpClient.post('/ventas/menus-especiales', payload);
  },

  async actualizarMenuEspecial(id: number, payload: Partial<MenuEspecialPayload>) {
    return httpClient.put(`/ventas/menus-especiales/${id}`, payload);
  },

  async eliminarMenuEspecial(id: number) {
    return httpClient.delete(`/ventas/menus-especiales/${id}`);
  },

  async crearCategoria(payload: { nombre: string; descripcion?: string; orden?: number }) {
    return httpClient.post('/ventas/categorias', payload);
  },

  async crearPlatillo(payload: {
    categoriaId: number;
    sku: string;
    nombre: string;
    descripcion?: string;
    precioVenta: number;
    disponible?: boolean;
    receta?: Array<{ ingredienteId: number; cantidadOz: number }>;
  }) {
    return httpClient.post<{ id: number }>('/ventas/platillos', payload);
  },

  async subirFotoPlatillo(id: number, archivo: File) {
    const form = new FormData();
    form.append('imagen', archivo);
    return httpClient.put<{ imagenUrl: string; bytes: number }>(`/ventas/platillos/${id}/imagen`, form);
  },

  async actualizarPlatillo(
    id: number,
    payload: {
      categoriaId?: number;
      nombre?: string;
      descripcion?: string;
      precioVenta?: number;
      disponible?: boolean;
      motivo?: string;
      receta?: Array<{ ingredienteId: number; cantidadOz: number }>;
    },
  ) {
    return httpClient.put(`/ventas/platillos/${id}`, payload);
  },
};
