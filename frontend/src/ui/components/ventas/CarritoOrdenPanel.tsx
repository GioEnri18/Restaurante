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
} from 'lucide-react';
import { env } from '../../../config/env';
import { CartItemModel, MesaModel, TipoServicio } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';

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

interface CarritoOrdenPanelProps {
  items: CartItemModel[];
  tipoServicio: TipoServicio;
  mesaId: number | null;
  mesaSeleccionada: MesaModel | null;
  mesas: MesaModel[];
  nombreTurno: string;
  habilitarMesas: boolean;
  totals: CarritoTotals;
  canCreate: boolean;
  canOpenCaja?: boolean;
  cajaAbierta: boolean;
  onSetTipoServicio: (tipo: TipoServicio) => void;
  onSetMesaId: (mesaId: number | null) => void;
  onSetNombreTurno: (nombre: string) => void;
  onUpdateQty: (platilloId: number, delta: number) => void;
  onUpdateNotes: (platilloId: number, notas: string) => void;
  onRemoveItem: (platilloId: number) => void;
  onClearCart: () => void;
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
  totals,
  canCreate,
  canOpenCaja = false,
  cajaAbierta,
  onSetTipoServicio,
  onSetMesaId,
  onSetNombreTurno,
  onUpdateQty,
  onUpdateNotes,
  onRemoveItem,
  onClearCart,
  onAbrirCobro,
}) => {
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

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

  return (
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
              onClick={() => onSetTipoServicio('MOSTRADOR')}
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
              onClick={() => onSetTipoServicio('LLEVAR')}
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
                onClick={() => onSetTipoServicio('MESA')}
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
                onChange={(e) => onSetNombreTurno(e.target.value)}
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
                {mesas.map((m) => {
                  const selected = mesaId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSetMesaId(m.id)}
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
                        onClick={() => onUpdateQty(item.platillo.id, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-extrabold">
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.platillo.id, 1)}
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
                        onClick={() => onRemoveItem(item.platillo.id)}
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
                        onChange={(e) => onUpdateNotes(item.platillo.id, e.target.value)}
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
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                Abre la caja primero para poder cobrar
              </span>
              {canOpenCaja && (
                <Link
                  to="/caja"
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-amber-700"
                >
                  Ir a Caja
                </Link>
              )}
            </div>
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
              disabled={!canCreate || items.length === 0 || !cajaAbierta}
              onClick={onAbrirCobro}
              className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 text-base font-extrabold text-white shadow-lg shadow-brand-600/25 transition hover:from-brand-700 hover:to-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-5 w-5" />
              {items.length === 0 ? 'Agrega platillos para cobrar' : `Cobrar ${formatCurrency(totals.total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
