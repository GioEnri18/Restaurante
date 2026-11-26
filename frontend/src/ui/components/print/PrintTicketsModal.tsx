import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Check, Lock, Printer, X } from 'lucide-react';
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

type BloqueImpresionId = 'CAJA' | 'COCINA' | 'ENTREGA';

interface TicketHoja {
  key: string;
  etiqueta: string;
  contenido: React.ReactNode;
}

interface BloqueImpresion {
  id: BloqueImpresionId;
  titulo: string;
  subtitulo: string;
  textoBoton: string;
  /** Tarjeta única que se muestra en la vista previa del modal */
  vistaPrevia: TicketHoja;
  /** Hojas reales que se envían a la impresora térmica (cada una con corte) */
  hojasImpresion: TicketHoja[];
}

function renderFacturaContenido(ticket: TicketImprimibleModel, etiquetaCopia?: string) {
  return (
    <>
      <div className="border-b border-dashed border-slate-500 pb-2 text-center">
        <p className="text-sm font-bold uppercase">{ticket.sucursal.nombre}</p>
        <p>NIT: {ticket.sucursal.nit}</p>
        <p>{ticket.sucursal.direccion}</p>
        {ticket.sucursal.telefono && <p>Tel: {ticket.sucursal.telefono}</p>}
        <p className="mt-2 font-bold">
          FACTURA {ticket.factura.numeroCompleto}
          {ticket.factura.reimpresionesCount > 0 && ` (COPIA #${ticket.factura.reimpresionesCount})`}
        </p>
        {etiquetaCopia && <p className="text-xs font-bold uppercase">{etiquetaCopia}</p>}
        {ticket.factura.estado === 'ANULADA' && (
          <p className="mt-1 font-bold text-red-600">*** ANULADA ***</p>
        )}
      </div>

      <div className="border-b border-dashed border-slate-500 py-2">
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

      <div className="border-b border-dashed border-slate-500 py-2">
        <div className="mb-1 flex justify-between gap-2 font-bold">
          <span>CANT / DESC</span>
          <span className="shrink-0">SUBTOTAL</span>
        </div>
        {ticket.venta.detalles.map((item) => (
          <div key={item.id} className="mb-1">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words">
                {item.cantidad}x {item.nombrePlatillo}
                {!!item.cantidadCortesia && ` · ${item.cantidadCortesia} de cortesía`}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCurrency(item.subtotal)}</span>
            </div>
          </div>
        ))}
        {(ticket.factura.costoEnvio ?? 0) > 0 && (
          <div className="mt-1 border-t border-dotted border-slate-400 pt-1">
            <div className="flex items-start justify-between gap-2 font-semibold">
              <span className="min-w-0 break-words">
                Envío a domicilio
                {ticket.factura.zonaEntregaNombre ? ` (${ticket.factura.zonaEntregaNombre})` : ''}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                {formatCurrency(ticket.factura.costoEnvio ?? 0)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1 border-b border-dashed border-slate-500 py-2">
        <div className="flex justify-between gap-2">
          <span>Base Imponible:</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCurrency(ticket.factura.subtotalSinIva)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>IVA {(env.IVA_RATE * 100).toFixed(0)}% incluido:</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCurrency(ticket.factura.ivaMonto)}
          </span>
        </div>
        <div className="flex justify-between gap-2 text-sm font-bold">
          <span>TOTAL:</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCurrency(ticket.factura.total)}
          </span>
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
    </>
  );
}

