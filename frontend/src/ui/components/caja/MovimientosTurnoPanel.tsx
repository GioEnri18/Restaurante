import React, { useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CreditCard } from 'lucide-react';
import { CajaMovimientoModel } from '../../../models';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Badge } from '../common/Badge';

type MovFiltro = 'TODOS' | 'VENTAS' | 'INGRESOS' | 'EGRESOS';

interface MovimientosTurnoPanelProps {
  movimientos: CajaMovimientoModel[];
}

export const MovimientosTurnoPanel: React.FC<MovimientosTurnoPanelProps> = ({ movimientos }) => {
  const [movFiltro, setMovFiltro] = useState<MovFiltro>('TODOS');

  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter((m) => {
      if (movFiltro === 'VENTAS') return m.tipo === 'INGRESO_VENTA';
      if (movFiltro === 'INGRESOS') return m.tipo === 'INGRESO_MANUAL';
      if (movFiltro === 'EGRESOS')
        return m.tipo === 'EGRESO_MANUAL' || m.tipo === 'EGRESO_ANULACION';
      return true;
    });
  }, [movimientos, movFiltro]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900">
          Movimientos del Turno Actual ({movimientosFiltrados.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'VENTAS', label: 'Ventas' },
            { id: 'INGRESOS', label: 'Ingresos manuales' },
            { id: 'EGRESOS', label: 'Egresos / Anulaciones' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setMovFiltro(f.id as MovFiltro)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                movFiltro === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {movimientosFiltrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No hay movimientos en esta categoría durante el turno actual.
          </p>
        ) : (
          movimientosFiltrados.map((m) => {
            const esEgreso = m.tipo === 'EGRESO_MANUAL' || m.tipo === 'EGRESO_ANULACION';
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      esEgreso
                        ? 'bg-red-50 text-red-600'
                        : m.metodoPago === 'TARJETA'
                          ? 'bg-sky-50 text-sky-600'
                          : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {esEgreso ? (
                      <ArrowDownCircle className="h-5 w-5" />
                    ) : m.metodoPago === 'TARJETA' ? (
                      <CreditCard className="h-5 w-5" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{m.descripcion}</p>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(m.createdAt)} · {m.usuarioNombre} ·{' '}
                      <span className="font-semibold">{m.metodoPago}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-base font-black ${
                      esEgreso ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {esEgreso ? '−' : '+'} {formatCurrency(m.monto)}
                  </p>
                  <Badge
                    variant={
                      esEgreso ? 'danger' : m.tipo === 'INGRESO_VENTA' ? 'success' : 'info'
                    }
                  >
                    {m.tipo.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
