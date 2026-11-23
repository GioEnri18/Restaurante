import React from 'react';
import { PackagePlus, Search, SlidersHorizontal, X } from 'lucide-react';
import { IngredienteModel, PaginationMeta } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Badge } from '../common/Badge';
import { Field } from '../common/Field';
import { Pagination } from '../common/Pagination';

interface ExistenciasTableProps {
  ingredientes: IngredienteModel[];
  cargando: boolean;
  canAdjust: boolean;
  canBuy: boolean;
  busqueda: string;
  onBuscar: (busqueda: string) => void;
  soloPorReponer: boolean;
  onAlternarPorReponer: () => void;
  meta: PaginationMeta;
  onPageChange: (pagina: number) => void;
  onComprar: (ingrediente: IngredienteModel) => void;
  onAjustar: (ingrediente: IngredienteModel) => void;
}

export const ExistenciasTable: React.FC<ExistenciasTableProps> = ({
  ingredientes,
  cargando,
  canAdjust,
  canBuy,
  busqueda,
  onBuscar,
  soloPorReponer,
  onAlternarPorReponer,
  meta,
  onPageChange,
  onComprar,
  onAjustar,
}) => {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Field label="Buscar ingrediente" srOnlyLabel className="min-w-[220px] flex-1">
          {(controlProps) => (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                {...controlProps}
                type="text"
                maxLength={80}
                value={busqueda}
                onChange={(e) => onBuscar(e.target.value)}
                placeholder="Buscar ingrediente por nombre, código o proveedor..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-sm outline-none focus:border-brand-500 focus:bg-white"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => onBuscar('')}
                  aria-label="Limpiar búsqueda de ingredientes"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </Field>
        <button
          type="button"
          onClick={onAlternarPorReponer}
          aria-pressed={soloPorReponer}
          className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold transition ${
            soloPorReponer
              ? 'border-amber-600 bg-amber-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          Solo por reponer
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <caption className="sr-only">
            Existencias actuales de ingredientes en onzas y libras
          </caption>
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th scope="col" className="px-2 py-3">Ingrediente</th>
              <th scope="col" className="px-2 py-3">Proveedor</th>
              <th scope="col" className="px-2 py-3 text-right">Stock (oz)</th>
              <th scope="col" className="px-2 py-3 text-right">Equivalente (lb)</th>
              <th scope="col" className="px-2 py-3 text-right">Mínimo (oz)</th>
              <th scope="col" className="px-2 py-3 text-right">Costo promedio</th>
              <th scope="col" className="px-2 py-3">Estado</th>
              {(canBuy || canAdjust) && <th scope="col" className="px-2 py-3 text-right">Qué deseas hacer</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando || ingredientes.length === 0 ? (
              <tr>
                <td colSpan={canBuy || canAdjust ? 8 : 7} className="py-8 text-center text-sm text-slate-500">
                  {cargando ? 'Cargando existencias…' : 'No se encontraron ingredientes con ese filtro.'}
                </td>
              </tr>
            ) : (
              ingredientes.map((ing) => (
                <tr key={ing.id} className="hover:bg-slate-50">
                  <td className="px-2 py-3">
                    <p className="font-bold text-slate-900">{ing.nombre}</p>
                    <p className="text-xs text-slate-600">{ing.codigo}</p>
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
                    {ing.costoPromedioOz > 0 ? <>
                      <p className="font-bold text-slate-800">{formatCurrency(ing.costoPromedioOz)}/oz</p>
                      <p>{formatCurrency(ing.costoPromedioLb)}/lb</p>
                    </> : <p className="font-semibold text-amber-800">Costo pendiente</p>}
                  </td>
                  <td className="px-2 py-3">
                    {ing.stockActualOz <= 0 ? (
                      <Badge variant="danger">Sin existencia</Badge>
                    ) : ing.bajoStock ? (
                      <Badge variant="warning">Stock bajo</Badge>
                    ) : (
                      <Badge variant="success">Stock suficiente</Badge>
                    )}
                  </td>
                  {(canBuy || canAdjust) && (
                    <td className="px-2 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                      {canBuy && (
                        <button type="button" onClick={() => onComprar(ing)}
                          aria-label={`Ingresar compra de ${ing.nombre}`}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-teal-700 px-2.5 text-xs font-bold text-white hover:bg-teal-800">
                          <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" /> Ingresar compra
                        </button>
                      )}
                      {canAdjust && (
                      <button
                        type="button"
                        onClick={() => onAjustar(ing)}
                        aria-label={`Corregir conteo de ${ing.nombre}`}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                        Corregir conteo
                      </button>
                      )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!cargando && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={onPageChange} />}
    </div>
  );
};
