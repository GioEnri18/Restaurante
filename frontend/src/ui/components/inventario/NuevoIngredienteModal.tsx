import React, { useState } from 'react';
import { ProveedorModel, UnidadMedida } from '../../../models';
import { mensajeErrorFormulario } from '../../../services/httpClient';
import { lbToOzPreview } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
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
  onGuardar: (payload: NuevoIngredientePayload) => Promise<void>;
}

const INITIAL_FORM = {
  codigo: '',
  nombre: '',
  proveedorId: '',
  stockMinimo: '2',
  unidadStockMinimo: 'lb' as UnidadMedida,
  stockInicial: '0',
  unidadStockInicial: 'lb' as UnidadMedida,
  precioPorLb: '',
};
const CAMPO = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';
const ETIQUETA = 'block space-y-1 text-sm font-semibold text-slate-700';

export const NuevoIngredienteModal: React.FC<NuevoIngredienteModalProps> = ({
  open,
  proveedores,
  onClose,
  onGuardar,
}) => {
  const [ingForm, setIngForm] = useState(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const tieneExistenciasIniciales = Number(ingForm.stockInicial) > 0;
  const onzasIniciales = ingForm.unidadStockInicial === 'lb'
    ? lbToOzPreview(Number(ingForm.stockInicial))
    : Number(ingForm.stockInicial);

  const cerrar = () => {
    setError(null);
    setIngForm(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    const codigo = ingForm.codigo.trim();
    const nombre = ingForm.nombre.trim();
    if (codigo.length < 2 || nombre.length < 2) {
      setError('El código y el nombre deben tener al menos 2 caracteres.');
      return;
    }
    const payload = {
      codigo,
      nombre,
      proveedorId: ingForm.proveedorId ? Number(ingForm.proveedorId) : null,
      stockMinimo: Number(ingForm.stockMinimo),
      unidadStockMinimo: ingForm.unidadStockMinimo,
      stockInicial: Number(ingForm.stockInicial || 0),
      unidadStockInicial: ingForm.unidadStockInicial,
      precioPorLb: Number(ingForm.precioPorLb || 0),
    };
    if (!Number.isFinite(payload.precioPorLb) || payload.precioPorLb < 0.01) {
      setError('Indica un costo por libra de al menos Q0.01.');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await onGuardar(payload);
      cerrar();
    } catch (err) {
      setError(mensajeErrorFormulario(err, 'No se pudo crear el ingrediente'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} title="Nuevo Ingrediente" onClose={() => { if (!guardando) cerrar(); }}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={guardando} className="space-y-3">
          <legend className="mb-2 text-base font-bold text-slate-900">Datos del ingrediente</legend>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className={ETIQUETA}>
              <span>Nombre</span>
              <input required maxLength={120} placeholder="Ej. Harina de trigo" value={ingForm.nombre}
                onChange={(e) => setIngForm({ ...ingForm, nombre: e.target.value })} className={CAMPO} />
            </label>
            <label className={ETIQUETA}>
              <span>Código único</span>
              <input required maxLength={30} placeholder="Ej. ING-020" value={ingForm.codigo}
                onChange={(e) => setIngForm({ ...ingForm, codigo: e.target.value })} className={CAMPO} />
            </label>
          </div>
          <label className={ETIQUETA}>
            <span>Proveedor principal (opcional)</span>
            <select value={ingForm.proveedorId} onChange={(e) => setIngForm({ ...ingForm, proveedorId: e.target.value })}
              className={CAMPO}>
              <option value="">Sin proveedor asignado</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        </fieldset>

        <fieldset disabled={guardando} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-1 text-base font-bold text-slate-900">Existencias y costo</legend>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] gap-2">
            <label className={ETIQUETA}>
              <span>Stock inicial</span>
              <input type="number" min="0" step="0.0001" value={ingForm.stockInicial}
                onChange={(e) => setIngForm({ ...ingForm, stockInicial: e.target.value })} className={CAMPO} />
            </label>
            <label className={ETIQUETA}>
              <span>Unidad de stock inicial</span>
              <select value={ingForm.unidadStockInicial}
                onChange={(e) => setIngForm({ ...ingForm, unidadStockInicial: e.target.value as UnidadMedida })}
                className={CAMPO}>
                <option value="lb">Libras (lb)</option>
                <option value="oz">Onzas (oz)</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-600">
            {tieneExistenciasIniciales ? `Se registrarán ${onzasIniciales} oz al guardar.` : 'Deja el stock en 0 si registrarás una compra después.'}
          </p>
          <label className={ETIQUETA}>
            <span>Costo por libra (Q)</span>
            <input type="number" step="0.01" max="99999999.99" min="0.01" required
              value={ingForm.precioPorLb} aria-describedby="ingrediente-costo-ayuda"
              onChange={(e) => setIngForm({ ...ingForm, precioPorLb: e.target.value })} className={CAMPO} />
          </label>
          <p id="ingrediente-costo-ayuda" className="text-xs text-slate-600">
            Se usa para valorar las existencias y calcular el costo de las recetas.
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)] gap-2">
            <label className={ETIQUETA}>
              <span>Stock mínimo</span>
              <input required type="number" min="0" step="0.0001" value={ingForm.stockMinimo}
                onChange={(e) => setIngForm({ ...ingForm, stockMinimo: e.target.value })} className={CAMPO} />
            </label>
            <label className={ETIQUETA}>
              <span>Unidad de stock mínimo</span>
              <select value={ingForm.unidadStockMinimo}
                onChange={(e) => setIngForm({ ...ingForm, unidadStockMinimo: e.target.value as UnidadMedida })}
                className={CAMPO}>
                <option value="lb">Libras (lb)</option>
                <option value="oz">Onzas (oz)</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-600">El inventario avisa al alcanzar este mínimo.</p>
        </fieldset>
        {error && <div role="alert"><Alert type="error" message={error} /></div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={guardando} onClick={cerrar}
            className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-bold disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="min-h-[44px] rounded-xl bg-brand-600 px-5 text-sm font-bold text-white disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar ingrediente'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
