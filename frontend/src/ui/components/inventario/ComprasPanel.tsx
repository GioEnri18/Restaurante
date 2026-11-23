import React, { useEffect, useState } from 'react';
import { env } from '../../../config/env';
import { CompraModel, IngredienteModel, PaginationMeta, ProveedorModel, UnidadMedida } from '../../../models';
import { formatCurrency, formatDateTime, lbToOzPreview } from '../../../utils/formatters';
import { Field } from '../common/Field';
import { Pagination } from '../common/Pagination';

interface ComprasPanelProps {
  canBuy: boolean;
  proveedores: ProveedorModel[];
  ingredientes: IngredienteModel[];
  compras: CompraModel[];
  comprasMeta: PaginationMeta;
  onPaginaCompras: (page: number) => void;
  ingredienteInicial: IngredienteModel | null;
  proveedorCompraNuevo: number | null;
  onNuevoProveedor?: () => void;
  onRegistrarCompra: (payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    ingredienteId: number;
    cantidad: number;
    unidad: UnidadMedida;
    precioUnitario: number;
  }) => Promise<boolean>;
}

const INITIAL_COMPRA_FORM = {
  proveedorId: '',
  numeroDocumento: '',
  observaciones: '',
  ingredienteId: '',
  cantidad: '',
  unidad: 'lb' as UnidadMedida,
  precioUnitario: '',
};

export const ComprasPanel: React.FC<ComprasPanelProps> = ({
  canBuy,
  proveedores,
  ingredientes,
  compras,
  comprasMeta,
  onPaginaCompras,
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

  const cantidad = Number(compraForm.cantidad || 0);
  const precio = Number(compraForm.precioUnitario || 0);
  const enLibras = compraForm.unidad === 'lb';
  const previewOz = enLibras ? lbToOzPreview(cantidad) : cantidad;
  const previewSubtotal = cantidad * precio;

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
        cantidad,
        unidad: compraForm.unidad,
        precioUnitario: precio,
      });
      if (ok) setCompraForm((actual) => ({ ...actual, numeroDocumento: '', cantidad: '', precioUnitario: '' }));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {canBuy && (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-12 2xl:col-span-6"
        >
          <h2 className="text-lg font-bold text-slate-900">Ingresar una compra</h2>
          <p className="text-sm text-slate-600">Elige la unidad en que compraste e ingresa la cantidad y el costo por esa unidad.</p>
          <div>
            <Field
              label="Proveedor"
              required
              labelClassName="text-sm font-bold text-slate-700"
              labelExtra={
                onNuevoProveedor ? (
                  <button
                    type="button"
                    onClick={onNuevoProveedor}
                    disabled={guardando}
                    className="min-h-9 rounded-lg border border-teal-300 px-3 text-xs font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-50"
                  >
                    Nuevo proveedor
                  </button>
                ) : undefined
              }
            >
              <select
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
            </Field>
            {proveedores.length === 0 && <p className="mt-1 text-sm text-amber-800">Agrega un proveedor para poder registrar la compra.</p>}
          </div>
          <Field
            label="Ingrediente recibido"
            required
            labelClassName="mb-1 block text-sm font-bold text-slate-700"
          >
            <select
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
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-700">Unidad de compra</legend>
            <div className="flex flex-wrap gap-2">
              {(['lb', 'oz'] as const).map((unidad) => (
                <label key={unidad} className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${compraForm.unidad === unidad ? 'border-teal-400 bg-teal-50 text-teal-950' : 'border-slate-200 text-slate-700'}`}>
                  <input type="radio" name="compra-unidad" checked={compraForm.unidad === unidad}
                    onChange={() => setCompraForm((actual) => ({ ...actual, unidad, cantidad: '', precioUnitario: '' }))} />
                  {unidad === 'lb' ? 'Libras (lb)' : 'Onzas (oz)'}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Cantidad recibida (${compraForm.unidad})`}
              required
              labelClassName="mb-1 block text-sm font-bold text-slate-700"
            >
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                max="999999.9999"
                value={compraForm.cantidad}
                onChange={(e) => setCompraForm({ ...compraForm, cantidad: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </Field>
            <Field
              label={`Costo por ${enLibras ? 'libra' : 'onza'} (${env.CURRENCY_SYMBOL})`}
              required
              labelClassName="mb-1 block text-sm font-bold text-slate-700"
            >
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={enLibras ? 99999999.99 : Math.floor(99999999.99 * 100 / env.OZ_PER_LB) / 100}
                value={compraForm.precioUnitario}
                onChange={(e) => setCompraForm({ ...compraForm, precioUnitario: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </Field>
          </div>

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3.5 text-sm text-teal-950" aria-live="polite">
            {ingredienteActual && (
              <p className="mb-1">
                Existencias actuales <strong>{ingredienteActual.stockActualLb.toFixed(2)} lb</strong>
                {' · '}Costo promedio actual <strong>{formatCurrency(ingredienteActual.costoPromedioLb)}/lb</strong>
              </p>
            )}
            <p>
              Se sumarán <strong>{previewOz.toLocaleString(env.LOCALE, { maximumFractionDigits: 4 })} oz</strong>
            </p>
            <p className="mt-1">
              Total de compra <strong>{formatCurrency(previewSubtotal)}</strong>
            </p>
          </div>

          <Field label="No. factura proveedor (opcional)" srOnlyLabel>
            <input
              type="text"
              placeholder="No. factura proveedor (opcional)"
              value={compraForm.numeroDocumento}
              onChange={(e) => setCompraForm({ ...compraForm, numeroDocumento: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>

          <button
            type="submit"
            disabled={guardando || proveedores.length === 0 || ingredientes.length === 0}
            className="min-h-[48px] w-full rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {guardando ? 'Guardando compra…' : 'Guardar compra y actualizar existencias'}
          </button>
        </form>
      )}

      <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canBuy ? 'lg:col-span-12 2xl:col-span-6' : 'lg:col-span-12'}`}>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Compras recientes</h2>
        <div className="space-y-3">
          {compras.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">Sin compras registradas todavía.</p>
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
                      <strong>{d.ingredienteNombre}</strong> · {d.cantidadOz} oz · {formatCurrency(d.subtotal)}
                    </p>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        {comprasMeta.totalPages > 1 && <Pagination meta={comprasMeta} onPageChange={onPaginaCompras} />}
      </div>
    </div>
  );
};
