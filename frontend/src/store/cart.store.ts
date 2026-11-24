import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { env } from '../config/env';
import { CartItemModel, PlatilloModel, TipoServicio } from '../models';
import { calcularIvaIncluido } from '../utils/formatters';

/**
 * Representación mínima que se persiste en sessionStorage.
 * No guarda nombre ni precio para evitar mostrar tarifas obsoletas si cambia un menú especial.
 */
export interface PersistedCartItem {
  platilloId: number;
  cantidad: number;
  notas: string;
}

export interface CartItemEliminado {
  platilloId: number;
  nombre: string | null;
  motivo: 'ELIMINADO' | 'NO_DISPONIBLE';
}

interface CartState {
  /** Ítems crudos persistidos (solo id, cantidad y notas) */
  rawItems: PersistedCartItem[];
  /** Índice en memoria del menú cargado (no persistido) */
  catalogoMap: Record<number, PlatilloModel>;
  /** Ítems hidratados con nombre, precio y receta vigentes del menú cargado (no persistido) */
  items: CartItemModel[];
  tipoServicio: TipoServicio;
  mesaId: number | null;
  nombreTurno: string;
  addItem: (platillo: PlatilloModel) => void;
  /**
   * Sincroniza el carrito persistido con el menú recién cargado:
   * - Hidrata nombre, precio vigente y receta desde el servidor.
   * - Elimina platillos que ya no existan o ya no estén disponibles y devuelve el detalle para avisar al usuario.
   */
  sincronizarConMenu: (platillos: PlatilloModel[]) => CartItemEliminado[];
  /** Alias retrocompatible para actualizar precios y disponibilidad desde el menú */
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

function derivarItems(
  rawItems: PersistedCartItem[],
  catalogoMap: Record<number, PlatilloModel>,
): CartItemModel[] {
  const resultado: CartItemModel[] = [];
  for (const entry of rawItems) {
    const platillo = catalogoMap[entry.platilloId];
    if (!platillo) continue;
    resultado.push({
      platillo,
      cantidad: entry.cantidad,
      notas: entry.notas,
    });
  }
  return resultado;
}

function sanitizarRawItems(valor: unknown): PersistedCartItem[] {
  if (!Array.isArray(valor)) return [];
  const limpios: PersistedCartItem[] = [];
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue;
    const { platilloId, cantidad, notas } = item as Partial<PersistedCartItem>;
    if (
      typeof platilloId === 'number' &&
      Number.isInteger(platilloId) &&
      platilloId > 0 &&
      typeof cantidad === 'number' &&
      Number.isInteger(cantidad) &&
      cantidad > 0
    ) {
      limpios.push({
        platilloId,
        cantidad,
        notas: typeof notas === 'string' ? notas : '',
      });
    }
  }
  return limpios;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      rawItems: [],
      catalogoMap: {},
      items: [],
      tipoServicio: env.DEFAULT_SERVICE_TYPE,
      mesaId: null,
      nombreTurno: '',

      addItem: (platillo) => {
        set((state) => {
          const nextCatalogo = {
            ...state.catalogoMap,
            [platillo.id]: platillo,
          };
          const existing = state.rawItems.find((i) => i.platilloId === platillo.id);
          const nextRawItems = existing
            ? state.rawItems.map((i) =>
                i.platilloId === platillo.id ? { ...i, cantidad: i.cantidad + 1 } : i,
              )
            : [...state.rawItems, { platilloId: platillo.id, cantidad: 1, notas: '' }];

          return {
            catalogoMap: nextCatalogo,
            rawItems: nextRawItems,
            items: derivarItems(nextRawItems, nextCatalogo),
          };
        });
      },

