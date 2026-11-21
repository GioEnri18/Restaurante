import React, { useEffect, useState } from 'react';
import { PlatilloModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
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
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          value={nuevoPrecio}
          onChange={(e) => setNuevoPrecio(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base font-bold"
        />
        <input
          required
          placeholder="Motivo del cambio de precio"
          value={motivoPrecio}
          onChange={(e) => setMotivoPrecio(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />
        <button
          type="submit"
          className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
        >
          Guardar nuevo precio
        </button>
      </form>
    </Modal>
  );
};
