import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Utensils,
  ShoppingBag,
  Store,
  CheckCircle2,
  StickyNote,
  UserRound,
  AlertTriangle,
  Bike,
  X,
} from 'lucide-react';
import { env } from '../../../config/env';
import { CartItemModel, MesaModel, TipoServicio } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { FaltanteStock } from '../../../utils/stockPedido';
import { Field } from '../common/Field';
import { FaltantesPedido } from './FaltantesPedido';

const NOTAS_RAPIDAS = [
  'Sin cebolla',
  'Término medio',
  'Bien cocido',
  'Sin chile',
  'Para compartir',
  'Sin hielo',
];

interface CarritoTotals {
  subtotalSinIva: number;
  ivaMonto: number;
  total: number;
  totalUnidades: number;
}

export interface CarritoOrdenPanelProps {
  items: CartItemModel[];
  tipoServicio: TipoServicio;
  mesaId: number | null;
  mesaSeleccionada: MesaModel | null;
  mesas: MesaModel[];
  nombreTurno: string;
  habilitarMesas: boolean;
  habilitarDelivery?: boolean;
  totals: CarritoTotals;
  canCreate: boolean;
  canOpenCaja?: boolean;
  cajaAbierta: boolean;
  faltantes: FaltanteStock[];
  mode?: 'sidebar' | 'sheet';
  titleId?: string;
  onCloseSheet?: () => void;
  onSetTipoServicio: (tipo: TipoServicio) => void;
  onSetMesaId: (mesaId: number | null) => void;
  onSetNombreTurno: (nombre: string) => void;
  onUpdateQty: (platilloId: number, delta: number) => void;
  onUpdateNotes: (platilloId: number, notas: string) => void;
  onRemoveItem: (platilloId: number) => void;
  onClearCart: () => void;
  onCortesia: (id: number, cantidad: number) => void;
  onAbrirCobro: () => void;
}

