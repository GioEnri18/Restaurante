import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Search, Trash2, X } from 'lucide-react';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { PaginationMeta } from '../../../models';
import { isAbortError } from '../../../services/httpClient';
import {
  inventarioService,
  MermaPorIngredienteItem,
  MermaPorIngredienteResumen,
} from '../../../services/inventario.service';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Field } from '../common/Field';
import { Pagination } from '../common/Pagination';
import { TableSkeleton } from '../common/TableSkeleton';

type PeriodoRapido = 'hoy' | '7d' | '30d' | 'mes' | 'todo' | 'custom';

const ETIQUETA_MOTIVO: Record<string, string> = {
  VENCIMIENTO: 'Vencimiento',
  DANO: 'Daño / Mal estado',
  ERROR_PREPARACION: 'Error preparación',
  ACCIDENTE: 'Accidente',
  OTRO: 'Otro',
};

function fechaIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function calcularRangoPeriodo(periodo: PeriodoRapido): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = fechaIsoLocal(hoy);
  if (periodo === 'hoy') return { desde: hasta, hasta };
  if (periodo === '7d') {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: fechaIsoLocal(d), hasta };
  }
  if (periodo === '30d') {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 29);
    return { desde: fechaIsoLocal(d), hasta };
  }
  if (periodo === 'mes') {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: fechaIsoLocal(d), hasta };
  }
  return { desde: '', hasta: '' };
}

/**
 * Vista compacta y auditable de merma total acumulada por ingrediente.
 * Paginación de 10 filas por página para evitar listas extensas y facilitar auditorías rápidas.
 */
