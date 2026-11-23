import React, { useEffect, useState } from 'react';
import { Banknote, CreditCard, Check } from 'lucide-react';
import { env } from '../../../config/env';
import {
  CartItemModel,
  MesaModel,
  MetodoPago,
  TicketImprimibleModel,
  TipoServicio,
} from '../../../models';
import { ventasService } from '../../../services/ventas.service';
import { formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Modal } from '../common/Modal';

interface CobroModalProps {
  open: boolean;
  onClose: () => void;
  idempotencyKey: string;
  habilitarMesas: boolean;
  tipoServicio: TipoServicio;
  mesaId: number | null;
  mesaSeleccionada: MesaModel | null;
  nombreTurno: string;
  items: CartItemModel[];
  totals: {
    subtotalSinIva: number;
    ivaMonto: number;
    total: number;
    totalUnidades: number;
  };
  onVentaConfirmada: (ticket: TicketImprimibleModel) => Promise<void> | void;
}

export const CobroModal: React.FC<CobroModalProps> = ({
  open,
  onClose,
  idempotencyKey,
  habilitarMesas,
  tipoServicio,
  mesaId,
  mesaSeleccionada,
  nombreTurno,
  items,
  totals,
  onVentaConfirmada,
}) => {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [clienteNit, setClienteNit] = useState('CF');
  const [clienteNombre, setClienteNombre] = useState('Consumidor Final');
  const [clienteDireccion, setClienteDireccion] = useState('Ciudad');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCheckoutError(null);
      setMetodoPago('EFECTIVO');
      setMontoRecibido(totals.total.toFixed(2));
      setReferenciaPago('');
      setClienteNit('CF');
      setClienteNombre(nombreTurno.trim() || 'Consumidor Final');
      setClienteDireccion('Ciudad');
    }
  }, [open, idempotencyKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const recibidoNum = Number(montoRecibido || 0);
  const cambioCalculado = Math.max(0, Math.round((recibidoNum - totals.total) * 100) / 100);

  const handleConfirmarVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setCheckoutError(null);

    if (habilitarMesas && tipoServicio === 'MESA' && !mesaId) {
      setCheckoutError('Selecciona una mesa para el servicio en mesa');
      return;
    }

    if (metodoPago === 'EFECTIVO' && recibidoNum < totals.total) {
      setCheckoutError('El monto recibido en efectivo es menor al total a cobrar');
      return;
    }

    if (metodoPago === 'TARJETA' && !referenciaPago.trim()) {
      setCheckoutError('Ingresa el número de autorización / voucher POS para pagos con tarjeta');
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await ventasService.confirmarVenta({
        idempotencyKey: idempotencyKey || undefined,
        tipoServicio: habilitarMesas ? tipoServicio : tipoServicio === 'MESA' ? 'MOSTRADOR' : tipoServicio,
        mesaId: habilitarMesas && tipoServicio === 'MESA' ? mesaId : null,
        nombreTurno: nombreTurno.trim() || undefined,
        metodoPago,
        montoRecibido: metodoPago === 'EFECTIVO' ? recibidoNum : totals.total,
        referenciaPago: metodoPago === 'TARJETA' ? referenciaPago.trim() : undefined,
        clienteNit: clienteNit.trim() || 'CF',
        clienteNombre: clienteNombre.trim() || 'Consumidor Final',
        clienteDireccion: clienteDireccion.trim() || 'Ciudad',
        items: items.map((i) => ({
          platilloId: i.platillo.id,
          cantidad: i.cantidad,
          notas: i.notas.trim() || undefined,
        })),
      });

      await onVentaConfirmada(ticket);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'No se pudo confirmar la venta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Cobro en Mostrador · Factura y Comanda Automática"
      onClose={onClose}
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleConfirmarVenta} className="space-y-4">
        {checkoutError && <Alert type="error" message={checkoutError} />}

        <div className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white">
          <div>
            <p className="text-xs text-slate-400">
              {tipoServicio === 'MOSTRADOR'
                ? 'En Mostrador'
                : tipoServicio === 'LLEVAR'
                  ? 'Para Llevar'
                  : mesaSeleccionada
                    ? `Mesa ${mesaSeleccionada.numero}`
                    : tipoServicio}
              {nombreTurno.trim() ? ` · ${nombreTurno.trim()}` : ''} · {totals.totalUnidades} ítem(s)
            </p>
            <p className="text-sm font-medium text-slate-200">Total con IVA 12% incluido</p>
          </div>
          <span className="text-3xl font-black text-brand-400">{formatCurrency(totals.total)}</span>
        </div>

        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
              1. Datos de la factura (opcional)
            </p>
            <button
              type="button"
              onClick={() => {
                setClienteNit('CF');
                setClienteNombre('Consumidor Final');
                setClienteDireccion('Ciudad');
              }}
              className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 ring-1 ring-slate-200 hover:bg-brand-50"
            >
              Usar Consumidor Final (CF)
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Si el cliente no pide factura con NIT, puedes dejar «Consumidor Final» y pasar directo al cobro.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">NIT del cliente</label>
              <input
                type="text"
                value={clienteNit}
                onChange={(e) => setClienteNit(e.target.value)}
                placeholder="CF o número de NIT"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Nombre en factura</label>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Consumidor Final"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-600">Dirección</label>
              <input
                type="text"
                value={clienteDireccion}
                onChange={(e) => setClienteDireccion(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-extrabold uppercase tracking-wider text-slate-600">
            2. ¿Cómo paga el cliente?
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMetodoPago('EFECTIVO')}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold transition ${metodoPago === 'EFECTIVO'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
              <Banknote className="h-5 w-5" />
              Efectivo
              {metodoPago === 'EFECTIVO' && <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMetodoPago('TARJETA')}
              className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold transition ${metodoPago === 'TARJETA'
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
              <CreditCard className="h-5 w-5" />
              Tarjeta
              {metodoPago === 'TARJETA' && <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {metodoPago === 'EFECTIVO' ? (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label htmlFor="cobro-efectivo" className="mb-1 block text-xs font-bold text-slate-600">
                Efectivo recibido ({env.CURRENCY_SYMBOL})
              </label>
              <input
                type="number"
                id="cobro-efectivo"
                step="0.01"
                min={totals.total}
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-xl font-black text-slate-900"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[totals.total, 20, 50, 100, 200].map((billete, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMontoRecibido(billete.toFixed(2))}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                >
                  {idx === 0 ? 'Pago exacto' : formatCurrency(billete)}
                </button>
              ))}
            </div>
            <div
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${recibidoNum < totals.total
                  ? 'bg-red-100 text-red-900'
                  : 'bg-emerald-100 text-emerald-950'
                }`}
            >
              <span className="text-sm font-bold">
                {recibidoNum < totals.total ? 'Falta por recibir:' : 'Vuelto a entregar:'}
              </span>
              <span className="text-2xl font-black">
                {formatCurrency(
                  recibidoNum < totals.total ? totals.total - recibidoNum : cambioCalculado,
                )}
              </span>
            </div>
            {recibidoNum >= totals.total && (
              <p className="text-sm text-slate-600">
                Entra a la gaveta después del vuelto <strong>{formatCurrency(totals.total)}</strong>
              </p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor="cobro-voucher" className="mb-1 block text-xs font-bold text-slate-600">
              Número de voucher o autorización
            </label>
            <input
              required
              type="text"
              id="cobro-voucher"
              maxLength={80}
              value={referenciaPago}
              onChange={(e) => setReferenciaPago(e.target.value)}
              placeholder="Ej. AUTH-482910"
              className="min-h-[46px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
            />
            <p className="mt-1 text-xs text-slate-600">Copia el número impreso por la terminal. No escribas el número de la tarjeta.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[48px] rounded-xl bg-emerald-600 px-6 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting ? 'Procesando venta...' : 'Confirmar e Imprimir'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