      sincronizarConMenu: (platillos) => {
        const eliminados: CartItemEliminado[] = [];
        const nextCatalogo: Record<number, PlatilloModel> = {};
        for (const p of platillos) {
          nextCatalogo[p.id] = p;
        }

        set((state) => {
          const nextRawItems: PersistedCartItem[] = [];
          for (const entry of state.rawItems) {
            const vigente = nextCatalogo[entry.platilloId];
            if (!vigente) {
              eliminados.push({
                platilloId: entry.platilloId,
                nombre: state.catalogoMap[entry.platilloId]?.nombre ?? null,
                motivo: 'ELIMINADO',
              });
              continue;
            }
            const sinDisponibilidad = !vigente.disponible || vigente.precioVenta <= 0;
            if (sinDisponibilidad) {
              eliminados.push({
                platilloId: entry.platilloId,
                nombre: vigente.nombre,
                motivo: 'NO_DISPONIBLE',
              });
              continue;
            }
            nextRawItems.push(entry);
          }

          return {
            catalogoMap: nextCatalogo,
            rawItems: nextRawItems,
            items: derivarItems(nextRawItems, nextCatalogo),
          };
        });

        return eliminados;
      },

      actualizarPrecios: (platillos) => {
        get().sincronizarConMenu(platillos);
      },

      updateQty: (platilloId, delta) => {
        set((state) => {
          const nextRawItems = state.rawItems
            .map((i) =>
              i.platilloId === platilloId ? { ...i, cantidad: i.cantidad + delta } : i,
            )
            .filter((i) => i.cantidad > 0);
          return {
            rawItems: nextRawItems,
            items: derivarItems(nextRawItems, state.catalogoMap),
          };
        });
      },

      updateNotes: (platilloId, notas) => {
        set((state) => {
          const nextRawItems = state.rawItems.map((i) =>
            i.platilloId === platilloId ? { ...i, notas } : i,
          );
          return {
            rawItems: nextRawItems,
            items: derivarItems(nextRawItems, state.catalogoMap),
          };
        });
      },

      removeItem: (platilloId) => {
        set((state) => {
          const nextRawItems = state.rawItems.filter((i) => i.platilloId !== platilloId);
          return {
            rawItems: nextRawItems,
            items: derivarItems(nextRawItems, state.catalogoMap),
          };
        });
      },

      setTipoServicio: (tipoServicio) =>
        set((state) => ({
          tipoServicio,
          mesaId: tipoServicio === 'MESA' ? state.mesaId : null,
        })),

      setMesaId: (mesaId) => set({ mesaId }),

      setNombreTurno: (nombreTurno) => set({ nombreTurno }),

      clearCart: () =>
        set({
          rawItems: [],
          items: [],
          mesaId: null,
          nombreTurno: '',
          tipoServicio: env.DEFAULT_SERVICE_TYPE,
        }),

      getTotals: () => {
        const items = get().items;
        const totalBruto = items.reduce((acc, i) => acc + i.platillo.precioVenta * i.cantidad, 0);
        const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0);
        return {
          ...calcularIvaIncluido(totalBruto),
          totalUnidades,
        };
      },
    }),
    {
      name: env.CART_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      // Persistimos solo lo indispensable (platilloId, cantidad, notas y metadatos de entrega)
      partialize: (state) => ({
        rawItems: state.rawItems,
        tipoServicio: state.tipoServicio,
        mesaId: state.mesaId,
        nombreTurno: state.nombreTurno,
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CartState>;
        const rawItems = sanitizarRawItems(persisted.rawItems);
        const tipoServicio =
          persisted.tipoServicio === 'MOSTRADOR' ||
          persisted.tipoServicio === 'LLEVAR' ||
          persisted.tipoServicio === 'MESA' ||
          persisted.tipoServicio === 'DELIVERY'
            ? persisted.tipoServicio
            : currentState.tipoServicio;
        const mesaId =
          typeof persisted.mesaId === 'number' && Number.isInteger(persisted.mesaId)
            ? persisted.mesaId
            : null;
        const nombreTurno = typeof persisted.nombreTurno === 'string' ? persisted.nombreTurno : '';

        return {
          ...currentState,
          rawItems,
          tipoServicio,
          mesaId,
          nombreTurno,
          items: derivarItems(rawItems, currentState.catalogoMap),
        };
      },
    },
  ),
);
