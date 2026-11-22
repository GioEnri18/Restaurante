import React, { useEffect, useState } from 'react';
import { env } from '../../../config/env';
import { CompraModel, IngredienteModel, ProveedorModel } from '../../../models';
import { formatCurrency, formatDateTime, lbToOzPreview } from '../../../utils/formatters';

interface ComprasPanelProps {
  canBuy: boolean;
  proveedores: ProveedorModel[];
  ingredientes: IngredienteModel[];
  compras: CompraModel[];
  ingredienteInicial: IngredienteModel | null;
  proveedorCompraNuevo: number | null;
  onNuevoProveedor?: () => void;
  onRegistrarCompra: (payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    ingredienteId: number;
    cantidadLb: number;
    precioPorLb: number;
  }) => Promise<boolean>;
}

const INITIAL_COMPRA_FORM = {
  proveedorId: '',
  numeroDocumento: '',
  observaciones: '',
  ingredienteId: '',
  cantidadLb: '',
  precioPorLb: '',
};

export const ComprasPanel: React.FC<ComprasPanelProps> = ({
  canBuy,
  proveedores,
  ingredientes,
  compras,
  ingredienteInicial,
  proveedorCompraNuevo,
  onNuevoProveedor,
  onRegistrarCompra,
}) => {
  const [compraForm, setCompraForm] = useState(() => ({
    ...INITIAL_COMPRA_FORM,
    proveedorId: proveedores.some((p) => p.id === ingredienteInicial?.proveedorId)
      ? String(ingredienteInicial?.proveedorId) : '',
    ingredienteId: ingredienteInicial ? String(ingredienteInicial.id) : '',
  }));
  const [guardando, setGuardando] = useState(false);
  const ingredienteActual = ingredientes.find((i) => String(i.id) === compraForm.ingredienteId);

  useEffect(() => {
    if (proveedorCompraNuevo !== null) {
      setCompraForm((actual) => ({ ...actual, proveedorId: String(proveedorCompraNuevo) }));
    }
  }, [proveedorCompraNuevo]);

  const previewOz = lbToOzPreview(Number(compraForm.cantidadLb || 0));
  const previewSubtotal = Number(compraForm.cantidadLb || 0) * Number(compraForm.precioPorLb || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    try {
      const ok = await onRegistrarCompra({
        proveedorId: Number(compraForm.proveedorId),
        numeroDocumento: compraForm.numeroDocumento || undefined,
        observaciones: compraForm.observaciones || undefined,
        ingredienteId: Number(compraForm.ingredienteId),
        cantidadLb: Number(compraForm.cantidadLb),
        precioPorLb: Number(compraForm.precioPorLb),
      });
      if (ok) setCompraForm((actual) => ({ ...actual, numeroDocumento: '', cantidadLb: '', precioPorLb: '' }));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {canBuy && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5"
        >
          <h2 className="text-lg font-bold text-slate-900">Ingresar una compra</h2>
          <p className="text-sm text-slate-600">Ingresa la cantidad recibida y lo que pagaste por libra.</p>
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="compra-proveedor" className="text-sm font-bold text-slate-700">Proveedor</label>
              {onNuevoProveedor && <button type="button" onClick={onNuevoProveedor} disabled={guardando}
                className="min-h-9 rounded-lg border border-teal-300 px-3 text-xs font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-50">
                Nuevo proveedor
              </button>}
            </div>
            <select
              id="compra-proveedor"
              required
              value={compraForm.proveedorId}
              onChange={(e) => setCompraForm({ ...compraForm, proveedorId: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">-- Seleccionar proveedor --</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {proveedores.length === 0 && <p className="mt-1 text-sm text-amber-800">Agrega un proveedor para poder registrar la compra.</p>}
          </div>
          <div>
            <label htmlFor="compra-ingrediente" className="mb-1 block text-sm font-bold text-slate-700">Ingrediente recibido</label>
            <select
              id="compra-ingrediente"
              required
              value={compraForm.ingredienteId}
              onChange={(e) => setCompraForm({ ...compraForm, ingredienteId: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">-- Seleccionar ingrediente --</option>
              {ingredientes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre} (actual: {i.stockActualLb.toFixed(2)} lb)
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="compra-cantidad" className="mb-1 block text-sm font-bold text-slate-700">Cantidad recibida (lb)</label>
              <input
                id="compra-cantidad"
                required
                type="number"
                step="0.0001"
                min="0.0001"
                max="999999.9999"
                value={compraForm.cantidadLb}
                onChange={(e) => setCompraForm({ ...compraForm, cantidadLb: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </div>
            <div>
              <label htmlFor="compra-precio" className="mb-1 block text-sm font-bold text-slate-700">Costo por libra (Q)</label>
              <input
                id="compra-precio"
                required
                type="number"
                step="0.01"
                min="0.01"
                max="99999999.99"
                value={compraForm.precioPorLb}
                onChange={(e) => setCompraForm({ ...compraForm, precioPorLb: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </div>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-sm text-teal-950" aria-live="polite">
            {ingredienteActual && (
              <p className="mb-1">
                Existencias actuales <strong>{ingredienteActual.stockActualLb.toFixed(2)} lb</strong>
                {' · '}Costo promedio actual <strong>{formatCurrency(ingredienteActual.costoPromedioLb)}/lb</strong>
              </p>
            )}
            <p>
              Conversión automática: <strong>{compraForm.cantidadLb || 0} lb</strong> ={' '}
              <strong>{previewOz.toFixed(2)} oz</strong>
            </p>
            <p className="mt-1">
              Total de compra: <strong>{formatCurrency(previewSubtotal)}</strong> (
              {formatCurrency(Number(compraForm.precioPorLb || 0) / env.OZ_PER_LB)} / oz)
            </p>
          </div>

          <input
            type="text"
            placeholder="No. factura proveedor (opcional)"
            value={compraForm.numeroDocumento}
            onChange={(e) => setCompraForm({ ...compraForm, numeroDocumento: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />

          <button
            type="submit"
            disabled={guardando || proveedores.length === 0 || ingredientes.length === 0}
            className="min-h-[48px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando compra…' : 'Guardar compra y actualizar existencias'}
          </button>
        </form>
      )}

      <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canBuy ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Compras recientes</h2>
        <div className="space-y-3">
          {compras.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin compras registradas todavía.</p>
          ) : (
            compras.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 p-3.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{c.proveedorNombre}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(c.fechaCompra)} · Por {c.usuarioNombre}
                      {c.numeroDocumento ? ` · Doc: ${c.numeroDocumento}` : ''}
                    </p>
                  </div>
                  <span className="text-base font-extrabold text-brand-700">
                    {formatCurrency(c.total)}
                  </span>
                </div>
                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  {c.detalles.map((d, idx) => (
                    <p key={idx}>
                      • <strong>{d.ingredienteNombre}</strong>: {d.cantidadLb} lb →{' '}
                      <strong>{d.cantidadOz} oz</strong> ({formatCurrency(d.precioPorLb)}/lb)
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
