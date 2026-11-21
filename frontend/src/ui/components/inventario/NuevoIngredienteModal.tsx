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
        <div className="grid grid-cols-3 gap-3">
          <input
            required
            type="number"
            step="0.01"
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
          <input
            type="number"
            step="0.01"
            placeholder="Precio ref / lb (Q)"
            value={ingForm.precioPorLb}
            onChange={(e) => setIngForm({ ...ingForm, precioPorLb: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
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
