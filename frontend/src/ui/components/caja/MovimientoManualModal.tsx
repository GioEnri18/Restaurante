import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

const CONCEPTOS_EGRESO = [
  'Compra de hielo / insumo menor',
  'Pago de propinas / mensajería',
  'Retiro parcial a caja fuerte',
  'Gasto operativo de cocina',
];

const CONCEPTOS_INGRESO = [
  'Refuerzo de sencillo / cambio',
  'Ingreso adicional en efectivo',
  'Reposición de fondo de caja',
];

interface MovimientoManualModalProps {
  open: boolean;
  onClose: () => void;
  onGuardar: (payload: {
    tipo: 'INGRESO_MANUAL' | 'EGRESO_MANUAL';
    monto: number;
    descripcion: string;
  }) => Promise<boolean>;
}

export const MovimientoManualModal: React.FC<MovimientoManualModalProps> = ({
  open,
  onClose,
  onGuardar,
}) => {
  const [movForm, setMovForm] = useState({
    tipo: 'EGRESO_MANUAL' as 'INGRESO_MANUAL' | 'EGRESO_MANUAL',
    monto: '',
    descripcion: '',
  });

  useEffect(() => {
    if (open) {
      setMovForm({ tipo: 'EGRESO_MANUAL', monto: '', descripcion: '' });
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar({
      tipo: movForm.tipo,
      monto: Number(movForm.monto),
      descripcion: movForm.descripcion,
    });
    if (ok) {
      setMovForm({ tipo: 'EGRESO_MANUAL', monto: '', descripcion: '' });
    }
  };

  return (
    <Modal
      open={open}
      title="Registrar Ingreso o Egreso de Caja"
      onClose={onClose}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMovForm({ ...movForm, tipo: 'EGRESO_MANUAL', descripcion: '' })}
            className={`flex min-h-[50px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
              movForm.tipo === 'EGRESO_MANUAL'
                ? 'border-red-600 bg-red-50 text-red-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <ArrowDownCircle className="h-5 w-5" aria-hidden="true" />
            Egreso / Salida
          </button>
          <button
            type="button"
            onClick={() => setMovForm({ ...movForm, tipo: 'INGRESO_MANUAL', descripcion: '' })}
            className={`flex min-h-[50px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
              movForm.tipo === 'INGRESO_MANUAL'
                ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <ArrowUpCircle className="h-5 w-5" aria-hidden="true" />
            Ingreso / Entrada
          </button>
        </div>

        <Field label="Monto (Q)" required>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={movForm.monto}
            onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-black"
          />
        </Field>

        <div>
          <Field label="Descripción / Concepto" required>
            <input
              required
              minLength={3}
              placeholder="Describe el motivo del movimiento..."
              value={movForm.descripcion}
              onChange={(e) => setMovForm({ ...movForm, descripcion: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(movForm.tipo === 'EGRESO_MANUAL' ? CONCEPTOS_EGRESO : CONCEPTOS_INGRESO).map(
              (sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setMovForm({ ...movForm, descripcion: sug })}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                >
                  {sug}
                </button>
              ),
            )}
          </div>
        </div>

        <button
          type="submit"
          className="min-h-[48px] w-full rounded-xl bg-slate-900 text-sm font-extrabold text-white hover:bg-slate-800"
        >
          Guardar Movimiento en Caja
        </button>
      </form>
    </Modal>
  );
};
