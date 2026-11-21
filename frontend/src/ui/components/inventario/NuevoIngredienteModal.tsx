import React, { useState } from 'react';
import { ProveedorModel, UnidadMedida } from '../../../models';
import { Modal } from '../common/Modal';

export interface NuevoIngredientePayload {
  codigo: string;
  nombre: string;
  proveedorId: number | null;
  stockMinimo: number;
  unidadStockMinimo: UnidadMedida;
  stockInicial: number;
  unidadStockInicial: UnidadMedida;
  precioPorLb: number;
}

interface NuevoIngredienteModalProps {
  open: boolean;
  proveedores: ProveedorModel[];
  onClose: () => void;
  onGuardar: (payload: NuevoIngredientePayload) => Promise<boolean>;
}

const INITIAL_FORM = {
  codigo: '',
  nombre: '',
  proveedorId: '',
  stockMinimo: '2',
  unidadStockMinimo: 'lb' as UnidadMedida,
  stockInicial: '0',
  unidadStockInicial: 'lb' as UnidadMedida,
  precioPorLb: '0',
};

export const NuevoIngredienteModal: React.FC<NuevoIngredienteModalProps> = ({
  open,
  proveedores,
  onClose,
  onGuardar,
}) => {
  const [ingForm, setIngForm] = useState(INITIAL_FORM);
  const tieneExistenciasIniciales = Number(ingForm.stockInicial) > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar({
      codigo: ingForm.codigo,
      nombre: ingForm.nombre,
      proveedorId: ingForm.proveedorId ? Number(ingForm.proveedorId) : null,
      stockMinimo: Number(ingForm.stockMinimo),
      unidadStockMinimo: ingForm.unidadStockMinimo,
      stockInicial: Number(ingForm.stockInicial || 0),
      unidadStockInicial: ingForm.unidadStockInicial,
      precioPorLb: Number(ingForm.precioPorLb || 0),
    });
    if (ok) {
      setIngForm(INITIAL_FORM);
    }
  };

  return (
    <Modal open={open} title="Nuevo Ingrediente" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            placeholder="Código (ej. ING-020)"
            value={ingForm.codigo}
            onChange={(e) => setIngForm({ ...ingForm, codigo: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
          <input
            required
            placeholder="Nombre del ingrediente"
            value={ingForm.nombre}
            onChange={(e) => setIngForm({ ...ingForm, nombre: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
        <select
          value={ingForm.proveedorId}
          onChange={(e) => setIngForm({ ...ingForm, proveedorId: e.target.value })}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        >
          <option value="">Proveedor principal (opcional)</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            required
            type="number"
            min="0"
            step="0.01"
            aria-label="Stock mínimo"
            placeholder="Stock mínimo"
            value={ingForm.stockMinimo}
            onChange={(e) => setIngForm({ ...ingForm, stockMinimo: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
          <select
            value={ingForm.unidadStockMinimo}
            onChange={(e) =>
              setIngForm({ ...ingForm, unidadStockMinimo: e.target.value as UnidadMedida })
            }
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="lb">Libras (lb)</option>
            <option value="oz">Onzas (oz)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span>Stock inicial</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={ingForm.stockInicial}
              onChange={(e) => setIngForm({ ...ingForm, stockInicial: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Unidad del stock inicial</span>
            <select
              value={ingForm.unidadStockInicial}
              onChange={(e) =>
                setIngForm({ ...ingForm, unidadStockInicial: e.target.value as UnidadMedida })
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="lb">Libras (lb)</option>
              <option value="oz">Onzas (oz)</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>Costo inicial por libra (Q)</span>
          <input
            type="number"
            min={tieneExistenciasIniciales ? '0.01' : '0'}
            required={tieneExistenciasIniciales}
            step="0.01"
            value={ingForm.precioPorLb}
            onChange={(e) => setIngForm({ ...ingForm, precioPorLb: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
        >
          Guardar Ingrediente
        </button>
      </form>
    </Modal>
  );
};
