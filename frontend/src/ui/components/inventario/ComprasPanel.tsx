import React, { useState } from 'react';
import { env } from '../../../config/env';
import { CompraModel, IngredienteModel, ProveedorModel } from '../../../models';
import { formatCurrency, formatDateTime, lbToOzPreview } from '../../../utils/formatters';

interface ComprasPanelProps {
  canBuy: boolean;
  proveedores: ProveedorModel[];
  ingredientes: IngredienteModel[];
  compras: CompraModel[];
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
  onRegistrarCompra,
}) => {
  const [compraForm, setCompraForm] = useState(INITIAL_COMPRA_FORM);

  const previewOz = lbToOzPreview(Number(compraForm.cantidadLb || 0));
  const previewSubtotal = Number(compraForm.cantidadLb || 0) * Number(compraForm.precioPorLb || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onRegistrarCompra({
      proveedorId: Number(compraForm.proveedorId),
      numeroDocumento: compraForm.numeroDocumento || undefined,
      observaciones: compraForm.observaciones || undefined,
      ingredienteId: Number(compraForm.ingredienteId),
      cantidadLb: Number(compraForm.cantidadLb),
      precioPorLb: Number(compraForm.precioPorLb),
    });
    if (ok) {
      setCompraForm(INITIAL_COMPRA_FORM);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {canBuy && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5"
        >
          <h2 className="text-lg font-bold text-slate-900">Registrar Compra en Libras (lb)</h2>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Proveedor</label>
            <select
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
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Ingrediente</label>
            <select
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
              <label className="mb-1 block text-xs font-bold text-slate-600">Cantidad (lb)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={compraForm.cantidadLb}
                onChange={(e) => setCompraForm({ ...compraForm, cantidadLb: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Precio por lb (Q)</label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                value={compraForm.precioPorLb}
                onChange={(e) => setCompraForm({ ...compraForm, precioPorLb: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </div>
          </div>

          <div className="rounded-xl bg-sky-50 p-3.5 text-sm text-sky-900">
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
            className="min-h-[48px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
          >
            Registrar Compra e Ingresar Onzas
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
