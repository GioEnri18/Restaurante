import React, { useEffect, useState } from 'react';
import { env } from '../../../config/env';
import { PlatilloModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

interface CambiarPrecioModalProps {
  target: PlatilloModel | null;
  onClose: () => void;
  onGuardar: (platilloId: number, precioVenta: number, motivo: string) => Promise<void>;
}

export const CambiarPrecioModal: React.FC<CambiarPrecioModalProps> = ({
  target,
  onClose,
  onGuardar,
}) => {
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [motivoPrecio, setMotivoPrecio] = useState('');

  useEffect(() => {
    if (target) {
      setNuevoPrecio(target.precioRegular > 0 ? String(target.precioRegular) : '');
      setMotivoPrecio('');
    }
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    await onGuardar(
      target.id,
      Number(nuevoPrecio),
      motivoPrecio || 'Actualización de precio',
    );
  };

  return (
    <Modal
      open={Boolean(target)}
      title={`Cambiar precio — ${target?.nombre ?? ''}`}
      onClose={onClose}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-slate-600">
          Precio actual: <strong>{target && target.precioRegular > 0 ? formatCurrency(target.precioRegular) : 'Pendiente'}</strong>
        </p>
        <Field label={`Nuevo precio de venta (${env.CURRENCY_SYMBOL})`} required>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={nuevoPrecio}
            onChange={(e) => setNuevoPrecio(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base font-bold"
          />
        </Field>
        <Field label="Motivo del cambio de precio" required>
          <input
            placeholder="Motivo del cambio de precio"
            value={motivoPrecio}
            onChange={(e) => setMotivoPrecio(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        <button
          type="submit"
          className="min-h-[46px] w-full rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800"
        >
          Guardar nuevo precio
        </button>
      </form>
    </Modal>
  );
};
