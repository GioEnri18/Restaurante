import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { IngredienteModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Badge } from '../common/Badge';

interface ExistenciasTableProps {
  ingredientes: IngredienteModel[];
  canAdjust: boolean;
  onAjustar: (ingrediente: IngredienteModel) => void;
}

export const ExistenciasTable: React.FC<ExistenciasTableProps> = ({
  ingredientes,
  canAdjust,
  onAjustar,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [soloBajoStock, setSoloBajoStock] = useState(false);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ingredientes.filter((ing) => {
      if (soloBajoStock && !ing.bajoStock) return false;
      if (!q) return true;
      return (
        ing.nombre.toLowerCase().includes(q) ||
        ing.codigo.toLowerCase().includes(q) ||
        (ing.proveedorNombre ?? '').toLowerCase().includes(q)
      );
    });
  }, [ingredientes, busqueda, soloBajoStock]);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar ingrediente por nombre, código o proveedor..."
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-sm outline-none focus:border-brand-500 focus:bg-white"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSoloBajoStock((v) => !v)}
          className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold transition ${
            soloBajoStock
              ? 'border-amber-600 bg-amber-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {soloBajoStock ? 'Mostrando: Solo stock bajo' : 'Ver solo stock bajo'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="px-2 py-3">Ingrediente</th>
              <th className="px-2 py-3">Proveedor</th>
              <th className="px-2 py-3 text-right">Stock (oz)</th>
              <th className="px-2 py-3 text-right">Equivalente (lb)</th>
              <th className="px-2 py-3 text-right">Mínimo (oz)</th>
              <th className="px-2 py-3 text-right">Costo prom.</th>
              <th className="px-2 py-3">Estado</th>
              {canAdjust && <th className="px-2 py-3 text-right">Ajuste</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={canAdjust ? 8 : 7} className="py-8 text-center text-sm text-slate-500">
                  No se encontraron ingredientes con ese filtro.
                </td>
              </tr>
            ) : (
              filtrados.map((ing) => (
                <tr key={ing.id} className="hover:bg-slate-50">
                  <td className="px-2 py-3">
                    <p className="font-bold text-slate-900">{ing.nombre}</p>
                    <p className="text-xs text-slate-400">{ing.codigo}</p>
                  </td>
                  <td className="px-2 py-3 text-slate-600">{ing.proveedorNombre ?? '—'}</td>
                  <td className="px-2 py-3 text-right font-bold text-slate-900">
                    {ing.stockActualOz.toFixed(2)} oz
                  </td>
                  <td className="px-2 py-3 text-right text-slate-600">
                    {ing.stockActualLb.toFixed(2)} lb
                  </td>
                  <td className="px-2 py-3 text-right text-slate-500">
                    {ing.stockMinimoOz.toFixed(1)} oz
                  </td>
                  <td className="px-2 py-3 text-right text-xs text-slate-600">
                    <p className="font-bold text-slate-800">{formatCurrency(ing.costoPromedioOz)}/oz</p>
                    <p>{formatCurrency(ing.costoPromedioLb)}/lb</p>
                  </td>
                  <td className="px-2 py-3">
                    {ing.bajoStock ? (
                      <Badge variant="danger">Stock bajo</Badge>
                    ) : (
                      <Badge variant="success">Óptimo</Badge>
                    )}
                  </td>
                  {canAdjust && (
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onAjustar(ing)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Ajustar
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
