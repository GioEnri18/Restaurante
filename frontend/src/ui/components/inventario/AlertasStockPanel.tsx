import { PackageSearch } from 'lucide-react';
import { IngredienteModel } from '../../../models';
import { Pagination, usePaginacionLocal } from '../common/Pagination';

export function AlertasStockPanel({ ingredientes, onComprar, onVerPendientes }: {
  ingredientes: IngredienteModel[];
  onComprar?: (ingrediente: IngredienteModel) => void;
  onVerPendientes: () => void;
}) {
  const agotados = usePaginacionLocal(ingredientes.filter((i) => i.stockActualOz <= 0));
  const bajos = usePaginacionLocal(ingredientes.filter((i) => i.stockActualOz > 0 && i.bajoStock));
  const grupos = [
    { titulo: 'Sin existencia', color: 'bg-rose-50 text-rose-950', pagina: agotados },
    { titulo: 'Stock bajo', color: 'bg-amber-50 text-amber-950', pagina: bajos },
  ].filter(({ pagina }) => pagina.meta.total > 0);
  const total = agotados.meta.total + bajos.meta.total;
  return (
    <aside aria-label="Alertas de existencias" className="-order-1 h-fit rounded-2xl border border-teal-200 bg-white p-4 xl:sticky xl:top-24 xl:order-none">
      <h2 className="flex items-center gap-2 font-bold text-teal-950">
        <PackageSearch className="h-5 w-5" aria-hidden="true" /> Alertas de inventario
      </h2>
      {total === 0 ? (
        <p className="mt-2 text-sm text-slate-600">No hay ingredientes por reponer.</p>
      ) : (
        <button type="button" onClick={onVerPendientes}
          className="mt-2 min-h-10 text-left text-sm font-bold text-teal-800 underline underline-offset-2">
          {total} {total === 1 ? 'ingrediente por reponer' : 'ingredientes por reponer'} · Ver en Existencias
        </button>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {grupos.map(({ titulo, color, pagina }) => (
          <section key={titulo} className={`rounded-xl p-3 ${color}`}>
            <h3 className="flex justify-between gap-2 text-sm font-bold"><span>{titulo}</span><span>{pagina.meta.total}</span></h3>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm" tabIndex={0} aria-label={titulo}>
              {pagina.items.map((item) => (
                <li key={item.id}>
                  {onComprar ? <button type="button" className="text-left font-semibold underline underline-offset-2"
                    aria-label={`Ingresar compra de ${item.nombre}`} onClick={() => onComprar(item)}>{item.nombre}</button>
                    : <span className="font-semibold">{item.nombre}</span>}
                  <p className="text-xs">{item.stockActualOz.toFixed(2)} oz restantes</p>
                </li>
              ))}
            </ul>
            {pagina.meta.totalPages > 1 && <Pagination meta={pagina.meta} onPageChange={pagina.onPageChange} />}
          </section>
        ))}
      </div>
    </aside>
  );
}
