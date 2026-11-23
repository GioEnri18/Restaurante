import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { env } from '../../../config/env';
import { TicketImprimibleModel } from '../../../models';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

interface PrintTicketsModalProps {
  ticket: TicketImprimibleModel | null;
  includeComanda?: boolean;
  autoPrint?: boolean;
  onClose: () => void;
}

/**
 * Modal de vista previa e impresión térmica 80mm para FACTURA y COMANDA DE COCINA.
 * Cuando se confirma una venta y VITE_AUTO_PRINT_ENABLED=true, dispara window.print() automáticamente.
 */
export const PrintTicketsModal: React.FC<PrintTicketsModalProps> = ({
  ticket,
  includeComanda = true,
  autoPrint = false,
  onClose,
}) => {
  useEffect(() => {
    if (ticket && autoPrint && env.AUTO_PRINT_ENABLED) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [ticket, autoPrint]);

  if (!ticket) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Barra superior (oculta al imprimir) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {includeComanda ? 'Factura y Comanda de Cocina' : `Reimpresión Factura ${ticket.factura.numeroCompleto}`}
            </h3>
            <p className="text-xs text-slate-500">Formato optimizado para impresora térmica de 80 mm</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Imprimir ahora
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa de impresión"
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Área imprimible */}
        <div className="overflow-y-auto bg-slate-100 p-5">
          <div className="print-area mx-auto grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* TICKET 1: FACTURA */}
            <div className="mx-auto w-full max-w-[320px] rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs text-slate-900 shadow-sm">
              <div className="border-b border-dashed border-slate-400 pb-2 text-center">
                <p className="text-sm font-bold uppercase">{ticket.sucursal.nombre}</p>
                <p>NIT: {ticket.sucursal.nit}</p>
                <p>{ticket.sucursal.direccion}</p>
                {ticket.sucursal.telefono && <p>Tel: {ticket.sucursal.telefono}</p>}
                <p className="mt-2 font-bold">
                  FACTURA {ticket.factura.numeroCompleto}
                  {ticket.factura.reimpresionesCount > 0 && ` (COPIA #${ticket.factura.reimpresionesCount})`}
                </p>
                {ticket.factura.estado === 'ANULADA' && (
                  <p className="mt-1 font-bold text-red-600">*** ANULADA ***</p>
                )}
              </div>

              <div className="border-b border-dashed border-slate-400 py-2">
                <p>Fecha: {formatDateTime(ticket.factura.createdAt)}</p>
                <p>Cliente: {ticket.factura.clienteNombre}</p>
                <p>NIT: {ticket.factura.clienteNit}</p>
                <p>
                  Servicio: {ticket.venta.tipoServicio}
                  {ticket.comanda?.mesaNumero ? ` (${ticket.comanda.mesaNumero})` : ''}
                </p>
                {ticket.comanda?.nombreTurno && <p>Turno/Entrega: {ticket.comanda.nombreTurno}</p>}
                <p>Atendió: {ticket.venta.cajeroNombre}</p>
              </div>

              <div className="border-b border-dashed border-slate-400 py-2">
                <div className="mb-1 flex justify-between font-bold">
                  <span>CANT / DESC</span>
                  <span>SUBTOTAL</span>
                </div>
                {ticket.venta.detalles.map((item) => (
                  <div key={item.id} className="mb-1">
                    <div className="flex justify-between">
                      <span>
                        {item.cantidad}x {item.nombrePlatillo}
                      </span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-b border-dashed border-slate-400 py-2">
                <div className="flex justify-between">
                  <span>Base Imponible:</span>
                  <span>{formatCurrency(ticket.factura.subtotalSinIva)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA {(env.IVA_RATE * 100).toFixed(0)}% incluido:</span>
                  <span>{formatCurrency(ticket.factura.ivaMonto)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL:</span>
                  <span>{formatCurrency(ticket.factura.total)}</span>
                </div>
              </div>

              <div className="pt-2 text-[11px]">
                <p>Pago: {ticket.venta.metodoPago}</p>
                {ticket.venta.metodoPago === 'EFECTIVO' && (
                  <>
                    <p>Recibido: {formatCurrency(ticket.venta.montoRecibido)}</p>
                    <p>Cambio: {formatCurrency(ticket.venta.cambio)}</p>
                  </>
                )}
                {ticket.factura.felUuid && <p className="mt-1 break-all">FEL UUID: {ticket.factura.felUuid}</p>}
                <p className="mt-2 text-center font-semibold">¡Gracias por su preferencia!</p>
              </div>
            </div>

            {/* TICKET 2: COMANDA DE COCINA */}
            {includeComanda && ticket.comanda && (
              <div className="print-page-break mx-auto w-full max-w-[320px] rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs text-slate-900 shadow-sm">
                <div className="border-b-2 border-dashed border-slate-900 pb-2 text-center">
                  <p className="text-base font-black tracking-wide">COMANDA COCINA</p>
                  <p className="text-sm font-bold">{ticket.comanda.numeroComanda}</p>
                  <p className="mt-1 text-sm font-bold uppercase">
                    {ticket.comanda.tipoServicio === 'MOSTRADOR'
                      ? 'EN MOSTRADOR'
                      : ticket.comanda.tipoServicio}
                    {ticket.comanda.mesaNumero ? ` — ${ticket.comanda.mesaNumero}` : ''}
                  </p>
                  {ticket.comanda.nombreTurno && (
                    <p className="mt-1 rounded bg-slate-900 px-2 py-0.5 text-sm font-black text-white">
                      LLAMAR A: {ticket.comanda.nombreTurno}
                    </p>
                  )}
                </div>

                <div className="border-b border-dashed border-slate-400 py-2">
                  <p>Hora: {formatDateTime(ticket.comanda.createdAt)}</p>
                  <p>Factura ref: {ticket.factura.numeroCompleto}</p>
                  <p>Mesero/Cajero: {ticket.venta.cajeroNombre}</p>
                </div>

                <div className="space-y-2 py-3">
                  {ticket.venta.detalles.map((item) => (
                    <div key={item.id} className="border-b border-dotted border-slate-300 pb-1.5">
                      <p className="text-sm font-bold">
                        [{item.cantidad}] {item.nombrePlatillo}
                      </p>
                      {item.notas && (
                        <p className="mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-slate-900">
                          NOTA: {item.notas}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