export const CarritoOrdenPanel: React.FC<CarritoOrdenPanelProps> = ({
  items,
  tipoServicio,
  mesaId,
  mesaSeleccionada,
  mesas,
  nombreTurno,
  habilitarMesas,
  habilitarDelivery = false,
  totals,
  canCreate,
  canOpenCaja = false,
  cajaAbierta,
  faltantes,
  mode = 'sidebar',
  titleId,
  onCloseSheet,
  onSetTipoServicio,
  onSetMesaId,
  onSetNombreTurno,
  onUpdateQty,
  onUpdateNotes,
  onRemoveItem,
  onClearCart,
  onCortesia,
  onAbrirCobro,
}) => {
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const isSheet = mode === 'sheet';

  const toggleNotaRapida = (platilloId: number, currentNotas: string, chip: string) => {
    const partes = currentNotas
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const exists = partes.some((p) => p.toLowerCase() === chip.toLowerCase());
    const next = exists
      ? partes.filter((p) => p.toLowerCase() !== chip.toLowerCase())
      : [...partes, chip];
    onUpdateNotes(platilloId, next.join(', '));
  };

  const cardContent = (
      <div
        className={
          isSheet
            ? 'flex max-h-[88dvh] flex-col overflow-hidden bg-white'
            : 'sticky top-20 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md'
        }
      >
        <div className="flex shrink-0 items-center justify-between bg-slate-900 px-4 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id={titleId} className="text-base font-extrabold leading-tight">
                Orden de Mostrador
              </h2>
              <p className="text-xs text-slate-300">
                {tipoServicio === 'MOSTRADOR'
                  ? 'Despacho directo en mostrador'
                  : tipoServicio === 'LLEVAR'
                    ? 'Empaque para llevar'
                    : tipoServicio === 'DELIVERY'
                      ? 'Servicio a domicilio'
                      : mesaSeleccionada
                        ? `Mesa ${mesaSeleccionada.numero}`
                        : 'Selecciona una mesa'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs font-extrabold text-brand-200 ring-1 ring-brand-400/30">
              {totals.totalUnidades} ítem(s)
            </span>
            {isSheet && onCloseSheet && (
              <button
                type="button"
                onClick={onCloseSheet}
                aria-label="Cerrar panel del pedido"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Selector enfocado en Mostrador + Para Llevar (+ Domicilio y Mesas condicionales por .env) */}
        <div className="space-y-3 border-b border-slate-200 bg-slate-50/70 p-3.5">
          <div
            className={`grid gap-2 ${
              habilitarMesas && habilitarDelivery
                ? 'grid-cols-2 sm:grid-cols-4'
                : habilitarMesas || habilitarDelivery
                  ? 'grid-cols-3'
                  : 'grid-cols-2'
            }`}
          >
            <button
              type="button"
              aria-pressed={tipoServicio === 'MOSTRADOR'}
              onClick={() => onSetTipoServicio('MOSTRADOR')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                tipoServicio === 'MOSTRADOR'
                  ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Store className="h-4 w-4" aria-hidden="true" />
              Mostrador
            </button>
            <button
              type="button"
              aria-pressed={tipoServicio === 'LLEVAR'}
              onClick={() => onSetTipoServicio('LLEVAR')}
              className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                tipoServicio === 'LLEVAR'
                  ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              Para Llevar
            </button>
            {habilitarDelivery && (
              <button
                type="button"
                aria-pressed={tipoServicio === 'DELIVERY'}
                onClick={() => onSetTipoServicio('DELIVERY')}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                  tipoServicio === 'DELIVERY'
                    ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Bike className="h-4 w-4" aria-hidden="true" />
                Domicilio
              </button>
            )}
            {habilitarMesas && (
              <button
                type="button"
                aria-pressed={tipoServicio === 'MESA'}
                onClick={() => onSetTipoServicio('MESA')}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold transition ${
                  tipoServicio === 'MESA'
                    ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Utensils className="h-4 w-4" aria-hidden="true" />
                Mesa
              </button>
            )}
          </div>

          {/* Campo rápido de nombre o turno para entrega en mostrador */}
          {tipoServicio !== 'DELIVERY' && (!habilitarMesas || tipoServicio !== 'MESA') && (
            <Field label="Nombre o turno para llamar en mostrador (opcional)" srOnlyLabel>
              {(controlProps) => (
                <div className="relative">
                  <UserRound
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    {...controlProps}
                    type="text"
                    value={nombreTurno}
                    onChange={(e) => onSetNombreTurno(e.target.value)}
                    placeholder="Nombre o turno para llamar en mostrador (opcional)"
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none focus:border-brand-400"
                  />
                </div>
              )}
            </Field>
          )}

          {/* Mapa de mesas conservado y listo para activar en el futuro (VITE_ENABLE_TABLE_SERVICE=true) */}
          {habilitarMesas && tipoServicio === 'MESA' && (
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                Toca una mesa:
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {mesas.map((m) => {
                  const selected = mesaId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSetMesaId(m.id)}
                      className={`flex min-h-[42px] flex-col items-center justify-center rounded-xl border text-xs font-extrabold transition ${
                        selected
                          ? 'border-brand-700 bg-brand-50 text-brand-700 ring-2 ring-brand-200'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{m.numero}</span>
                      <span className="text-xs font-medium text-slate-600">{m.capacidad}p</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Ítems de la orden */}
        <div
          className={`${isSheet ? 'min-h-0 flex-1' : 'max-h-[38vh]'} divide-y divide-slate-100 overflow-y-auto px-4`}
        >
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <ShoppingCart className="mx-auto mb-2 h-9 w-9 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700">Tu orden está vacía</p>
              <p className="mt-0.5 text-xs text-slate-600">
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
                      {formatCurrency(item.platillo.precioVenta * (item.cantidad - (item.cantidadCortesia ?? 0)))}
                    </p>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.platillo.id, -1)}
                        aria-label={`Restar una unidad de ${item.platillo.nombre}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-200"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-extrabold">
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.platillo.id, 1)}
                        aria-label={`Sumar una unidad de ${item.platillo.nombre}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-200"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNoteId(
                            expandedNoteId === item.platillo.id ? null : item.platillo.id,
                          )
                        }
                        aria-label={`Notas de cocina para ${item.platillo.nombre}`}
                        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${
                          item.notas
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <StickyNote className="h-4 w-4" aria-hidden="true" />
                        Nota
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.platillo.id)}
                        aria-label={`Quitar ${item.platillo.nombre} del pedido`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-red-600 transition hover:bg-red-50"
                        title="Quitar ítem"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.cantidadCortesia)}
                        onChange={(e) => onCortesia(item.platillo.id, e.target.checked ? 1 : 0)} />
                      Cortesía
                    </label>
                    {!!item.cantidadCortesia && item.cantidad > 1 && (
                      <label className="flex items-center gap-1">
                        Unidades de cortesía
                        <input type="number" min={1} max={item.cantidad} value={item.cantidadCortesia}
                          onChange={(e) => onCortesia(item.platillo.id, Math.max(1, Math.min(item.cantidad, Math.floor(Number(e.target.value)))))}
                          className="w-16 rounded border border-slate-300 px-2 py-1" />
                      </label>
                    )}
                  </div>
                  {notesOpen && (
                    <div className="mt-2 space-y-1.5 rounded-xl bg-amber-50/70 p-2.5">
                      <Field label={`Indicaciones para cocina de ${item.platillo.nombre}`} srOnlyLabel>
                        <input
                          type="text"
                          value={item.notas}
                          onChange={(e) => onUpdateNotes(item.platillo.id, e.target.value)}
                          placeholder="Indicaciones para cocina..."
                          className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium outline-none focus:border-amber-400"
                        />
                      </Field>
                      <div className="flex flex-wrap gap-1">
                        {NOTAS_RAPIDAS.map((chip) => {
                          const active = item.notas.toLowerCase().includes(chip.toLowerCase());
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => toggleNotaRapida(item.platillo.id, item.notas, chip)}
                              className={`rounded-md px-2 py-0.5 text-xs font-bold transition ${
                                active
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-amber-100'
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
        <div
          className={`shrink-0 space-y-2 border-t border-slate-200 bg-slate-50 p-4 ${
            isSheet ? 'pb-[calc(1rem+env(safe-area-inset-bottom))]' : ''
          }`}
        >
          <div className="flex justify-between text-xs font-medium text-slate-500">
            <span>Subtotal sin IVA</span>
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

          {!cajaAbierta && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                Abre la caja primero para poder cobrar
              </span>
              {canOpenCaja && (
                <Link
                  to="/caja"
                  className="shrink-0 rounded-lg bg-amber-700 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-amber-800"
                >
                  Ir a Caja
                </Link>
              )}
            </div>
          )}

          {faltantes.length > 0 && <FaltantesPedido faltantes={faltantes} />}
          {items.some((item) => item.platillo.receta.length === 0) && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
              Los platillos sin receta se pueden vender. Su consumo y costo quedarán pendientes.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                className="min-h-[52px] rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              disabled={
                items.length === 0 ||
                (tipoServicio === 'DELIVERY' ? !habilitarDelivery : !canCreate || !cajaAbierta)
              }
              onClick={onAbrirCobro}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-700 to-brand-800 px-4 text-base font-extrabold text-white shadow-lg shadow-brand-900/25 transition hover:from-brand-800 hover:to-brand-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              {items.length === 0
                ? 'Agrega platillos para cobrar'
                : tipoServicio === 'DELIVERY'
                  ? `Domicilio ${formatCurrency(totals.total)} + envío`
                  : `Cobrar ${formatCurrency(totals.total)}`}
            </button>
          </div>
        </div>
      </div>
  );

  if (isSheet) {
    return cardContent;
  }

  return <div className="hidden lg:block lg:col-span-5 xl:col-span-4">{cardContent}</div>;
};
