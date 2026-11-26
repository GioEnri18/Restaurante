import React from 'react';
import { Link } from 'react-router-dom';
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
  Settings2,
} from 'lucide-react';
import { MenuDataModel, PlatilloModel } from '../../../models';
import { EmptyState } from '../common/EmptyState';
import { Field } from '../common/Field';
import { FotoPlatillo } from '../common/FotoPlatillo';
import { Pagination, usePaginacionLocal } from '../common/Pagination';
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
    gradient: 'from-amber-700 to-brand-700',
    pillActive: 'bg-brand-700 text-white shadow-brand-200',
    Icon: UtensilsCrossed,
  };
}

interface CatalogoPlatillosProps {
  menu: MenuDataModel | null;
  loading: boolean;
  search: string;
  selectedCat: number | 'ESPECIAL' | null;
  onlyAvailable: boolean;
  pendientesConfigCount: number;
  countByCategoria: Map<number, number>;
  platillosFiltrados: PlatilloModel[];
  qtyByPlatillo: Map<number, number>;
  canCreatePlatillo?: boolean;
  onSearchChange: (value: string) => void;
  onSelectCat: (cat: number | 'ESPECIAL' | null) => void;
  onToggleOnlyAvailable: () => void;
  onLimpiarFiltros: () => void;
  onAddItem: (platillo: PlatilloModel) => void;
  onUpdateQty: (platilloId: number, delta: number) => void;
  onVerReceta: (platillo: PlatilloModel) => void;
  onNuevoPlatillo?: () => void;
  onNuevaCategoria?: () => void;
}