function renderComandaContenido(
  ticket: TicketImprimibleModel,
  esReimpresion: boolean,
) {
  if (!ticket.comanda) return null;

  return (
    <>
      <div className="border-b-2 border-dashed border-slate-900 pb-2 text-center">
        <p className="text-base font-black tracking-wide">COMANDA COCINA</p>
        <p className="mt-0.5 text-sm font-bold">{ticket.comanda.numeroComanda}</p>
        {esReimpresion && <p className="text-xs font-bold">REIMPRESIÓN</p>}
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

      <div className="border-b border-dashed border-slate-500 py-2">
        <p>Hora: {formatDateTime(ticket.comanda.createdAt)}</p>
        <p>Ref: {ticket.entrega?.numeroPedido ?? ticket.factura.numeroCompleto}</p>
        <p>Atendió: {ticket.venta.cajeroNombre}</p>
        {ticket.comanda.zonaEntregaNombre && (
          <p className="mt-1 font-bold">Zona: {ticket.comanda.zonaEntregaNombre}</p>
        )}
        {ticket.comanda.direccionEntrega && <p>Dir: {ticket.comanda.direccionEntrega}</p>}
        {ticket.comanda.referenciaEntrega && <p>Ref entrega: {ticket.comanda.referenciaEntrega}</p>}
      </div>

      <div className="space-y-2 py-3">
        {ticket.venta.detalles.map((item) => (
          <div key={item.id} className="border-b border-dotted border-slate-400 pb-1.5">
            <p className="min-w-0 break-words text-sm font-bold">
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
          <div className="flex justify-between gap-2 border-t border-dashed border-slate-500 pt-1.5 font-bold">
            <span>ENVÍO A DOMICILIO:</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              {formatCurrency(ticket.comanda.costoEnvio ?? 0)}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function renderEntregaContenido(ticket: TicketImprimibleModel) {
  if (!ticket.entrega) return null;

  return (
    <>
      <div className="border-b-2 border-dashed border-slate-900 pb-2 text-center">
        <p className="text-base font-black tracking-wide">TICKET DE ENTREGA</p>
        <p className="text-sm font-bold">{ticket.entrega.numeroPedido}</p>
        <p className="mt-1 rounded bg-slate-900 px-2 py-0.5 text-xs font-black text-white">
          {ticket.entrega.modalidadPago === 'PREPAGADO'
            ? 'PREPAGADO · NO COBRAR'
            : `CONTRA ENTREGA · COBRAR ${formatCurrency(ticket.entrega.total)}`}
        </p>
      </div>

      <div className="space-y-0.5 border-b border-dashed border-slate-500 py-2">
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

      <div className="space-y-1 border-b border-dashed border-slate-500 py-2">
        {ticket.venta.detalles.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words">
              {item.cantidad}x {item.nombrePlatillo}
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCurrency(item.subtotal)}</span>
          </div>
        ))}
        <div className="flex items-start justify-between gap-2 border-t border-dotted border-slate-400 pt-1 font-semibold">
          <span className="min-w-0 break-words">Envío ({ticket.entrega.zonaNombre})</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCurrency(ticket.entrega.costoEnvio)}
          </span>
        </div>
      </div>

      <div className="space-y-1 pt-2">
        <div className="flex justify-between gap-2 text-sm font-black">
          <span>TOTAL:</span>
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            {formatCurrency(ticket.entrega.total)}
          </span>
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
    </>
  );
}

/**
 * Modal de vista previa e impresión térmica 80mm con bloques independientes por impresora:
 * - Bloque Caja: imprime 2 copias de la Factura (1. Cliente + corte -> 2. Copia Caja + corte)
 * - Bloque Cocina (bloqueado hasta imprimir Caja): Comanda de cocina individual (corte)
 * - Bloque Entrega (solo domicilio): Ticket de entrega para repartidor
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
  const firstPrintBtnRef = useRef<HTMLButtonElement>(null);
  const cocinaPrintBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mouseDownOnBackdropRef = useRef(false);

  const [bloqueActivoImpresion, setBloqueActivoImpresion] = useState<BloqueImpresionId | null>(null);
  const [bloquesImpresos, setBloquesImpresos] = useState<Partial<Record<BloqueImpresionId, boolean>>>({});

  onCloseRef.current = onClose;

  // Reiniciar estado de bloques impresos al cambiar de ticket
  useEffect(() => {
    setBloqueActivoImpresion(null);
    setBloquesImpresos({});
  }, [ticket]);

  const mostrarComandaCocina = Boolean(ticket?.comanda && includeComanda);
  const mostrarEntrega = Boolean(ticket?.entrega && includeEntrega);

  const bloques: BloqueImpresion[] = [];
  if (ticket) {
    if (includeFactura) {
      // En una venta normal (con comanda), el botón de Caja imprime 2 copias de la factura; en reimpresión solo 1
      const imprimirDosCopiasFactura = Boolean(includeComanda);
      const hojaCliente: TicketHoja = {
        key: 'factura-cliente',
        etiqueta: imprimirDosCopiasFactura ? 'Se imprime 2 veces (Cliente + Copia Caja)' : 'Factura del cliente',
        contenido: renderFacturaContenido(ticket),
      };
      const hojasImpresion: TicketHoja[] = imprimirDosCopiasFactura
        ? [
            hojaCliente,
            {
              key: 'factura-caja',
              etiqueta: 'Copia Caja',
              contenido: renderFacturaContenido(ticket, 'COPIA CAJA'),
            },
          ]
        : [hojaCliente];

      bloques.push({
        id: 'CAJA',
        titulo: imprimirDosCopiasFactura ? 'Factura (2 copias · Caja)' : 'Factura del cliente',
        subtitulo: imprimirDosCopiasFactura
          ? '1. Factura cliente (corte) → 2. Copia caja (corte)'
          : 'Comprobante para el cliente',
        textoBoton: imprimirDosCopiasFactura ? 'Imprimir Factura (2 copias)' : 'Imprimir Factura',
        vistaPrevia: hojaCliente,
        hojasImpresion,
      });
    }

    if (mostrarComandaCocina) {
      const hojaCocina: TicketHoja = {
        key: 'comanda-cocina',
        etiqueta: 'Comanda de cocina',
        contenido: renderComandaContenido(ticket, !includeFactura),
      };
      bloques.push({
        id: 'COCINA',
        titulo: 'Comanda de cocina',
        subtitulo: 'Impresión individual para cocina',
        textoBoton: 'Imprimir Cocina',
        vistaPrevia: hojaCocina,
        hojasImpresion: [hojaCocina],
      });
    }

    if (mostrarEntrega) {
      const hojaEntrega: TicketHoja = {
        key: 'ticket-entrega',
        etiqueta: 'Ticket de entrega',
        contenido: renderEntregaContenido(ticket),
      };
      bloques.push({
        id: 'ENTREGA',
        titulo: 'Entrega (1 ticket)',
        subtitulo: 'Ticket de entrega para repartidor',
        textoBoton: 'Imprimir Entrega',
        vistaPrevia: hojaEntrega,
        hojasImpresion: [hojaEntrega],
      });
    }
  }

  const totalBloques = bloques.length;
  const unicoBloqueId = totalBloques === 1 ? bloques[0].id : null;

  // Auto-impresión únicamente cuando hay un solo bloque (reimpresiones); con Caja + Cocina el cajero elige cada botón
  useEffect(() => {
    if (ticket && autoPrint && env.AUTO_PRINT_ENABLED && unicoBloqueId) {
      const timer = setTimeout(() => {
        flushSync(() => {
          setBloqueActivoImpresion(unicoBloqueId);
        });
        window.print();
        setBloquesImpresos((prev) => ({ ...prev, [unicoBloqueId]: true }));
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [ticket, autoPrint, unicoBloqueId]);

  useEffect(() => {
    if (!ticket) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      firstPrintBtnRef.current?.focus();
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

  const tieneBloqueCaja = bloques.some((b) => b.id === 'CAJA');

  const imprimirBloque = (bloqueId: BloqueImpresionId) => {
    if (bloqueId === 'COCINA' && tieneBloqueCaja && !bloquesImpresos.CAJA) {
      return;
    }
    // flushSync garantiza que el portal de impresión tenga exactamente las hojas del bloque antes de abrir window.print()
    flushSync(() => {
      setBloqueActivoImpresion(bloqueId);
    });
    window.print();
    setBloquesImpresos((prev) => ({ ...prev, [bloqueId]: true }));
    if (bloqueId === 'CAJA') {
      window.requestAnimationFrame(() => {
        cocinaPrintBtnRef.current?.focus();
      });
    }
  };

  // Si el usuario usa Ctrl+P sin pulsar un botón, se imprimen las hojas del primer bloque (o el último elegido)
  const bloqueParaPortal =
    bloques.find((b) => b.id === bloqueActivoImpresion) ?? bloques[0] ?? null;

  const modalWidthClass = totalBloques >= 2 ? 'max-w-4xl' : 'max-w-xl';
  const gridBloquesClass = totalBloques >= 2 ? 'md:grid-cols-2' : 'grid-cols-1';

  return (
    <>
      <div
        className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
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
          className={`flex max-h-[92vh] w-full ${modalWidthClass} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
        >
          {/* Barra superior limpia sin botón general: cada bloque tiene su botón individual */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 id={titleId} className="text-lg font-bold text-slate-900">
                {includeComanda
                  ? includeFactura
                    ? 'Factura y comanda de cocina'
                    : `Reimpresión de comanda ${ticket.comanda?.numeroComanda ?? ''}`
                  : `Reimpresión de factura ${ticket.factura.numeroCompleto}`}
              </h3>
              <p className="text-xs text-slate-600">
                {totalBloques > 1
                  ? 'Formato térmico 80 mm centrado · imprime cada bloque en su impresora sin cerrar esta ventana'
                  : 'Formato centrado para impresora térmica de 80 mm'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa de impresión"
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Bloques independientes con botón de impresión propio arriba de cada uno */}
          <div className="overflow-y-auto bg-slate-100 p-5">
            <div className={`mx-auto grid grid-cols-1 gap-5 ${gridBloquesClass}`}>
              {bloques.map((bloque, idx) => {
                const yaImpreso = Boolean(bloquesImpresos[bloque.id]);
                const bloqueBloqueado = bloque.id === 'COCINA' && tieneBloqueCaja && !bloquesImpresos.CAJA;
                return (
                  <div
                    key={bloque.id}
                    className={`flex flex-col rounded-2xl border bg-white/90 p-4 shadow-sm transition ${
                      bloqueBloqueado ? 'border-slate-200/80 opacity-65' : 'border-slate-200'
                    }`}
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900">{bloque.titulo}</h4>
                          {yaImpreso && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <Check className="h-3 w-3" aria-hidden="true" />
                              Impreso
                            </span>
                          )}
                          {bloqueBloqueado && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              <Lock className="h-3 w-3" aria-hidden="true" />
                              Imprime Factura primero
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{bloque.subtitulo}</p>
                      </div>

                      <button
                        ref={
                          bloque.id === 'COCINA'
                            ? cocinaPrintBtnRef
                            : idx === 0
                              ? firstPrintBtnRef
                              : undefined
                        }
                        type="button"
                        disabled={bloqueBloqueado}
                        onClick={() => imprimirBloque(bloque.id)}
                        className={`inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold shadow-sm transition ${
                          bloqueBloqueado
                            ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 shadow-none'
                            : yaImpreso
                              ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'bg-brand-700 text-white hover:bg-brand-800'
                        }`}
                      >
                        {bloqueBloqueado ? (
                          <Lock className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Printer className="h-4 w-4" aria-hidden="true" />
                        )}
                        {yaImpreso ? `Volver a ${bloque.textoBoton.toLowerCase()}` : bloque.textoBoton}
                      </button>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        {bloque.vistaPrevia.etiqueta}
                      </span>
                      <div className="mx-auto w-full max-w-[300px] rounded-xl border border-slate-300 bg-white p-3.5 font-mono text-xs text-slate-900 shadow-sm">
                        {bloque.vistaPrevia.contenido}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Portal limpio directo en body: solo contiene las hojas del bloque seleccionado */}
      {typeof document !== 'undefined' &&
        bloqueParaPortal &&
        createPortal(
          <div className="print-only-root" aria-hidden="true">
            {bloqueParaPortal.hojasImpresion.map((hoja) => (
              <section key={hoja.key} className="print-ticket-page" data-ticket-tipo={hoja.key}>
                {hoja.contenido}
              </section>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};
