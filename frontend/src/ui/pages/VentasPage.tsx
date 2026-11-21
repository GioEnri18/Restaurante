import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Utensils,
  ShoppingBag,
  Store,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Salad,
  CupSoda,
  CakeSlice,
  UtensilsCrossed,
  X,
  StickyNote,
  Printer,
  Sparkles,
  Check,
  UserRound,
} from 'lucide-react';
import { env } from '../../config/env';
import { MenuDataModel, MetodoPago, PlatilloModel, TicketImprimibleModel } from '../../models';
import { ventasService } from '../../services/ventas.service';
import { useAuthStore } from '../../store/auth.store';
import { useCartStore } from '../../store/cart.store';
import { formatCurrency } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Modal } from '../components/common/Modal';
import { PrintTicketsModal } from '../components/print/PrintTicketsModal';

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

const NOTAS_RAPIDAS = [
  'Sin cebolla',
  'Término medio',
  'Bien cocido',
  'Sin chile',
  'Para compartir',
  'Sin hielo',
];

export const VentasPage: React.FC = () => {
  const canCreate = useAuthStore((s) => s.can('ventas:crear'));
  const canOpenCaja = useAuthStore((s) => s.can('caja:abrir'));
  const {
    items,
    tipoServicio,
    mesaId,
    nombreTurno,
    addItem,
    updateQty,
    updateNotes,
    removeItem,
    setTipoServicio,
    setMesaId,
    setNombreTurno,
    clearCart,
    getTotals,
  } = useCartStore();

  const [menu, setMenu] = useState<MenuDataModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState<number | 'ESPECIAL' | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [infoPlatillo, setInfoPlatillo] = useState<PlatilloModel | null>(null);

  // Modal de cobro
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [clienteNit, setClienteNit] = useState('CF');
  const [clienteNombre, setClienteNombre] = useState('Consumidor Final');
  const [clienteDireccion, setClienteDireccion] = useState('Ciudad');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const [ticketImprimir, setTicketImprimir] = useState<TicketImprimibleModel | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<TicketImprimibleModel | null>(null);

  // Controlado por variables de entorno (.env) para habilitar mesas en el futuro sin tocar código
  const habilitarMesas = menu ? menu.habilitarMesas && env.ENABLE_TABLE_SERVICE : env.ENABLE_TABLE_SERVICE;

  const cargarMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ventasService.obtenerMenu();
      setMenu(data);
      // Si el servicio en mesas está deshabilitado actualmente, asegurar servicio en MOSTRADOR
      if (!data.habilitarMesas && useCartStore.getState().tipoServicio === 'MESA') {
        useCartStore.getState().setTipoServicio('MOSTRADOR');
      }
      // Si hay un menú especial marcado como principal hoy, destacarlo de entrada
      if (data.menuEspecialActivo?.esMenuPrincipal && data.menuEspecialActivo.platillosIds.length > 0) {
        setSelectedCat('ESPECIAL');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando el menú');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargarMenu();
  }, [cargarMenu]);

  const qtyByPlatillo = useMemo(() => {
    const map = new Map<number, number>();
    for (const i of items) map.set(i.platillo.id, i.cantidad);
    return map;
  }, [items]);

  const countByCategoria = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of menu?.platillos ?? []) {
      map.set(p.categoriaId, (map.get(p.categoriaId) ?? 0) + 1);
    }
    return map;
  }, [menu]);

  const platillosFiltrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu?.platillos ?? []).filter((p) => {
      const matchCat =
        selectedCat === 'ESPECIAL'
          ? p.esEspecialHoy
          : selectedCat !== null
            ? p.categoriaId === selectedCat
            : true;
      const matchSearch = term
        ? p.nombre.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.descripcion ?? '').toLowerCase().includes(term)
        : true;
      return matchCat && matchSearch;
    });
  }, [menu, selectedCat, search]);

  const mesaSeleccionada = useMemo(
    () => (menu?.mesas ?? []).find((m) => m.id === mesaId) ?? null,
    [menu, mesaId],
  );

  const totals = getTotals();
  const recibidoNum = Number(montoRecibido || 0);
  const cambioCalculado = metodoPago === 'EFECTIVO' ? Math.max(0, recibidoNum - totals.total) : 0;

  const abrirCobro = () => {
    setCheckoutError(null);
    if (habilitarMesas && tipoServicio === 'MESA' && !mesaId) {
      setError('Selecciona una mesa en el panel de la orden antes de cobrar.');
      return;
    }
    setError(null);
    setMetodoPago('EFECTIVO');
    setMontoRecibido(totals.total.toFixed(2));
    setReferenciaPago('');
    setClienteNit('CF');
    setClienteNombre(nombreTurno.trim() || 'Consumidor Final');
    setClienteDireccion('Ciudad');
    setCheckoutOpen(true);
  };

  const toggleNotaRapida = (platilloId: number, currentNotas: string, chip: string) => {
    const partes = currentNotas
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = partes.some((p) => p.toLowerCase() === chip.toLowerCase());
    const next = exists
      ? partes.filter((p) => p.toLowerCase() !== chip.toLowerCase())
      : [...partes, chip];
    updateNotes(platilloId, next.join(', '));
  };

  const handleConfirmarVenta = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (habilitarMesas && tipoServicio === 'MESA' && !mesaId) {
      setCheckoutError('Selecciona una mesa para el servicio en mesa');
      return;
    }

    if (metodoPago === 'EFECTIVO' && recibidoNum < totals.total) {
      setCheckoutError('El monto recibido en efectivo es menor al total a cobrar');
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await ventasService.confirmarVenta({
        tipoServicio: habilitarMesas ? tipoServicio : tipoServicio === 'MESA' ? 'MOSTRADOR' : tipoServicio,
        mesaId: habilitarMesas && tipoServicio === 'MESA' ? mesaId : null,
        nombreTurno: nombreTurno.trim() || undefined,
        metodoPago,
        montoRecibido: metodoPago === 'EFECTIVO' ? recibidoNum : totals.total,
        referenciaPago: metodoPago === 'TARJETA' ? referenciaPago : undefined,
        clienteNit: clienteNit.trim() || 'CF',
        clienteNombre: clienteNombre.trim() || 'Consumidor Final',
        clienteDireccion: clienteDireccion.trim() || 'Ciudad',
        items: items.map((i) => ({
          platilloId: i.platillo.id,
          cantidad: i.cantidad,
          notas: i.notas.trim() || undefined,
        })),
      });

      clearCart();
      setCheckoutOpen(false);
      setUltimoTicket(ticket);
      setTicketImprimir(ticket);
      await cargarMenu();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'No se pudo confirmar la venta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE ESTADO POS (MOSTRADOR) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              menu?.cajaAbierta
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-red-50 text-red-700 ring-1 ring-red-200'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                menu?.cajaAbierta ? 'animate-pulse bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {menu?.cajaAbierta ? `Caja Abierta (Turno #${menu.cajaSesionId})` : 'Caja Cerrada'}
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            <Store className="h-3.5 w-3.5 text-brand-600" />
            {habilitarMesas ? 'Servicio: Mostrador y Mesas' : 'Servicio en Mostrador'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {ultimoTicket && (
            <button
              type="button"
              onClick={() => setTicketImprimir(ultimoTicket)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <Printer className="h-4 w-4 text-brand-600" />
              Último ticket ({ultimoTicket.factura.numeroCompleto})
            </button>
          )}
          {menu && !menu.cajaAbierta && (
            canOpenCaja ? (
              <Link
                to="/caja"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
              >
                <AlertTriangle className="h-4 w-4" />
                Abrir Caja para Vender
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="h-4 w-4" />
                Solicita al Administrador abrir caja
              </span>
            )
          )}
        </div>
      </div>

      {/* BANNER FESTIVO SI HAY UN MENÚ ESPECIAL ACTIVO HOY */}
      {menu?.menuEspecialActivo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-rose-600 px-5 py-3.5 text-white shadow-md">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 shrink-0 text-amber-200" />
            <div>
              <p className="text-sm font-black uppercase tracking-wide">
                Menú Especial Vigente Hoy: {menu.menuEspecialActivo.nombre}
              </p>
              {menu.menuEspecialActivo.descripcion && (
                <p className="text-xs text-white/90">{menu.menuEspecialActivo.descripcion}</p>
              )}
            </div>
          </div>
          {menu.menuEspecialActivo.platillosIds.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelectedCat(selectedCat === 'ESPECIAL' ? null : 'ESPECIAL')
              }
              className="rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-brand-700 shadow-sm hover:bg-amber-50"
            >
              {selectedCat === 'ESPECIAL' ? 'Ver carta completa' : 'Ver solo menú especial'}
            </button>
          )}
        </div>
      )}

      {error && <Alert type="error" message={error} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* ==================== COLUMNA IZQUIERDA: CARTA TÁCTIL ==================== */}
        <div className="space-y-4 xl:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative mb-3.5">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar platillo por nombre, código SKU o ingrediente..."
                className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-11 text-base font-medium outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-200"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
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
                onClick={() => setSelectedCat(null)}
                className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                  selectedCat === null
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <UtensilsCrossed className="h-4 w-4" />
                <span>Todo el Menú</span>
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
                  onClick={() => setSelectedCat('ESPECIAL')}
                  className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
                    selectedCat === 'ESPECIAL'
                      ? 'bg-gradient-to-r from-brand-600 to-rose-600 text-white shadow-md'
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
                    onClick={() => setSelectedCat(cat.id)}
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
                      if (!disabled) addItem(p);
                    }}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        addItem(p);
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
                              {formatCurrency(p.precioVenta)}
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
                              setInfoPlatillo(p);
                            }}
                            className="text-[11px] font-semibold text-slate-400 underline-offset-2 hover:text-brand-600 hover:underline"
                          >
                            Ver receta ({p.receta.length} ing.)
                          </button>
                        </div>

                        {disabled ? (
                          <span className="rounded-xl bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-700">
                            Agotado
                          </span>
                        ) : inCartQty > 0 ? (
                          <div
                            className="flex items-center gap-1 rounded-xl bg-brand-50 p-1 ring-1 ring-brand-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => updateQty(p.id, -1)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm hover:bg-brand-100"
                              aria-label="Restar unidad"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => addItem(p)}
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

        {/* ==================== COLUMNA DERECHA: CARRITO DE VENTAS EN MOSTRADOR ==================== */}
        <div className="xl:col-span-4">
          <div className="sticky top-20 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3.5 text-white">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold leading-tight">Orden de Mostrador</h2>
                  <p className="text-[11px] text-slate-300">
                    {tipoServicio === 'MOSTRADOR'
                      ? 'Despacho directo en mostrador'
                      : tipoServicio === 'LLEVAR'
                        ? 'Empaque para llevar'
                        : mesaSeleccionada
                          ? `Mesa ${mesaSeleccionada.numero}`
                          : 'Selecciona una mesa'}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs font-extrabold text-brand-200 ring-1 ring-brand-400/30">
                {totals.totalUnidades} ítem(s)
              </span>
            </div>

            {/* Selector enfocado en Mostrador + Para Llevar (Mesas listas para futuro vía .env) */}
            <div className="space-y-3 border-b border-slate-200 bg-slate-50/70 p-3.5">
              <div className={`grid gap-2 ${habilitarMesas ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  type="button"
                  onClick={() => setTipoServicio('MOSTRADOR')}
                  className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                    tipoServicio === 'MOSTRADOR'
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Store className="h-4 w-4" />
                  Mostrador
                </button>
                <button
                  type="button"
                  onClick={() => setTipoServicio('LLEVAR')}
                  className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                    tipoServicio === 'LLEVAR'
                      ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ShoppingBag className="h-4 w-4" />
                  Para Llevar
                </button>
                {habilitarMesas && (
                  <button
                    type="button"
                    onClick={() => setTipoServicio('MESA')}
                    className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                      tipoServicio === 'MESA'
                        ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Utensils className="h-4 w-4" />
                    Mesa
                  </button>
                )}
              </div>

              {/* Campo rápido de nombre o turno para entrega en mostrador */}
              {(!habilitarMesas || tipoServicio !== 'MESA') && (
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={nombreTurno}
                    onChange={(e) => setNombreTurno(e.target.value)}
                    placeholder="Nombre o turno para llamar en mostrador (opcional)"
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-brand-400"
                  />
                </div>
              )}

              {/* Mapa de mesas conservado y listo para activar en el futuro (VITE_ENABLE_TABLE_SERVICE=true) */}
              {habilitarMesas && tipoServicio === 'MESA' && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Toca una mesa:
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(menu?.mesas ?? []).map((m) => {
                      const selected = mesaId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMesaId(m.id)}
                          className={`flex min-h-[42px] flex-col items-center justify-center rounded-xl border text-xs font-extrabold transition ${
                            selected
                              ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span>{m.numero}</span>
                          <span className="text-[10px] font-medium text-slate-400">{m.capacidad}p</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Ítems de la orden */}
            <div className="max-h-[38vh] divide-y divide-slate-100 overflow-y-auto px-4">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <ShoppingCart className="mx-auto mb-2 h-9 w-9 text-slate-200" />
                  <p className="text-sm font-semibold text-slate-500">Tu orden está vacía</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Toca cualquier platillo de la carta para agregarlo al pedido.
                  </p>
                </div>
              ) : (
                items.map((item) => {
                  const notesOpen = expandedNoteId === item.platillo.id || item.notas.length > 0;
                  return (
                    <div key={item.platillo.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-slate-900">
                            {item.platillo.nombre}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatCurrency(item.platillo.precioVenta)} × {item.cantidad}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-slate-900">
                          {formatCurrency(item.platillo.precioVenta * item.cantidad)}
                        </p>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateQty(item.platillo.id, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-7 text-center text-sm font-extrabold">
                            {item.cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.platillo.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedNoteId(
                                expandedNoteId === item.platillo.id ? null : item.platillo.id,
                              )
                            }
                            className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold transition ${
                              item.notas
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                            Nota
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(item.platillo.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                            title="Quitar ítem"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {notesOpen && (
                        <div className="mt-2 space-y-1.5 rounded-xl bg-amber-50/70 p-2.5">
                          <input
                            type="text"
                            value={item.notas}
                            onChange={(e) => updateNotes(item.platillo.id, e.target.value)}
                            placeholder="Indicaciones para cocina..."
                            className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-amber-400"
                          />
                          <div className="flex flex-wrap gap-1">
                            {NOTAS_RAPIDAS.map((chip) => {
                              const active = item.notas.toLowerCase().includes(chip.toLowerCase());
                              return (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => toggleNotaRapida(item.platillo.id, item.notas, chip)}
                                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                                    active
                                      ? 'bg-amber-600 text-white'
                                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-amber-100'
                                  }`}
                                >
                                  {chip}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Totales fiscales + Botón Cobrar */}
            <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-4">
              <div className="flex justify-between text-xs font-medium text-slate-500">
                <span>Base imponible (sin IVA)</span>
                <span>{formatCurrency(totals.subtotalSinIva)}</span>
              </div>
              <div className="flex justify-between text-xs font-medium text-slate-500">
                <span>IVA {(env.IVA_RATE * 100).toFixed(0)}% incluido</span>
                <span>{formatCurrency(totals.ivaMonto)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="text-base font-extrabold text-slate-900">Total a pagar</span>
                <span className="text-2xl font-black text-brand-700">
                  {formatCurrency(totals.total)}
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Vaciar
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canCreate || items.length === 0 || !menu?.cajaAbierta}
                  onClick={abrirCobro}
                  className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-700 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Cobrar {formatCurrency(totals.total)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DETALLE RECETA */}
      <Modal
        open={Boolean(infoPlatillo)}
        title={infoPlatillo ? `Ficha de Platillo — ${infoPlatillo.nombre}` : ''}
        onClose={() => setInfoPlatillo(null)}
        maxWidthClass="max-w-md"
      >
        {infoPlatillo && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
              <div>
                <p className="text-xs text-slate-500">Precio vigente</p>
                <p className="text-xl font-black text-brand-700">
                  {formatCurrency(infoPlatillo.precioVenta)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Costo estimado receta</p>
                <p className="text-base font-bold text-slate-800">
                  {formatCurrency(infoPlatillo.costoReceta)}
                </p>
              </div>
            </div>
            {infoPlatillo.descripcion && <p className="text-slate-600">{infoPlatillo.descripcion}</p>}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                Ingredientes descontados al vender (oz)
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {infoPlatillo.receta.map((r) => (
                  <div key={r.ingredienteId} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-800">{r.ingredienteNombre}</span>
                    <span className="text-slate-600">
                      <strong>{r.cantidadOz} oz</strong> (disp: {r.stockActualOz.toFixed(1)} oz)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL DE COBRO Y CONFIRMACIÓN */}
      <Modal
        open={checkoutOpen}
        title="Cobro en Mostrador · Factura y Comanda Automática"
        onClose={() => setCheckoutOpen(false)}
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleConfirmarVenta} className="space-y-4">
          {checkoutError && <Alert type="error" message={checkoutError} />}

          <div className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white">
            <div>
              <p className="text-xs text-slate-400">
                {tipoServicio === 'MOSTRADOR'
                  ? 'En Mostrador'
                  : tipoServicio === 'LLEVAR'
                    ? 'Para Llevar'
                    : mesaSeleccionada
                      ? `Mesa ${mesaSeleccionada.numero}`
                      : tipoServicio}
                {nombreTurno.trim() ? ` · ${nombreTurno.trim()}` : ''} · {totals.totalUnidades} ítem(s)
              </p>
              <p className="text-sm font-medium text-slate-200">Total con IVA 12% incluido</p>
            </div>
            <span className="text-3xl font-black text-brand-400">{formatCurrency(totals.total)}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">NIT del cliente</label>
              <input
                type="text"
                value={clienteNit}
                onChange={(e) => setClienteNit(e.target.value)}
                placeholder="CF o NIT"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Nombre en factura</label>
              <input
                type="text"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Consumidor Final"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-600">Dirección</label>
              <input
                type="text"
                value={clienteDireccion}
                onChange={(e) => setClienteDireccion(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-bold text-slate-600">Forma de pago</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMetodoPago('EFECTIVO')}
                className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold transition ${
                  metodoPago === 'EFECTIVO'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="h-5 w-5" />
                Efectivo
                {metodoPago === 'EFECTIVO' && <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMetodoPago('TARJETA')}
                className={`flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold transition ${
                  metodoPago === 'TARJETA'
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="h-5 w-5" />
                Tarjeta
                {metodoPago === 'TARJETA' && <Check className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {metodoPago === 'EFECTIVO' ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Efectivo recibido ({env.CURRENCY_SYMBOL})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={totals.total}
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  className="min-h-[50px] w-full rounded-xl border border-slate-300 bg-white px-4 text-xl font-black text-slate-900"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[totals.total, 20, 50, 100, 200].map((billete, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMontoRecibido(billete.toFixed(2))}
                    className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                  >
                    {idx === 0 ? 'Pago exacto' : formatCurrency(billete)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-100 px-4 py-3 text-emerald-950">
                <span className="text-sm font-bold">Vuelto / Cambio:</span>
                <span className="text-2xl font-black">{formatCurrency(cambioCalculado)}</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                Autorización / Voucher POS (opcional)
              </label>
              <input
                type="text"
                value={referenciaPago}
                onChange={(e) => setReferenciaPago(e.target.value)}
                placeholder="Ej. AUTH-482910"
                className="min-h-[46px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCheckoutOpen(false)}
              className="min-h-[48px] rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[48px] rounded-xl bg-emerald-600 px-6 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? 'Procesando venta...' : 'Confirmar e Imprimir'}
            </button>
          </div>
        </form>
      </Modal>

      <PrintTicketsModal
        ticket={ticketImprimir}
        includeComanda
        autoPrint
        onClose={() => setTicketImprimir(null)}
      />
    </div>
  );
};
