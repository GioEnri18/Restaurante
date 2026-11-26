import React, { useEffect, useId, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { env } from '../../../config/env';
import { TicketImprimibleModel } from '../../../models';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';

interface PrintTicketsModalProps {
  ticket: TicketImprimibleModel | null;
  includeFactura?: boolean;
  includeComanda?: boolean;
  includeEntrega?: boolean;
  autoPrint?: boolean;
  onClose: () => void;
}

/**
 * Modal de vista previa e impresión térmica 80mm para FACTURA, COMANDA DE COCINA y TICKET DE ENTREGA.
 * Cuando se confirma una venta y VITE_AUTO_PRINT_ENABLED=true, dispara window.print() automáticamente.
 */
export const PrintTicketsModal: React.FC<PrintTicketsModalProps> = ({
  ticket,
  includeFactura = true,
  includeComanda = true,
  includeEntrega = true,
  autoPrint = false,
  onClose,
}) => {
  const titleId = useId();
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mouseDownOnBackdropRef = useRef(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (ticket && autoPrint && env.AUTO_PRINT_ENABLED) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [ticket, autoPrint]);

  useEffect(() => {
    if (!ticket) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      printBtnRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) prev.focus();
      previousFocusRef.current = null;
    };
  }, [ticket]);

  if (!ticket) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
          onClose();
        }
        mouseDownOnBackdropRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Barra superior (oculta al imprimir) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 id={titleId} className="text-lg font-bold text-slate-900">
              {includeComanda
                ? includeFactura ? 'Factura y comanda de cocina' : `Reimpresión de comanda ${ticket.comanda?.numeroComanda ?? ''}`
                : `Reimpresión de factura ${ticket.factura.numeroCompleto}`}
            </h3>
            <p className="text-xs text-slate-600">Formato optimizado para impresora térmica de 80 mm</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              ref={printBtnRef}
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
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
            {includeFactura && <div className="mx-auto w-full max-w-[320px] rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs text-slate-900 shadow-sm">
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
                {ticket.factura.zonaEntregaNombre && <p>Zona entrega: {ticket.factura.zonaEntregaNombre}</p>}
                {ticket.venta.tipoServicio === 'DELIVERY' && ticket.factura.clienteDireccion && (
                  <p>Dirección: {ticket.factura.clienteDireccion}</p>
                )}
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
                        {!!item.cantidadCortesia && ` · ${item.cantidadCortesia} de cortesía`}
                      </span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
                {(ticket.factura.costoEnvio ?? 0) > 0 && (
                  <div className="mt-1 border-t border-dotted border-slate-300 pt-1">
                    <div className="flex justify-between font-semibold">
                      <span>
                        Envío a domicilio
                        {ticket.factura.zonaEntregaNombre ? ` (${ticket.factura.zonaEntregaNombre})` : ''}
                      </span>
                      <span>{formatCurrency(ticket.factura.costoEnvio ?? 0)}</span>
                    </div>
                  </div>
                )}
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

              <div className="pt-2 text-xs">
                <p>Pago: {ticket.venta.metodoPago === 'SIN_COBRO' ? 'Cortesía · sin cobro' : ticket.venta.metodoPago}</p>
                {ticket.venta.metodoPago === 'EFECTIVO' && (
                  <>
                    <p>Recibido: {formatCurrency(ticket.venta.montoRecibido)}</p>
                    <p>Cambio: {formatCurrency(ticket.venta.cambio)}</p>
                  </>
                )}
                {ticket.factura.felUuid && <p className="mt-1 break-all">FEL UUID: {ticket.factura.felUuid}</p>}
                <p className="mt-2 text-center font-semibold">¡Gracias por su preferencia!</p>
              </div>
            </div>}

            {/* TICKET 2: COMANDA DE COCINA */}
            {includeComanda && ticket.comanda && (
              <div className="print-page-break mx-auto w-full max-w-[320px] rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs text-slate-900 shadow-sm">
                <div className="border-b-2 border-dashed border-slate-900 pb-2 text-center">
                  <p className="text-base font-black tracking-wide">COMANDA COCINA</p>
                  <p className="text-sm font-bold">{ticket.comanda.numeroComanda}</p>
                  {!includeFactura && <p className="text-xs font-bold">REIMPRESIÓN</p>}
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
                  <p>Ref: {ticket.entrega?.numeroPedido ?? ticket.factura.numeroCompleto}</p>
                  <p>Atendió: {ticket.venta.cajeroNombre}</p>
                  {ticket.comanda.zonaEntregaNombre && (
                    <p className="mt-1 font-bold">Zona: {ticket.comanda.zonaEntregaNombre}</p>
                  )}
                  {ticket.comanda.direccionEntrega && (
                    <p>Dir: {ticket.comanda.direccionEntrega}</p>
                  )}
                  {ticket.comanda.referenciaEntrega && (
                    <p>Ref entrega: {ticket.comanda.referenciaEntrega}</p>
                  )}
                </div>

                <div className="space-y-2 py-3">
                  {ticket.venta.detalles.map((item) => (
                    <div key={item.id} className="border-b border-dotted border-slate-300 pb-1.5">
                      <p className="text-sm font-bold">
                        [{item.cantidad}] {item.nombrePlatillo}
                        {!!item.cantidadCortesia && ` · ${item.cantidadCortesia} de cortesía`}
                      </p>
                      {item.notas && (
                        <p className="mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-slate-900">
                          NOTA: {item.notas}
                        </p>
                      )}
                    </div>
                  ))}
                  {(ticket.comanda.costoEnvio ?? 0) > 0 && (
                    <div className="flex justify-between border-t border-dashed border-slate-400 pt-1.5 font-bold">
                      <span>ENVÍO A DOMICILIO:</span>
                      <span>{formatCurrency(ticket.comanda.costoEnvio ?? 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TICKET 3: TICKET DE ENTREGA PARA REPARTIDOR (Servicio a Domicilio) */}
            {includeEntrega && ticket.entrega && (
              <div className="print-page-break mx-auto w-full max-w-[320px] rounded-xl border border-slate-300 bg-white p-4 font-mono text-xs text-slate-900 shadow-sm">
                <div className="border-b-2 border-dashed border-slate-900 pb-2 text-center">
                  <p className="text-base font-black tracking-wide">TICKET DE ENTREGA</p>
                  <p className="text-sm font-bold">{ticket.entrega.numeroPedido}</p>
                  <p className="mt-1 rounded bg-slate-900 px-2 py-0.5 text-xs font-black text-white">
                    {ticket.entrega.modalidadPago === 'PREPAGADO'
                      ? 'PREPAGADO · NO COBRAR'
                      : `CONTRA ENTREGA · COBRAR ${formatCurrency(ticket.entrega.total)}`}
                  </p>
                </div>

                <div className="space-y-0.5 border-b border-dashed border-slate-400 py-2">
                  <p className="font-bold">Cliente: {ticket.entrega.clienteNombre}</p>
                  <p>Tel: {ticket.entrega.clienteTelefono}</p>
                  <p className="font-bold">Zona: {ticket.entrega.zonaNombre}</p>
                  <p>Dir: {ticket.entrega.direccion}</p>
                  {ticket.entrega.referencia && <p>Ref: {ticket.entrega.referencia}</p>}
                  {ticket.entrega.observaciones && (
                    <p className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold">
                      OBS: {ticket.entrega.observaciones}
                    </p>
                  )}
                </div>

                <div className="space-y-1 border-b border-dashed border-slate-400 py-2">
                  {ticket.venta.detalles.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span>
                        {item.cantidad}x {item.nombrePlatillo}
                      </span>
                      <span>{formatCurrency(item.subtotal)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-dotted border-slate-300 pt-1 font-semibold">
                    <span>Envío ({ticket.entrega.zonaNombre})</span>
                    <span>{formatCurrency(ticket.entrega.costoEnvio)}</span>
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-sm font-black">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(ticket.entrega.total)}</span>
                  </div>
                  {ticket.entrega.modalidadPago === 'CONTRA_ENTREGA' && (
                    <>
                      <p>Método esperado: {ticket.entrega.metodoPagoEsperado}</p>
                      {ticket.entrega.montoConQuePaga !== null && ticket.entrega.montoConQuePaga > ticket.entrega.total && (
                        <p className="font-bold">
                          Paga con {formatCurrency(ticket.entrega.montoConQuePaga)} · Llevar vuelto:{' '}
                          {formatCurrency(ticket.entrega.montoConQuePaga - ticket.entrega.total)}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
