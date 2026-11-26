import React, { useEffect, useState } from 'react';
import { Banknote, CreditCard } from 'lucide-react';
import { env } from '../../../config/env';
import { PedidoDomicilioModel, TicketImprimibleModel } from '../../../models';
import { domiciliosService } from '../../../services/domicilios.service';
import { formatCurrency } from '../../../utils/formatters';
import { generarUuid } from '../../../utils/idempotency';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

interface LiquidarPedidoModalProps {
  pedido: PedidoDomicilioModel | null;
  onClose: () => void;
  onLiquidado: (resultado: {
    pedido: PedidoDomicilioModel;
    diferenciaLiquidacion: number;
    ticket?: TicketImprimibleModel;
  }) => Promise<void> | void;
}

/**
 * Modal de liquidación en caja para pedidos CONTRA_ENTREGA ya ENTREGADOS.
 * Registra efectivo entregado por el repartidor (con alerta de diferencia) o voucher de tarjeta.
 */
export const LiquidarPedidoModal: React.FC<LiquidarPedidoModalProps> = ({
  pedido,
  onClose,
  onLiquidado,
}) => {
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pedido) return;
    setIdempotencyKey(generarUuid());
    setMetodoPago(pedido.metodoPagoEsperado === 'TARJETA' ? 'TARJETA' : 'EFECTIVO');
    setMontoRecibido(pedido.total.toFixed(2));
    setReferenciaPago('');
    setObservaciones('');
    setError(null);
  }, [pedido]);

  if (!pedido) return null;

  const montoNum = Number(montoRecibido);
  const diferencia =
    metodoPago === 'EFECTIVO' && Number.isFinite(montoNum)
      ? Math.round((montoNum - pedido.total) * 100) / 100
      : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (metodoPago === 'EFECTIVO' && (!Number.isFinite(montoNum) || montoNum < 0)) {
      setError('Ingresa un monto recibido válido.');
      return;
    }
    if (metodoPago === 'TARJETA' && !referenciaPago.trim()) {
      setError('Ingresa la referencia o número de voucher de la terminal.');
      return;
    }
    if (diferencia !== 0 && observaciones.trim().length < 5) {
      setError('Al existir diferencia de efectivo debes ingresar una observación (mín. 5 caracteres).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await domiciliosService.liquidarPedido(pedido.id, {
        idempotencyKey,
        metodoPago,
        ...(metodoPago === 'EFECTIVO' ? { montoRecibidoRepartidor: montoNum } : {}),
        ...(metodoPago === 'TARJETA' ? { referenciaPago: referenciaPago.trim() } : {}),
        observaciones: observaciones.trim() || null,
      });
      await onLiquidado(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo liquidar el pedido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={Boolean(pedido)} onClose={onClose} title={`Liquidar ${pedido.numeroPedido}`} maxWidthClass="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Cliente:</span>
            <strong className="text-slate-900">{pedido.clienteNombre}</strong>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-600">Repartidor:</span>
            <strong className="text-slate-900">{pedido.repartidor?.nombreCompleto ?? '—'}</strong>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-slate-600">Platillos + Envío ({pedido.zonaNombre}):</span>
            <span>
              {formatCurrency(pedido.subtotalPlatillos)} + {formatCurrency(pedido.costoEnvio)}
            </span>
          </div>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-black text-brand-700">
            <span>Total a liquidar:</span>
            <span>{formatCurrency(pedido.total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setMetodoPago('EFECTIVO')}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
              metodoPago === 'EFECTIVO'
                ? 'border-brand-700 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Efectivo
          </button>
          <button
            type="button"
            onClick={() => setMetodoPago('TARJETA')}
            className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
              metodoPago === 'TARJETA'
                ? 'border-brand-700 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Tarjeta
          </button>
        </div>

        {metodoPago === 'EFECTIVO' ? (
          <div className="space-y-3">
            <Field label={`Efectivo entregado por el repartidor (${env.CURRENCY_SYMBOL})`} required>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3 text-xl font-black text-slate-900"
              />
            </Field>
            {diferencia !== 0 && (
              <Alert
                type="warning"
                message={
                  diferencia < 0
                    ? `Faltante de ${formatCurrency(Math.abs(diferencia))} respecto al total. Se registrará en caja y auditoría.`
                    : `Excedente de ${formatCurrency(diferencia)} respecto al total. Se registrará en caja y auditoría.`
                }
              />
            )}
          </div>
        ) : (
          <Field label="Número de voucher / autorización POS" required>
            <input
              type="text"
              required
              maxLength={80}
              value={referenciaPago}
              onChange={(e) => setReferenciaPago(e.target.value)}
              placeholder="Ej. AUTH-982341"
              className="min-h-[46px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
            />
          </Field>
        )}

        <Field
          label={diferencia !== 0 ? 'Justificación de la diferencia (obligatoria)' : 'Observaciones (opcional)'}
          required={diferencia !== 0}
        >
          <input
            type="text"
            required={diferencia !== 0}
            minLength={diferencia !== 0 ? 5 : undefined}
            maxLength={300}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder={
              diferencia !== 0
                ? 'Explica el motivo del faltante o excedente del repartidor...'
                : 'Nota opcional de liquidación...'
            }
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-[46px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[46px] rounded-xl bg-emerald-600 px-6 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Liquidando...' : 'Liquidar y emitir factura'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