export const MermasPorIngredientePanel: React.FC = () => {
  const [periodo, setPeriodo] = useState<PeriodoRapido>('30d');
  const rangoInicial = useMemo(() => calcularRangoPeriodo('30d'), []);
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.desde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.hasta);
  const [motivo, setMotivo] = useState('');
  const [ordenar, setOrdenar] = useState<'costo' | 'cantidad' | 'registros'>('costo');
  const [busqueda, setBusqueda] = useState('');
  const debouncedBusqueda = useDebouncedValue(busqueda, 300);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<MermaPorIngredienteItem[]>([]);
  const [resumen, setResumen] = useState<MermaPorIngredienteResumen>({
    ingredientesConMerma: 0,
    totalRegistros: 0,
    totalOzMermadas: 0,
    totalLbMermadas: 0,
    costoTotalMermas: 0,
  });
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const seleccionarPeriodo = (next: PeriodoRapido) => {
    setPeriodo(next);
    setPage(1);
    if (next !== 'custom') {
      const r = calcularRangoPeriodo(next);
      setFechaDesde(r.desde);
      setFechaHasta(r.hasta);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true);
    setError(null);

    inventarioService
      .listarMermasPorIngrediente(
        {
          page,
          limit: 10,
          search: debouncedBusqueda,
          motivo: motivo || undefined,
          fechaDesde: fechaDesde || undefined,
          fechaHasta: fechaHasta || undefined,
          ordenar,
        },
        controller.signal,
      )
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.items);
        setResumen(res.resumen);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen de mermas');
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });

    return () => controller.abort();
  }, [page, debouncedBusqueda, motivo, fechaDesde, fechaHasta, ordenar]);

  const hayFiltros = Boolean(busqueda.trim() || motivo || periodo !== '30d');

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* KPIs compactos en una sola fila */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5">
          <p className="text-[11px] font-bold uppercase text-rose-800">Pérdida total en merma</p>
          <p className="text-xl font-black text-rose-700">
            {formatCurrency(resumen.costoTotalMermas)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
          <p className="text-[11px] font-bold uppercase text-amber-900">Cantidad total mermada</p>
          <p className="text-xl font-black text-amber-800">
            {resumen.totalOzMermadas.toFixed(1)} oz{' '}
            <span className="text-xs font-bold text-amber-700">
              ({resumen.totalLbMermadas.toFixed(2)} lb)
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <p className="text-[11px] font-bold uppercase text-slate-600">Alcance de auditoría</p>
          <p className="text-xl font-black text-slate-900">
            {resumen.ingredientesConMerma} ing.{' '}
            <span className="text-xs font-bold text-slate-500">
              · {resumen.totalRegistros} registro(s)
            </span>
          </p>
        </div>
      </div>

      {/* Filtros compactos de auditoría */}
      <div className="space-y-2.5 border-y border-slate-100 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Período:
          </span>
          {(
            [
              { id: 'hoy', label: 'Hoy' },
              { id: '7d', label: '7 días' },
              { id: '30d', label: '30 días' },
              { id: 'mes', label: 'Este mes' },
              { id: 'todo', label: 'Todo' },
              { id: 'custom', label: 'Fechas' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => seleccionarPeriodo(p.id)}
              className={`min-h-[34px] rounded-lg px-3 text-xs font-bold transition ${
                periodo === p.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}

          {periodo === 'custom' && (
            <div className="flex flex-wrap items-center gap-1.5 pl-1">
              <input
                type="date"
                aria-label="Fecha desde"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPage(1);
                }}
                className="min-h-[34px] rounded-lg border border-slate-300 px-2 text-xs"
              />
              <span className="text-xs text-slate-400">a</span>
              <input
                type="date"
                aria-label="Fecha hasta"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPage(1);
                }}
                className="min-h-[34px] rounded-lg border border-slate-300 px-2 text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Field label="Buscar ingrediente" srOnlyLabel className="min-w-[200px] flex-1">
            {(controlProps) => (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  {...controlProps}
                  type="text"
                  maxLength={80}
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Filtrar ingrediente por nombre o código..."
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 text-xs outline-none focus:border-brand-500 focus:bg-white"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('');
                      setPage(1);
                    }}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
          </Field>

          <select
            aria-label="Filtrar por motivo de merma"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setPage(1);
            }}
            className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <option value="">Todos los motivos</option>
            {Object.entries(ETIQUETA_MOTIVO).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Ordenar resumen de mermas"
            value={ordenar}
            onChange={(e) => {
              setOrdenar(e.target.value as 'costo' | 'cantidad' | 'registros');
              setPage(1);
            }}
            className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <option value="costo">Orden: Mayor pérdida (Q)</option>
            <option value="cantidad">Orden: Mayor cantidad (oz)</option>
            <option value="registros">Orden: Más reincidencias</option>
          </select>

          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setMotivo('');
                setOrdenar('costo');
                seleccionarPeriodo('30d');
              }}
              className="min-h-[38px] rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Restablecer
            </button>
          )}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Tabla compacta (10 filas/página) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <caption className="sr-only">
            Merma total acumulada por ingrediente para auditoría de inventario
          </caption>
          <thead>
            <tr className="border-b text-[11px] uppercase text-slate-500">
              <th scope="col" className="px-2 py-2.5">Ingrediente</th>
              <th scope="col" className="px-2 py-2.5 text-center">Registros</th>
              <th scope="col" className="px-2 py-2.5 text-right">Merma total</th>
              <th scope="col" className="px-2 py-2.5 text-right">Costo perdido</th>
              <th scope="col" className="px-2 py-2.5">% del total</th>
              <th scope="col" className="px-2 py-2.5">Motivo principal</th>
              <th scope="col" className="px-2 py-2.5 text-right">Última merma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <TableSkeleton rows={5} cols={7} label="Cargando resumen de mermas por ingrediente..." />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={Trash2}
                    title="Sin mermas en este período"
                    description="No se registraron pérdidas de ingredientes con los filtros seleccionados."
                  />
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.ingredienteId} className="hover:bg-slate-50">
                  <td className="px-2 py-2.5">
                    <p className="font-bold text-slate-900">{item.nombre}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.codigo} · Stock actual: {item.stockActualOz.toFixed(1)} oz
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <Badge variant={item.cantidadRegistros >= 3 ? 'warning' : 'neutral'}>
                      {item.cantidadRegistros}×
                    </Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold text-slate-900">
                    {item.totalOz.toFixed(2)} oz
                    <span className="block text-[11px] font-normal text-slate-500">
                      {item.totalLb.toFixed(2)} lb
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right font-black text-rose-700">
                    {formatCurrency(item.costoTotal)}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${Math.min(100, item.porcentajeCosto)}%` }}
                        />
                      </div>
                      <span className="font-bold text-slate-700">
                        {item.porcentajeCosto.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-slate-700">
                    {item.motivoPrincipal
                      ? ETIQUETA_MOTIVO[item.motivoPrincipal] ?? item.motivoPrincipal
                      : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right text-slate-500">
                    {item.ultimaMerma ? formatDateTime(item.ultimaMerma) : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!cargando && meta.totalPages > 1 && (
        <Pagination meta={meta} onPageChange={setPage} />
      )}
    </div>
  );
};
