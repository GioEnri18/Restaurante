import { PackageSearch } from 'lucide-react';
import { IngredienteModel } from '../../../models';

export function AlertasStockPanel({ ingredientes, onComprar }: {
  ingredientes: IngredienteModel[];
  onComprar?: (ingrediente: IngredienteModel) => void;
}) {
  const grupos = [
    { titulo: 'Sin existencia', color: 'bg-rose-50 text-rose-950', items: ingredientes.filter((i) => i.stockActualOz <= 0) },
    { titulo: 'Stock bajo', color: 'bg-amber-50 text-amber-950', items: ingredientes.filter((i) => i.stockActualOz > 0 && i.bajoStock) },
  ];
  return (
    <aside aria-label="Alertas de existencias" className="-order-1 h-fit rounded-2xl border border-teal-200 bg-white p-4 xl:sticky xl:top-24 xl:order-none">
      <h2 className="flex items-center gap-2 font-bold text-teal-950">
        <PackageSearch className="h-5 w-5" aria-hidden="true" /> Por reponer
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {grupos.map(({ titulo, color, items }) => (
          <section key={titulo} className={`rounded-xl p-3 ${color}`}>
            <h3 className="flex justify-between gap-2 text-sm font-bold"><span>{titulo}</span><span>{items.length}</span></h3>
            {items.length === 0 ? <p className="mt-1 text-sm">Ninguno.</p> : (
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
                {items.map((item) => (
                  <li key={item.id}>
                    {onComprar ? <button type="button" className="text-left font-semibold underline underline-offset-2"
                      aria-label={`Ingresar compra de ${item.nombre}`} onClick={() => onComprar(item)}>{item.nombre}</button>
                      : <span className="font-semibold">{item.nombre}</span>}
                    <p className="text-xs">{item.stockActualOz.toFixed(2)} oz restantes</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
