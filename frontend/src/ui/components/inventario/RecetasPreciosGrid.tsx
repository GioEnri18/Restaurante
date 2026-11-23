import React, { useMemo, useState } from 'react';
import { FolderPlus, Plus, Search, X } from 'lucide-react';
import { PlatilloModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Badge } from '../common/Badge';
import { Field } from '../common/Field';
import { FotoPlatillo } from '../common/FotoPlatillo';
import { Pagination, usePaginacionLocal } from '../common/Pagination';

interface RecetasPreciosGridProps {
  platillos: PlatilloModel[];
  canManage: boolean;
  canEditRecipe: boolean;
  canCreateMenu?: boolean;
  onCambiarPrecio: (platillo: PlatilloModel) => void;
  onEditarReceta: (platillo: PlatilloModel) => void;
  onCambiarFoto?: (platillo: PlatilloModel) => void;
  onNuevoPlatillo?: () => void;
  onNuevaCategoria?: () => void;
}

export const RecetasPreciosGrid: React.FC<RecetasPreciosGridProps> = ({
  platillos,
  canManage,
  canEditRecipe,
  canCreateMenu = false,
  onCambiarPrecio,
  onEditarReceta,
  onCambiarFoto,
  onNuevoPlatillo,
  onNuevaCategoria,
}) => {
  const [busqueda, setBusqueda] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);

  const pendientesCount = useMemo(
    () => platillos.filter((p) => !p.disponible || p.precioRegular <= 0).length,
    [platillos],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return platillos.filter((p) => {
      if (soloPendientes && p.disponible && p.precioRegular > 0) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.categoriaNombre.toLowerCase().includes(q)
      );
    });
  }, [platillos, busqueda, soloPendientes]);
  const pagina = usePaginacionLocal(filtrados, JSON.stringify([busqueda, soloPendientes]));

  return (
    <div className="space-y-4">
      {canCreateMenu && (onNuevoPlatillo || onNuevaCategoria) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              Catálogo de Menú (Solo Administrador)
            </h2>
            <p className="text-xs text-slate-500">
              Crea categorías y platillos con receta y foto; aparecerán automáticamente en Menú / Ventas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onNuevaCategoria && (
              <button
                type="button"
                onClick={onNuevaCategoria}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <FolderPlus className="h-4 w-4 text-brand-600" aria-hidden="true" />
                Nueva Categoría
              </button>
            )}
            {onNuevoPlatillo && (
              <button
                type="button"
                onClick={onNuevoPlatillo}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand-600 px-3.5 text-xs font-bold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo Platillo
              </button>
            )}
          </div>
        </div>
      )}

      {pendientesCount > 0 && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4 text-xs text-slate-700">
          <p className="font-extrabold text-brand-900">
            ¿Cómo activar un platillo para que aparezca listo en Ventas? ({pendientesCount} pendiente(s))
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <strong className="text-slate-900">1. Registra stock y costo</strong>
              <p className="mt-0.5 text-slate-500">En la pestaña «Compras (lb → oz)» agrega existencias a sus ingredientes.</p>
            </div>
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <strong className="text-slate-900">2. Ponle precio de venta</strong>
              <p className="mt-0.5 text-slate-500">Usa el botón «Cambiar precio» en la tarjeta del platillo.</p>
            </div>
            <div className="rounded-xl bg-white p-2.5 shadow-sm">
              <strong className="text-slate-900">3. Habilita su receta</strong>
              <p className="mt-0.5 text-slate-500">Abre «Editar receta» y marca «Habilitar en ventas».</p>
            </div>
          </div>
        </div>
      )}

      {/* Buscador y filtro rápido */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <Field label="Buscar platillo" srOnlyLabel className="min-w-[220px] flex-1">
          {(controlProps) => (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                {...controlProps}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar platillo por nombre, código o categoría..."
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-sm outline-none focus:border-brand-500 focus:bg-white"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda de platillos"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </Field>
        <button
          type="button"
          aria-pressed={soloPendientes}
          onClick={() => setSoloPendientes((v) => !v)}
          className={`min-h-[42px] rounded-xl border px-3.5 text-xs font-bold transition ${
            soloPendientes
              ? 'border-amber-600 bg-amber-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          {soloPendientes ? `Mostrando: Pendientes (${pendientesCount})` : `Solo pendientes (${pendientesCount})`}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filtrados.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No se encontraron platillos con ese filtro.
          </div>
        ) : (
          pagina.items.map((p) => {
            const listo = p.disponible && p.precioRegular > 0;
            return (
              <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <FotoPlatillo
                      ruta={p.imagenUrl}
                      className="h-14 w-14 shrink-0 rounded-xl bg-slate-100 object-cover"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-bold text-slate-900">{p.nombre}</h3>
                        <Badge variant={listo ? 'success' : 'warning'}>
                          {listo ? 'Listo para vender' : 'Pendiente activar'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {p.sku} · {p.categoriaNombre}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-extrabold text-brand-700">
                      {p.precioRegular > 0 ? formatCurrency(p.precioRegular) : 'Sin precio'}
                    </p>
                    <p className="text-xs text-slate-500">
                      Costo receta: {p.costoReceta > 0 ? formatCurrency(p.costoReceta) : 'Pendiente'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  {p.receta.length === 0 ? (
                    <p className="italic text-slate-400">Sin receta configurada todavía</p>
                  ) : (
                    p.receta.map((r) => (
                      <div key={r.ingredienteId} className="flex justify-between">
                        <span>{r.ingredienteNombre}</span>
                        <strong>{r.cantidadOz} oz</strong>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => onCambiarPrecio(p)}
                      className="min-h-[38px] rounded-xl border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Cambiar precio
                    </button>
                  )}
                  {canEditRecipe && (
                    <button
                      type="button"
                      onClick={() => onEditarReceta(p)}
                      className="min-h-[38px] rounded-xl border border-brand-200 bg-brand-50 px-2.5 text-xs font-bold text-brand-800 hover:bg-brand-100"
                    >
                      {p.receta.length ? 'Editar receta' : 'Configurar receta'}
                    </button>
                  )}
                  {onCambiarFoto && (
                    <button
                      type="button"
                      onClick={() => onCambiarFoto(p)}
                      className="min-h-[38px] rounded-xl border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {p.imagenUrl ? 'Cambiar foto' : 'Agregar foto'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {pagina.meta.totalPages > 1 && <Pagination meta={pagina.meta} onPageChange={pagina.onPageChange} />}
    </div>
  );
};
