import { useState } from 'react';
import { IngredienteModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';

export interface LineaRecetaForm {
  ingredienteId: number;
  cantidadOz: string;
}

interface Props {
  ingredientes: IngredienteModel[];
  lineas: LineaRecetaForm[];
  onChange: (lineas: LineaRecetaForm[]) => void;
}

export function RecetaCampos({ ingredientes, lineas, onChange }: Props) {
  const [seleccion, setSeleccion] = useState('');
  const opciones = ingredientes.filter((ingrediente) =>
    ingrediente.costoPromedioOz > 0 &&
    !lineas.some((linea) => linea.ingredienteId === ingrediente.id),
  );
  const costo = lineas.reduce((total, linea) => {
    const ingrediente = ingredientes.find((item) => item.id === linea.ingredienteId);
    return total + (ingrediente?.costoPromedioOz ?? 0) * Number(linea.cantidadOz);
  }, 0);

  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-bold">Receta por porción</legend>
      <p className="text-xs text-slate-600">
        Al confirmar una venta se descuenta la cantidad indicada por cada unidad vendida.
      </p>
      {lineas.map((linea) => {
        const ingrediente = ingredientes.find((item) => item.id === linea.ingredienteId);
        const nombre = ingrediente?.nombre ?? `Ingrediente #${linea.ingredienteId}`;
        return (
          <div key={linea.ingredienteId} className="flex flex-wrap items-center gap-2">
            <span className="flex-1 text-sm">
              {nombre}{!ingrediente?.costoPromedioOz && ' (sin costo válido)'}
            </span>
            <input
              aria-label={`Onzas de ${nombre}`}
              type="number"
              min="0.0001"
              step="0.0001"
              required
              value={linea.cantidadOz}
              onChange={(event) => onChange(lineas.map((item) =>
                item.ingredienteId === linea.ingredienteId
                  ? { ...item, cantidadOz: event.target.value }
                  : item,
              ))}
              className="min-h-[44px] w-28 rounded-xl border border-slate-300 px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => onChange(lineas.filter((item) => item.ingredienteId !== linea.ingredienteId))}
              className="min-h-[44px] px-2 text-sm font-semibold text-red-700"
              aria-label={`Quitar ${nombre}`}
            >
              Quitar
            </button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <select
          aria-label="Ingrediente para la receta"
          value={seleccion}
          onChange={(event) => setSeleccion(event.target.value)}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 px-2 text-sm"
        >
          <option value="">Selecciona un ingrediente con costo</option>
          {opciones.map((ingrediente) => (
            <option key={ingrediente.id} value={ingrediente.id}>{ingrediente.nombre}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!seleccion || lineas.length >= 50}
          onClick={() => {
            onChange([...lineas, { ingredienteId: Number(seleccion), cantidadOz: '1' }]);
            setSeleccion('');
          }}
          className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      {ingredientes.length > 0 && ingredientes.every((ingrediente) => ingrediente.costoPromedioOz <= 0) && (
        <p className="text-xs text-slate-600">Registra una compra con costo para habilitar ingredientes.</p>
      )}
      <p className="text-sm font-semibold">Costo estimado por porción: {formatCurrency(costo)}</p>
    </fieldset>
  );
}
