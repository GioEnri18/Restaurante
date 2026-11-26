import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketImprimibleModel } from '../models';
import { PrintTicketsModal } from '../ui/components/print/PrintTicketsModal';

const TICKET_MOCK: TicketImprimibleModel = {
  sucursal: {
    nombre: 'La Parrilla Chapina - Zona 10',
    nit: '10482931-4',
    direccion: '4a Avenida 12-45 Zona 10, Ciudad de Guatemala',
    telefono: '+502 2367-8900',
  },
  factura: {
    id: 18,
    numeroCompleto: 'A-000018',
    serie: 'A',
    clienteNombre: 'Consumidor Final',
    clienteNit: 'CF',
    clienteDireccion: 'Ciudad',
    subtotalSinIva: 196.43,
    ivaMonto: 23.57,
    total: 220,
    estado: 'EMITIDA',
    reimpresionesCount: 0,
    felEstado: 'INTERNO',
    felUuid: null,
    createdAt: '2026-11-26T09:14:00.000Z',
  },
  venta: {
    id: 18,
    tipoServicio: 'MOSTRADOR',
    metodoPago: 'EFECTIVO',
    montoRecibido: 220,
    cambio: 0,
    cajeroNombre: 'Giovanni',
    detalles: [
      {
        id: 1,
        nombrePlatillo: 'Alitas a la barbacoa con papas',
        cantidad: 1,
        cantidadCortesia: 0,
        precioUnitario: 90,
        subtotal: 90,
        notas: 'Bien doradas',
      },
    ],
  },
  comanda: {
    numeroComanda: 'CMD-00018',
    tipoServicio: 'MOSTRADOR',
    mesaNumero: null,
    nombreTurno: null,
    createdAt: '2026-11-26T09:14:00.000Z',
  },
};

describe('PrintTicketsModal (botones individuales por bloque Caja y Cocina)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('muestra Factura (2 copias) sin comanda de caja, bloquea Cocina hasta imprimir Factura y luego permite imprimir Cocina individual', async () => {
    const user = userEvent.setup();
    const capturasEnPrint: string[][] = [];

    vi.spyOn(window, 'print').mockImplementation(() => {
      const paginas = Array.from(
        document.body.querySelectorAll<HTMLElement>('.print-only-root .print-ticket-page'),
      );
      capturasEnPrint.push(paginas.map((el) => el.dataset.ticketTipo ?? ''));
    });

    render(
      <PrintTicketsModal
        ticket={TICKET_MOCK}
        includeFactura
        includeComanda
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Factura y comanda de cocina' })).toBeInTheDocument();
    // Sin botón general y sin COMANDA CAJA en la vista
    expect(screen.queryByRole('button', { name: /Imprimir todo|Imprimir ahora/i })).not.toBeInTheDocument();
    expect(screen.queryByText('COMANDA CAJA')).not.toBeInTheDocument();

    // Cocina arranca bloqueado hasta que se imprima Factura (2 copias)
    const btnCocina = screen.getByRole('button', { name: 'Imprimir Cocina' });
    expect(btnCocina).toBeDisabled();
    expect(screen.getByText('Imprime Factura primero')).toBeInTheDocument();

    // 1. Imprimir Factura (2 copias) -> imprime 2 hojas de Factura (cliente + copia caja) y desbloquea Cocina
    await user.click(screen.getByRole('button', { name: 'Imprimir Factura (2 copias)' }));
    expect(capturasEnPrint[0]).toEqual(['factura-cliente', 'factura-caja']);
    expect(document.body.querySelector('.print-only-root')?.textContent).toContain('COPIA CAJA');
    expect(screen.getByText('Impreso')).toBeInTheDocument();
    expect(btnCocina).toBeEnabled();

    // 2. Imprimir bloque Cocina -> únicamente Comanda cocina (1 hoja)
    await user.click(btnCocina);
    expect(capturasEnPrint[1]).toEqual(['comanda-cocina']);
    expect(screen.getAllByText('Impreso')).toHaveLength(2);
  });

  it('al reimprimir solo factura imprime únicamente 1 hoja de Factura del cliente', async () => {
    const user = userEvent.setup();
    const capturasEnPrint: string[][] = [];

    vi.spyOn(window, 'print').mockImplementation(() => {
      const paginas = Array.from(
        document.body.querySelectorAll<HTMLElement>('.print-only-root .print-ticket-page'),
      );
      capturasEnPrint.push(paginas.map((el) => el.dataset.ticketTipo ?? ''));
    });

    render(
      <PrintTicketsModal
        ticket={TICKET_MOCK}
        includeFactura
        includeComanda={false}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Imprimir Factura' }));
    expect(capturasEnPrint[0]).toEqual(['factura-cliente']);
  });

  it('al reimprimir solo comanda imprime únicamente Comanda Cocina con marca REIMPRESIÓN', async () => {
    const user = userEvent.setup();
    const capturasEnPrint: string[][] = [];

    vi.spyOn(window, 'print').mockImplementation(() => {
      const paginas = Array.from(
        document.body.querySelectorAll<HTMLElement>('.print-only-root .print-ticket-page'),
      );
      capturasEnPrint.push(paginas.map((el) => el.dataset.ticketTipo ?? ''));
    });

    render(
      <PrintTicketsModal
        ticket={TICKET_MOCK}
        includeFactura={false}
        includeComanda
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Imprimir Cocina' }));
    expect(capturasEnPrint[0]).toEqual(['comanda-cocina']);
    expect(document.body.querySelector('.print-only-root')?.textContent).toContain('REIMPRESIÓN');
  });
});
