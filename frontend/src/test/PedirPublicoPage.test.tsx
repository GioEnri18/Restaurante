import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuPublicoModel, publicPedidosService } from '../services/publicPedidos.service';
import { PedirPublicoPage } from '../ui/pages/PedirPublicoPage';

const MENU_MOCK: MenuPublicoModel = {
  sucursal: {
    codigo: 'SUC-01',
    nombre: 'La Parrilla Chapina',
    direccion: 'Zona 10, Guatemala',
    telefono: '2233-4455',
  },
  menuEspecialActivo: null,
  categorias: [{ id: 1, nombre: 'Platos Fuertes', orden: 1 }],
  platillos: [
    {
      id: 101,
      categoriaId: 1,
      categoriaNombre: 'Platos Fuertes',
      sku: 'PLT-101',
      nombre: 'Pepián de Pollo',
      descripcion: 'Acompañado de arroz y tortillas',
      imagenUrl: null,
      precioVenta: 65,
      esEspecialHoy: false,
    },
  ],
  zonas: [
    {
      id: 5,
      nombre: 'Zona 10',
      descripcion: 'Cobertura central',
      costoEnvio: 15,
      tiempoEstimadoMin: 30,
      pedidoMinimo: 100,
    },
  ],
};

describe('PedirPublicoPage (portal público + controles anti-abuso)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carga menú, expone honeypot accesible oculto, valida pedido mínimo y envía pedido Para llevar', async () => {
    const user = userEvent.setup();
    vi.spyOn(publicPedidosService, 'obtenerMenu').mockResolvedValue(MENU_MOCK);
    const crearSpy = vi.spyOn(publicPedidosService, 'crearPedido').mockResolvedValue({
      trackingToken: 'abcdef0123456789abcdef01',
      trackingExpiraEn: null,
      trackingTtlHoras: 24,
      numeroPedido: 'LLV-000010',
      tipoEntrega: 'LLEVAR',
      origen: 'WEB',
      estado: 'NUEVO',
      modalidadPago: 'CONTRA_ENTREGA',
      metodoPagoEsperado: 'EFECTIVO',
      clientePrimerNombre: 'Carlos',
      zonaNombre: 'Para llevar (Recoger en sucursal)',
      tiempoEstimadoMin: 20,
      subtotalPlatillos: 65,
      costoEnvio: 0,
      total: 65,
      observaciones: null,
      motivoCierre: null,
      createdAt: '2026-11-26T12:00:00.000Z',
      updatedAt: '2026-11-26T12:00:00.000Z',
      entregadoEn: null,
      sucursal: MENU_MOCK.sucursal,
      detalles: [
        {
          id: 1,
          nombrePlatillo: 'Pepián de Pollo',
          cantidad: 1,
          precioUnitario: 65,
          subtotal: 65,
          notas: null,
        },
      ],
      historial: [{ estado: 'NUEVO', createdAt: '2026-11-26T12:00:00.000Z' }],
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/pedir']}>
        <Routes>
          <Route path="/pedir" element={<PedirPublicoPage />} />
          <Route path="/pedir/seguimiento/:token" element={<PedirPublicoPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Espera carga del menú
    expect(await screen.findByText('Pepián de Pollo')).toBeInTheDocument();

    // Verifica honeypot inaccesible por teclado/lectores de pantalla y sin autocompletado
    const honeypot = container.querySelector<HTMLInputElement>('input[name="empresaWeb"]');
    expect(honeypot).toBeTruthy();
    expect(honeypot?.tabIndex).toBe(-1);
    expect(honeypot?.autocomplete).toBe('off');
    expect(honeypot?.closest('[aria-hidden="true"]')).toBeTruthy();

    // Agrega platillo al carrito
    await user.click(screen.getByRole('button', { name: /Agregar a mi orden/i }));

    // Cambiar a domicilio con Q65 < mínimo Q100 muestra advertencia y deshabilita envío
    await user.click(screen.getByRole('button', { name: /Servicio a domicilio/i }));
    expect(screen.getByText(/Pedido mínimo en esta zona/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar pedido a domicilio/i })).toBeDisabled();

    // Volver a Para llevar, llenar datos y enviar
    await user.click(screen.getByRole('button', { name: /Para llevar/i }));
    await user.type(screen.getByPlaceholderText('Ej. María López'), 'Carlos Pérez');
    await user.type(screen.getByPlaceholderText('5512-3456'), '5544-3322');
    await user.click(screen.getByRole('button', { name: /Enviar pedido para llevar/i }));

    await waitFor(() => {
      expect(crearSpy).toHaveBeenCalledTimes(1);
    });

    const payload = crearSpy.mock.calls[0][0];
    expect(payload.tipoEntrega).toBe('LLEVAR');
    expect(payload.empresaWeb).toBe('');
    expect(typeof payload.formIniciadoEn).toBe('number');
    expect(payload.cliente.nombre).toBe('Carlos Pérez');

    // Navega automáticamente a la pantalla de seguimiento
    expect(await screen.findByText(/Orden LLV-000010/i)).toBeInTheDocument();
  });
});
