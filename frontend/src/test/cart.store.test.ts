import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { PlatilloModel } from '../models';
import { useCartStore } from '../store/cart.store';

function crearPlatillo(overrides: Partial<PlatilloModel> = {}): PlatilloModel {
  return {
    id: 1,
    categoriaId: 10,
    categoriaNombre: 'Parrilla',
    sku: 'PAR-001',
    nombre: 'Churrasco Chapín',
    descripcion: 'Con guacamol y tortillas',
    imagenUrl: null,
    precioVenta: 112,
    precioRegular: 112,
    esEspecialHoy: false,
    costoReceta: 45,
    disponible: true,
    stockDisponible: true,
    receta: [],
    ...overrides,
  };
}

describe('useCartStore (carrito POS + sessionStorage sin PII ni precios)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useCartStore.getState().clearCart();
  });

  it('agrega platillos, ajusta cantidades/notas y calcula desglose de IVA 12% Guatemala', () => {
    const platillo = crearPlatillo({ id: 1, precioVenta: 112 });
    const store = useCartStore.getState();

    store.addItem(platillo);
    store.addItem(platillo);
    store.updateNotes(1, 'Término medio');

    const estado = useCartStore.getState();
    expect(estado.items).toHaveLength(1);
    expect(estado.items[0].cantidad).toBe(2);
    expect(estado.items[0].notas).toBe('Término medio');

    const totales = estado.getTotals();
    expect(totales.totalUnidades).toBe(2);
    expect(totales.total).toBe(224);
    expect(totales.subtotalSinIva).toBe(200);
    expect(totales.ivaMonto).toBe(24);

    // Decrementar hasta 0 elimina el ítem
    estado.updateQty(1, -2);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('persiste en sessionStorage únicamente ids y metadatos (nunca precios ni nombres de platillos)', () => {
    const platillo = crearPlatillo({ id: 7, nombre: 'Pepián Tradicional', precioVenta: 85 });
    useCartStore.getState().addItem(platillo);
    useCartStore.getState().setTipoServicio('LLEVAR');

    const crudo = sessionStorage.getItem(env.CART_STORAGE_KEY);
    expect(crudo).toBeTruthy();
    expect(crudo).toContain('"platilloId":7');
    expect(crudo).toContain('"tipoServicio":"LLEVAR"');
    expect(crudo).not.toContain('Pepián Tradicional');
    expect(crudo).not.toContain('85');
  });

  it('sincronizarConMenu actualiza precios vigentes y depura platillos eliminados o no disponibles', () => {
    const p1 = crearPlatillo({ id: 1, nombre: 'Tacos', precioVenta: 40 });
    const p2 = crearPlatillo({ id: 2, nombre: 'Caldo', precioVenta: 50 });
    const p3 = crearPlatillo({ id: 3, nombre: 'Horchata', precioVenta: 15 });

    useCartStore.getState().addItem(p1);
    useCartStore.getState().addItem(p2);
    useCartStore.getState().addItem(p3);

    const eliminados = useCartStore.getState().sincronizarConMenu([
      crearPlatillo({ id: 1, nombre: 'Tacos', precioVenta: 48 }), // cambia precio vigente
      crearPlatillo({ id: 2, nombre: 'Caldo', precioVenta: 50, disponible: false }), // no disponible
      // id 3 ya no viene del servidor (eliminado)
    ]);

    expect(eliminados).toEqual([
      { platilloId: 2, nombre: 'Caldo', motivo: 'NO_DISPONIBLE' },
      { platilloId: 3, nombre: 'Horchata', motivo: 'ELIMINADO' },
    ]);

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].platillo.precioVenta).toBe(48);
  });
});
