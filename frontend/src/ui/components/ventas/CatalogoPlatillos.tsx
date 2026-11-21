import React from 'react';
import {
  Search,
  Plus,
  Minus,
  Flame,
  Salad,
  CupSoda,
  CakeSlice,
  UtensilsCrossed,
  X,
  Sparkles,
} from 'lucide-react';
import { MenuDataModel, PlatilloModel } from '../../../models';
import { FotoPlatillo } from '../common/FotoPlatillo';
import { formatCurrency } from '../../../utils/formatters';

function getCategoriaVisual(nombre: string) {
  const lower = nombre.toLowerCase();
  if (lower.includes('parrilla') || lower.includes('carne')) {
    return {
      gradient: 'from-rose-600 to-orange-600',
      pillActive: 'bg-rose-600 text-white shadow-rose-200',
      Icon: Flame,
    };
  }
  if (lower.includes('entrada')) {
    return {
      gradient: 'from-emerald-600 to-teal-500',
      pillActive: 'bg-emerald-600 text-white shadow-emerald-200',
      Icon: Salad,
    };
  }
  if (lower.includes('bebida')) {
    return {
      gradient: 'from-sky-600 to-cyan-500',
      pillActive: 'bg-sky-600 text-white shadow-sky-200',
      Icon: CupSoda,
    };
  }
  if (lower.includes('postre')) {
    return {
      gradient: 'from-purple-600 to-pink-500',
      pillActive: 'bg-purple-600 text-white shadow-purple-200',
      Icon: CakeSlice,
    };
  }
  return {
    gradient: 'from-amber-600 to-brand-500',
    pillActive: 'bg-brand-600 text-white shadow-brand-200',
    Icon: UtensilsCrossed,
  };
}

interface CatalogoPlatillosProps {
  menu: MenuDataModel | null;
  loading: boolean;
  search: string;
  selectedCat: number | 'ESPECIAL' | null;
  countByCategoria: Map<number, number>;
  platillosFiltrados: PlatilloModel[];
  qtyByPlatillo: Map<number, number>;
  onSearchChange: (value: string) => void;
  onSelectCat: (cat: number | 'ESPECIAL' | null) => void;
  onAddItem: (platillo: PlatilloModel) => void;
  onUpdateQty: (platilloId: number, delta: number) => void;
  onVerReceta: (platillo: PlatilloModel) => void;
}

