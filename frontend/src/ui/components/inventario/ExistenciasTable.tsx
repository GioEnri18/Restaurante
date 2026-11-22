import React from 'react';
import { PackagePlus, SlidersHorizontal } from 'lucide-react';
import { IngredienteModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Badge } from '../common/Badge';

interface ExistenciasTableProps {
  ingredientes: IngredienteModel[];
  canAdjust: boolean;
  canBuy: boolean;
  onComprar: (ingrediente: IngredienteModel) => void;
  onAjustar: (ingrediente: IngredienteModel) => void;
}

export const ExistenciasTable: React.FC<ExistenciasTableProps> = ({
  ingredientes,
  canAdjust,
  canBuy,
  onComprar,
  onAjustar,
}) => {
  if (ingredientes.length === 0) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No hay ingredientes para mostrar.</p>;
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-slate-500">
            <th className="py-3 px-2">Ingrediente</th>
            <th className="py-3 px-2">Proveedor</th>
            <th className="py-3 px-2 text-right">Stock (oz)</th>
            <th className="py-3 px-2 text-right">Equivalente (lb)</th>
            <th className="py-3 px-2 text-right">Mínimo (oz)</th>
            <th className="py-3 px-2 text-right">Costo promedio</th>
            <th className="py-3 px-2">Estado</th>
            {(canBuy || canAdjust) && <th className="py-3 px-2 text-right">Qué deseas hacer</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ingredientes.map((ing) => (
            <tr key={ing.id} className="hover:bg-slate-50">
              <td className="py-3 px-2">
                <p className="font-bold text-slate-900">{ing.nombre}</p>
                <p className="text-xs text-slate-400">{ing.codigo}</p>
              </td>
              <td className="py-3 px-2 text-slate-600">{ing.proveedorNombre ?? '—'}</td>
              <td className="py-3 px-2 text-right font-bold text-slate-900">
                {ing.stockActualOz.toFixed(2)} oz
              </td>
              <td className="py-3 px-2 text-right text-slate-600">
                {ing.stockActualLb.toFixed(2)} lb
              </td>
              <td className="py-3 px-2 text-right text-slate-500">
                {ing.stockMinimoOz.toFixed(1)} oz
              </td>
              <td className="py-3 px-2 text-right text-xs text-slate-600">
                {ing.costoPromedioOz > 0 ? <>
                  <p className="font-bold text-slate-800">{formatCurrency(ing.costoPromedioOz)}/oz</p>
                  <p>{formatCurrency(ing.costoPromedioLb)}/lb</p>
                </> : <p className="font-semibold text-amber-800">Costo pendiente</p>}
              </td>
              <td className="py-3 px-2">
                {ing.stockActualOz <= 0 ? (
                  <Badge variant="danger">Sin existencia</Badge>
                ) : ing.bajoStock ? (
                  <Badge variant="warning">Stock bajo</Badge>
                ) : (
                  <Badge variant="success">Stock suficiente</Badge>
                )}
              </td>
              {(canBuy || canAdjust) && (
                <td className="py-3 px-2 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                  {canBuy && (
                    <button type="button" onClick={() => onComprar(ing)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-xs font-bold text-white hover:bg-teal-800">
                      <PackagePlus className="h-3.5 w-3.5" />
                      Ingresar compra
                    </button>
                  )}
                  {canAdjust && (
                  <button
                    type="button"
                    onClick={() => onAjustar(ing)}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Corregir conteo
                  </button>
                  )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
