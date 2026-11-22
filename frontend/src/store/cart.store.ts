import { create } from 'zustand';
import { env } from '../config/env';
import { CartItemModel, PlatilloModel, TipoServicio } from '../models';
import { calcularIvaIncluido } from '../utils/formatters';

interface CartState {
  items: CartItemModel[];
  tipoServicio: TipoServicio;
  mesaId: number | null;
  nombreTurno: string;
  addItem: (platillo: PlatilloModel) => void;
  actualizarPrecios: (platillos: PlatilloModel[]) => void;
  updateQty: (platilloId: number, delta: number) => void;
  updateNotes: (platilloId: number, notas: string) => void;
  removeItem: (platilloId: number) => void;
  setTipoServicio: (tipo: TipoServicio) => void;
  setMesaId: (mesaId: number | null) => void;
  setNombreTurno: (nombreTurno: string) => void;
  clearCart: () => void;
  getTotals: () => { subtotalSinIva: number; ivaMonto: number; total: number; totalUnidades: number };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tipoServicio: env.DEFAULT_SERVICE_TYPE,
  mesaId: null,
  nombreTurno: '',

  addItem: (platillo) => {
    set((state) => {
      const existing = state.items.find((i) => i.platillo.id === platillo.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.platillo.id === platillo.id ? { ...i, cantidad: i.cantidad + 1 } : i,
          ),
        };
      }
      return {
        items: [...state.items, { platillo, cantidad: 1, notas: '' }],
      };
    });
  },

  actualizarPrecios: (platillos) => {
    set((state) => {
      if (state.items.length === 0) return state;
      const precios = new Map(platillos.map((platillo) => [platillo.id, platillo.precioVenta]));
      let cambio = false;
      const items = state.items.map((item) => {
        const precioVenta = precios.get(item.platillo.id);
        if (precioVenta === undefined || precioVenta <= 0 || precioVenta === item.platillo.precioVenta) return item;
        cambio = true;
        return { ...item, platillo: { ...item.platillo, precioVenta } };
      });
      return cambio ? { items } : state;
    });
  },

  updateQty: (platilloId, delta) => {
    set((state) => ({
      items: state.items
        .map((i) =>
          i.platillo.id === platilloId ? { ...i, cantidad: i.cantidad + delta } : i,
        )
        .filter((i) => i.cantidad > 0),
    }));
  },

  updateNotes: (platilloId, notas) => {
    set((state) => ({
      items: state.items.map((i) => (i.platillo.id === platilloId ? { ...i, notas } : i)),
    }));
  },

  removeItem: (platilloId) => {
    set((state) => ({
      items: state.items.filter((i) => i.platillo.id !== platilloId),
    }));
  },

  setTipoServicio: (tipoServicio) =>
    set((state) => ({
      tipoServicio,
      mesaId: tipoServicio === 'MESA' ? state.mesaId : null,
    })),

  setMesaId: (mesaId) => set({ mesaId }),

  setNombreTurno: (nombreTurno) => set({ nombreTurno }),

  clearCart: () => set({ items: [], mesaId: null, nombreTurno: '' }),

  getTotals: () => {
    const items = get().items;
    const totalBruto = items.reduce((acc, i) => acc + i.platillo.precioVenta * i.cantidad, 0);
    const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0);
    return {
      ...calcularIvaIncluido(totalBruto),
      totalUnidades,
    };
  },
}));
