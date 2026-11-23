import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CreditCard, Wallet } from 'lucide-react';
import { cajaService, FiltroMovimientoCaja } from '../../../services/caja.service';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';

const ETIQUETA_TIPO_CAJA: Record<string, string> = {
  INGRESO_VENTA: 'Venta',
  INGRESO_MANUAL: 'Ingreso manual',
  EGRESO_MANUAL: 'Egreso manual',
  EGRESO_ANULACION: 'Anulación',
};

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
};

export const MovimientosTurnoPanel: React.FC = () => {
  const [movFiltro, setMovFiltro] = useState<FiltroMovimientoCaja>('TODOS');
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof cajaService.obtenerMovimientos>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setResultado(null);
    setError(null);
    void cajaService.obtenerMovimientos(pagina, movFiltro).then((datos) => {
      if (vigente) setResultado(datos);
    }).catch((err: unknown) => {
      if (vigente) setError(err instanceof Error ? err.message : 'No se pudieron cargar los movimientos');
    });
    return () => { vigente = false; };
  }, [movFiltro, pagina]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900">
          Movimientos del turno {resultado && "(" + resultado.meta.total + ")"}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {([
            { id: 'TODOS', label: 'Todos' },
            { id: 'VENTAS', label: 'Ventas' },
            { id: 'INGRESOS', label: 'Ingresos manuales' },
            { id: 'EGRESOS', label: 'Egresos / Anulaciones' },
          ] as const).map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={movFiltro === f.id}
              onClick={() => {
                setMovFiltro(f.id);
                setPagina(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${movFiltro === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100" aria-busy={!resultado && !error}>
        {error ? <Alert type="error" message={error} /> : !resultado ? (
          <div className="space-y-3 py-3">
            <p role="status" className="sr-only">Cargando movimientos del turno...</p>
            {[1, 2, 3].map((n) => (
              <div key={n} aria-hidden="true" className="flex animate-pulse items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-200" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-44 rounded bg-slate-200" />
                    <div className="h-3 w-32 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="h-5 w-20 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        ) : resultado.items.length === 0 ? (
          <EmptyState
            compact
            icon={Wallet}
            title="Sin movimientos en esta categoría"
            description={
              movFiltro === 'TODOS'
                ? 'Las ventas e ingresos o salidas de efectivo del turno actual aparecerán aquí.'
                : 'No hay registros de este tipo durante el turno actual.'
            }
            action={
              movFiltro !== 'TODOS'
                ? {
                  label: 'Ver todos los movimientos',
                  variant: 'secondary',
                  onClick: () => {
                    setMovFiltro('TODOS');
                    setPagina(1);
                  },
                }
                : undefined
            }
          />
        ) : (
          resultado.items.map((m) => {
            const esEgreso = m.tipo === 'EGRESO_MANUAL' || m.tipo === 'EGRESO_ANULACION';
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${esEgreso
                        ? 'bg-red-50 text-red-600'
                        : m.metodoPago === 'TARJETA'
                          ? 'bg-sky-50 text-sky-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                  >
                    {esEgreso ? (
                      <ArrowDownCircle className="h-5 w-5" aria-hidden="true" />
                    ) : m.metodoPago === 'TARJETA' ? (
                      <CreditCard className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{m.descripcion}</p>
                    <p className="text-xs text-slate-600">
                      {formatDateTime(m.createdAt)} · {m.usuarioNombre} ·{' '}
                      <span className="font-semibold">
                        {ETIQUETA_METODO[m.metodoPago] ?? m.metodoPago}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-base font-black ${esEgreso ? 'text-red-600' : 'text-emerald-700'
                      }`}
                  >
                    {esEgreso ? '−' : '+'} {formatCurrency(m.monto)}
                  </p>
                  <Badge
                    variant={
                      esEgreso ? 'danger' : m.tipo === 'INGRESO_VENTA' ? 'success' : 'info'
                    }
                  >
                    {ETIQUETA_TIPO_CAJA[m.tipo] ?? m.tipo.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </div>
      {resultado && resultado.meta.totalPages > 1 && <Pagination meta={resultado.meta} onPageChange={setPagina} />}
    </div>
  );
};
