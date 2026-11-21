import React, { useEffect, useState } from 'react';
import { IngredienteModel, UnidadMedida } from '../../../models';
import { Modal } from '../common/Modal';

export interface AjusteStockPayload {
  tipoAjuste: 'ENTRADA' | 'SALIDA';
  cantidad: number;
  unidad: UnidadMedida;
  motivo: string;
}

interface AjusteStockModalProps {
  target: IngredienteModel | null;
  onClose: () => void;
  onAplicar: (ingredienteId: number, payload: AjusteStockPayload) => Promise<boolean>;
}

const INITIAL_FORM = {
  tipoAjuste: 'ENTRADA' as 'ENTRADA' | 'SALIDA',
  cantidad: '',
  unidad: 'oz' as UnidadMedida,
  motivo: '',
};

export const AjusteStockModal: React.FC<AjusteStockModalProps> = ({
  target,
  onClose,
  onAplicar,
}) => {
  const [ajusteForm, setAjusteForm] = useState(INITIAL_FORM);

  useEffect(() => {
    if (target) {
      setAjusteForm(INITIAL_FORM);
    }
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const ok = await onAplicar(target.id, {
      tipoAjuste: ajusteForm.tipoAjuste,
      cantidad: Number(ajusteForm.cantidad),
      unidad: ajusteForm.unidad,
      motivo: ajusteForm.motivo,
    });
    if (ok) {
      setAjusteForm(INITIAL_FORM);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      title={`Ajuste Manual — ${target?.nombre ?? ''}`}
      onClose={onClose}
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={ajusteForm.tipoAjuste}
            onChange={(e) =>
              setAjusteForm({ ...ajusteForm, tipoAjuste: e.target.value as 'ENTRADA' | 'SALIDA' })
            }
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-bold"
          >
            <option value="ENTRADA">Entrada (+)</option>
            <option value="SALIDA">Salida (-)</option>
          </select>
          <select
            value={ajusteForm.unidad}
            onChange={(e) =>
              setAjusteForm({ ...ajusteForm, unidad: e.target.value as UnidadMedida })
            }
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="oz">Onzas (oz)</option>
            <option value="lb">Libras (lb)</option>
          </select>
        </div>
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Cantidad"
          value={ajusteForm.cantidad}
          onChange={(e) => setAjusteForm({ ...ajusteForm, cantidad: e.target.value })}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />
        <input
          required
          minLength={4}
          placeholder="Motivo del ajuste (obligatorio para auditoría)"
          value={ajusteForm.motivo}
          onChange={(e) => setAjusteForm({ ...ajusteForm, motivo: e.target.value })}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />
        <button
          type="submit"
          className="min-h-[46px] w-full rounded-xl bg-slate-900 text-sm font-bold text-white"
        >
          Aplicar Ajuste
        </button>
      </form>
    </Modal>
  );
};