export const CatalogoPlatillos: React.FC<CatalogoPlatillosProps> = ({
  menu,
  loading,
  search,
  selectedCat,
  countByCategoria,
  platillosFiltrados,
  qtyByPlatillo,
  onSearchChange,
  onSelectCat,
  onAddItem,
  onUpdateQty,
  onVerReceta,
}) => {
  return (
    <div className="space-y-4 xl:col-span-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative mb-3.5">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar platillo por nombre, código SKU o ingrediente..."
            className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-11 text-base font-medium outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-200"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Pestañas de categorías */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => onSelectCat(null)}
            aria-pressed={selectedCat === null}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              selectedCat === null
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span>Menú general</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                selectedCat === null ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
              }`}
            >
              {menu?.platillos.length ?? 0}
            </span>
          </button>

          {menu?.menuEspecialActivo && menu.menuEspecialActivo.platillosIds.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectCat('ESPECIAL')}
              aria-pressed={selectedCat === 'ESPECIAL'}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                selectedCat === 'ESPECIAL'
                  ? 'bg-gradient-to-r from-brand-600 to-rose-600 text-white shadow-md'
                  : menu.menuEspecialActivo.esMenuPrincipal
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400 hover:bg-amber-200'
                    : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              <span>{menu.menuEspecialActivo.nombre}</span>
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">
                {menu.menuEspecialActivo.platillosIds.length}
              </span>
            </button>
          )}

          {menu?.categorias.map((cat) => {
            const visual = getCategoriaVisual(cat.nombre);
            const CatIcon = visual.Icon;
            const active = selectedCat === cat.id;
            const count = countByCategoria.get(cat.id) ?? 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCat(cat.id)}
                aria-pressed={active}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                  active
                    ? `${visual.pillActive} shadow-md`
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CatIcon className="h-4 w-4" />
                <span>{cat.nombre}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active ? 'bg-white/25 text-white' : 'bg-white text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid visual de platillos */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-48 animate-pulse rounded-2xl bg-white p-4 shadow-sm" />
          ))}
        </div>
      ) : platillosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <UtensilsCrossed className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-700">No hay platillos que coincidan</p>
          <p className="mt-1 text-sm text-slate-500">Prueba cambiando la categoría o limpiando el buscador.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {platillosFiltrados.map((p) => {
            const disabled = !p.disponible || !p.stockDisponible;
            const inCartQty = qtyByPlatillo.get(p.id) ?? 0;
            const visual = getCategoriaVisual(p.categoriaNombre);
            const CatIcon = visual.Icon;

            return (
              <div
                key={p.id}
                onClick={() => {
                  if (!disabled) onAddItem(p);
                }}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onAddItem(p);
                  }
                }}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white text-left transition select-none ${
                  disabled
                    ? 'cursor-not-allowed border-slate-200 opacity-60'
                    : inCartQty > 0
                      ? 'cursor-pointer border-brand-500 shadow-md ring-2 ring-brand-200'
                      : 'cursor-pointer border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md'
                }`}
              >
                <div
                  className={`flex items-center justify-between bg-gradient-to-r ${
                    p.esEspecialHoy ? 'from-brand-600 to-rose-600' : visual.gradient
                  } px-4 py-2 text-white`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {p.esEspecialHoy ? <Sparkles className="h-3.5 w-3.5" /> : <CatIcon className="h-3.5 w-3.5" />}
                    <span className="truncate">
                      {p.esEspecialHoy ? 'Especial Hoy' : p.categoriaNombre}
                    </span>
                  </div>
                  <span className="rounded-md bg-black/20 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                    {p.sku}
                  </span>
                </div>

                <FotoPlatillo ruta={p.imagenUrl} className="h-28 w-full bg-slate-100 object-cover" />

                {inCartQty > 0 && (
                  <div className="absolute right-3 top-11 flex h-8 min-w-[32px] items-center justify-center rounded-full bg-brand-600 px-2 text-sm font-black text-white shadow-lg ring-2 ring-white">
                    {inCartQty}
                  </div>
                )}

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div className="pr-8">
                    <h3 className="text-base font-extrabold leading-snug text-slate-900">
                      {p.nombre}
                    </h3>
                    {p.descripcion && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {p.descripcion}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-lg font-black text-slate-900">
                          {p.precioVenta > 0 ? formatCurrency(p.precioVenta) : 'Precio pendiente'}
                        </p>
                        {p.esEspecialHoy && p.precioVenta !== p.precioRegular && (
                          <span className="text-xs text-slate-400 line-through">
                            {formatCurrency(p.precioRegular)}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onVerReceta(p);
                        }}
                        className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-brand-600 hover:underline"
                      >
                        Ver receta ({p.receta.length} ing.)
                      </button>
                    </div>

                    {disabled ? (
                      <span className="rounded-xl bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-700">
                        {p.disponible ? 'Agotado' : 'No disponible'}
                      </span>
                    ) : inCartQty > 0 ? (
                      <div
                        className="flex items-center gap-1 rounded-xl bg-brand-50 p-1 ring-1 ring-brand-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdateQty(p.id, -1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm hover:bg-brand-100"
                          aria-label="Restar unidad"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAddItem(p)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm hover:bg-brand-700"
                          aria-label="Sumar unidad"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white transition group-hover:bg-brand-600">
                        <Plus className="h-4 w-4" />
                        Agregar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
