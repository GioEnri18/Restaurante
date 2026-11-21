import React from 'react';
import { PlatilloModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';

interface RecetasPreciosGridProps {
  platillos: PlatilloModel[];
  canManage: boolean;
  canEditRecipe: boolean;
  onCambiarPrecio: (platillo: PlatilloModel) => void;
  onEditarReceta: (platillo: PlatilloModel) => void;
}

export const RecetasPreciosGrid: React.FC<RecetasPreciosGridProps> = ({
  platillos,
  canManage,
  canEditRecipe,
  onCambiarPrecio,
  onEditarReceta,
}) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {platillos.map((p) => (
        <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-900">{p.nombre}</h3>
              <p className="text-xs text-slate-500">
                {p.sku} · {p.categoriaNombre}
              </p>
            </div>
            <div className="text-right">
              <p className="font-extrabold text-brand-700">{formatCurrency(p.precioVenta)}</p>
              <p className="text-xs text-slate-500">
                Costo receta: {p.costoReceta > 0 ? formatCurrency(p.costoReceta) : 'Pendiente'}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
            {p.receta.map((r) => (
              <div key={r.ingredienteId} className="flex justify-between">
                <span>{r.ingredienteNombre}</span>
                <strong>{r.cantidadOz} oz</strong>
              </div>
            ))}
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => onCambiarPrecio(p)}
              className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Cambiar precio (con auditoría)
            </button>
          )}
          {canEditRecipe && (
            <button
              type="button"
              onClick={() => onEditarReceta(p)}
              className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {p.receta.length ? 'Editar receta' : 'Configurar receta'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
