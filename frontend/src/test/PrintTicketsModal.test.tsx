import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketImprimibleModel } from '../models';
import {
  guardarConfigImpresoras,
  printAgentService,
} from '../services/printAgent.service';
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

describe('PrintTicketsModal (botones individuales Caja/Cocina y agente local)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(printAgentService, 'verificarEstado').mockResolvedValue(false);
    vi.spyOn(printAgentService, 'listarImpresoras').mockResolvedValue([]);
  });

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

  it('cuando el agente local está conectado y cada botón tiene impresora asignada, imprime directo sin abrir window.print()', async () => {
    const user = userEvent.setup();
    guardarConfigImpresoras({
      caja: { tipo: 'windows', nombre: 'POS-80 Caja USB' },
      cocina: { tipo: 'tcp', host: '192.168.1.50', port: 9100 },
      abrirGavetaSoloEfectivo: true,
    });

    vi.spyOn(printAgentService, 'verificarEstado').mockResolvedValue(true);
    vi.spyOn(printAgentService, 'listarImpresoras').mockResolvedValue([
      { nombre: 'POS-80 Caja USB', puerto: 'USB001', predeterminada: true, enRed: false },
    ]);
    const spyImprimir = vi.spyOn(printAgentService, 'imprimirTicket').mockResolvedValue();
    const spyWindowPrint = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <PrintTicketsModal
        ticket={TICKET_MOCK}
        includeFactura
        includeComanda
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Impresora directa: POS-80 Caja USB')).toBeInTheDocument();
      expect(screen.getByText('Impresora directa: Red 192.168.1.50:9100')).toBeInTheDocument();
    });

    // Botón 1 (Caja): 2 copias + abre gaveta (EFECTIVO) -> no llama window.print()
    await user.click(screen.getByRole('button', { name: 'Imprimir Factura (2 copias)' }));
    expect(spyImprimir).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        destino: 'CAJA',
        target: { tipo: 'windows', nombre: 'POS-80 Caja USB' },
        opciones: expect.objectContaining({ copias: 2, abrirGaveta: true }),
      }),
    );

    // Botón 2 (Cocina): ahora desbloqueado -> 1 comanda a IP de red sin abrir gaveta
    const btnCocina = screen.getByRole('button', { name: 'Imprimir Cocina' });
    expect(btnCocina).toBeEnabled();
    await user.click(btnCocina);
    expect(spyImprimir).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        destino: 'COCINA',
        target: { tipo: 'tcp', host: '192.168.1.50', port: 9100 },
        opciones: expect.objectContaining({ abrirGaveta: false }),
      }),
    );

    expect(spyWindowPrint).not.toHaveBeenCalled();
  });
});