export const CatalogoPlatillos: React.FC<CatalogoPlatillosProps> = ({
  menu,
  loading,
  search,
  selectedCat,
  onlyAvailable,
  pendientesConfigCount,
  countByCategoria,
  platillosFiltrados,
  qtyByPlatillo,
  canCreatePlatillo = false,
  onSearchChange,
  onSelectCat,
  onToggleOnlyAvailable,
  onLimpiarFiltros,
  onAddItem,
  onUpdateQty,
  onVerReceta,
  onNuevoPlatillo,
  onNuevaCategoria,
}) => {
  const pagina = usePaginacionLocal(platillosFiltrados, JSON.stringify([search, selectedCat, onlyAvailable]));
  return (
    <div className="space-y-4 lg:col-span-7 xl:col-span-8">
      {canCreatePlatillo && pendientesConfigCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <Settings2 className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              Tienes <strong>{pendientesConfigCount} platillo(s)</strong> pendientes de activar (falta precio, receta o stock).
            </p>
          </div>
          <Link
            to="/inventario?tab=recetas"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-extrabold text-white shadow-sm hover:bg-amber-700"
          >
            Configurar precios y recetas →
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          <Field label="Buscar platillo por nombre o código" srOnlyLabel className="min-w-[220px] flex-1">
            {(controlProps) => (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  {...controlProps}
                  type="text"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Buscar platillo por nombre o código..."
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-11 text-base font-medium outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-200"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    aria-label="Limpiar búsqueda de platillos"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>
          <button
            type="button"
            onClick={onToggleOnlyAvailable}
            aria-pressed={onlyAvailable}
            className={`inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${onlyAvailable
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
          >
            {onlyAvailable ? 'Mostrando: Solo vendibles' : 'Solo listos para vender'}
          </button>
          {canCreatePlatillo && onNuevaCategoria && (
            <button
              type="button"
              onClick={onNuevaCategoria}
              className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Categoría
            </button>
          )}
          {canCreatePlatillo && onNuevoPlatillo && (
            <button
              type="button"
              onClick={onNuevoPlatillo}
              className="inline-flex min-h-[48px] shrink-0 items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-brand-800"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo Platillo
            </button>
          )}
        </div>

        {/* Pestañas de categorías (solo por categorías, sin Menú general) */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {menu?.menuEspecialActivo && menu.menuEspecialActivo.platillosIds.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectCat('ESPECIAL')}
              aria-pressed={selectedCat === 'ESPECIAL'}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${selectedCat === 'ESPECIAL'
                ? 'bg-gradient-to-r from-brand-700 to-rose-700 text-white shadow-md'
                : menu.menuEspecialActivo.esMenuPrincipal
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400 hover:bg-amber-200'
                  : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100'
                }`}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{menu.menuEspecialActivo.nombre}</span>
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">
                {menu.menuEspecialActivo.platillosIds.length}
              </span>
            </button>
          )}

          {(menu?.categorias ?? [])
            .filter((cat) => (countByCategoria.get(cat.id) ?? 0) > 0 || selectedCat === cat.id)
            .map((cat) => {
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
                  <CatIcon className="h-4 w-4" aria-hidden="true" />
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          <p role="status" className="sr-only">Cargando platillos del menú...</p>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} aria-hidden="true" className="h-48 animate-pulse rounded-2xl bg-white p-4 shadow-sm" />
          ))}
        </div>
      ) : platillosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <EmptyState
            icon={UtensilsCrossed}
            title="No hay platillos que coincidan"
            description="Prueba cambiando la categoría, quitando el filtro o limpiando el buscador."
            action={
              search || selectedCat !== null || onlyAvailable
                ? { label: 'Ver todos los platillos', onClick: onLimpiarFiltros, variant: 'secondary' }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {pagina.items.map((p) => {
            const disabled = !p.disponible;
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
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white text-left transition select-none ${disabled
                  ? 'cursor-not-allowed border-slate-200 opacity-60'
                  : inCartQty > 0
                    ? 'cursor-pointer border-brand-500 shadow-md ring-2 ring-brand-200'
                    : 'cursor-pointer border-slate-200 shadow-sm hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md'
                  }`}
              >
                <div
                  className={`flex items-center justify-between bg-gradient-to-r ${p.esEspecialHoy ? 'from-brand-700 to-rose-700' : visual.gradient
                    } px-4 py-2 text-white`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {p.esEspecialHoy ? (
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <CatIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {p.esEspecialHoy ? 'Especial Hoy' : p.categoriaNombre}
                    </span>
                  </div>
                  <span className="rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-xs font-bold">
                    {p.sku}
                  </span>
                </div>

                <FotoPlatillo ruta={p.imagenUrl} className="h-28 w-full bg-slate-100 object-cover" />

                {inCartQty > 0 && (
                  <div className="absolute right-3 top-11 flex h-8 min-w-[32px] items-center justify-center rounded-full bg-brand-700 px-2 text-sm font-black text-white shadow-lg ring-2 ring-white">
                    {inCartQty}
                  </div>
                )}

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div className="pr-8">
                    <h3 className="text-base font-extrabold leading-snug text-slate-900">
                      {p.nombre}
                    </h3>
                    {p.descripcion && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
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
                          <span className="text-xs text-slate-600 line-through">
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
                        className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-brand-700 hover:underline"
                      >
                        Ver receta ({p.receta.length} ing.)
                      </button>
                    </div>

                    {disabled ? (
                      <span className="rounded-xl bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900">
                        {p.precioVenta <= 0
                          ? 'Falta precio'
                          : !p.disponible
                            ? 'Pendiente activar'
                            : 'Sin stock'}
                      </span>
                    ) : inCartQty > 0 ? (
                      <div
                        className="flex items-center gap-1 rounded-xl bg-brand-50 p-1 ring-1 ring-brand-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdateQty(p.id, -1)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm hover:bg-brand-100"
                          aria-label={`Restar una unidad de ${p.nombre}`}
                        >
                          <Minus className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-black text-brand-900">
                          {inCartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => onAddItem(p)}
                          className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-700 text-white shadow-sm hover:bg-brand-800"
                          aria-label={`Sumar una unidad de ${p.nombre}`}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white transition group-hover:bg-brand-700">
                        <Plus className="h-4 w-4" aria-hidden="true" />
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
      {!loading && pagina.meta.totalPages > 1 && <Pagination meta={pagina.meta} onPageChange={pagina.onPageChange} />}
    </div>
  );
};
