import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { BarChart3, Bike, FileDown, FileSpreadsheet, Filter, UtensilsCrossed } from 'lucide-react';
import { env } from '../../config/env';
import {
  PaginationMeta,
  ReporteDomiciliosModel,
  ReporteResumenModel,
  SerieVentasDiaModel,
  TopProductoModel,
} from '../../models';
import { isAbortError } from '../../services/httpClient';
import { reportesService } from '../../services/reportes.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { EmptyState } from '../components/common/EmptyState';
import { Field } from '../components/common/Field';
import { Pagination } from '../components/common/Pagination';
import { TableSkeleton } from '../components/common/TableSkeleton';

import { rangoActual } from '../../utils/periodos';

export const ReportesPage: React.FC = () => {
  const canExport = useAuthStore((s) => s.can('reportes:exportar'));
  const puedeVerBalance = useAuthStore((s) => s.can('reportes:balance'));
  const [fechaDesde, setFechaDesde] = useState(() => rangoActual('mes').desde);
  const [fechaHasta, setFechaHasta] = useState(() => rangoActual('mes').hasta);
  const [resumen, setResumen] = useState<ReporteResumenModel | null>(null);
  const [serie, setSerie] = useState<SerieVentasDiaModel[]>([]);
  const [topProductos, setTopProductos] = useState<TopProductoModel[]>([]);
  const [reporteDomicilios, setReporteDomicilios] = useState<ReporteDomiciliosModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metaDetalle, setMetaDetalle] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [metaProductos, setMetaProductos] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const solicitudActual = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cargar = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const solicitud = ++solicitudActual.current;
    setLoading(true);
    setCargandoDetalle(false);
    setError(null);
    try {
      const [res, ser, top, dom] = await Promise.all([
        reportesService.obtenerResumen(fechaDesde, fechaHasta, controller.signal),
        reportesService.obtenerVentasPeriodo(fechaDesde, fechaHasta, 1, controller.signal),
        reportesService.obtenerTopProductos(fechaDesde, fechaHasta, 1, controller.signal),
        env.ENABLE_DELIVERY
          ? reportesService
              .obtenerReporteDomicilios(fechaDesde, fechaHasta, controller.signal)
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (solicitud !== solicitudActual.current || controller.signal.aborted) return;
      setResumen(res);
      setSerie(ser.items);
      setMetaDetalle(ser.meta);
      setTopProductos(top.items);
      setMetaProductos(top.meta);
      setReporteDomicilios(dom);
    } catch (err) {
      if (isAbortError(err) || solicitud !== solicitudActual.current) return;
      setError(err instanceof Error ? err.message : 'Error cargando reportes');
      setResumen(null);
      setSerie([]);
      setTopProductos([]);
    } finally {
      if (solicitud === solicitudActual.current) setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  useEffect(() => {
    void cargar();
    return () => {
      abortRef.current?.abort();
    };
  }, [cargar]);

  const cargarPaginaDetalle = async (page: number, listado: 'dias' | 'productos') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const solicitud = ++solicitudActual.current;
    setCargandoDetalle(true);
    setError(null);
    try {
      if (listado === 'dias') {
        const { items, meta } = await reportesService.obtenerVentasPeriodo(
          fechaDesde,
          fechaHasta,
          page,
          controller.signal,
        );
        if (solicitud !== solicitudActual.current || controller.signal.aborted) return;
        setSerie(items);
        setMetaDetalle(meta);
      } else {
        const { items, meta } = await reportesService.obtenerTopProductos(
          fechaDesde,
          fechaHasta,
          page,
          controller.signal,
        );
        if (solicitud !== solicitudActual.current || controller.signal.aborted) return;
        setTopProductos(items);
        setMetaProductos(meta);
      }
    } catch (err) {
      if (isAbortError(err) || solicitud !== solicitudActual.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar la página del reporte');
    } finally {
      if (solicitud === solicitudActual.current) setCargandoDetalle(false);
    }
  };

  const exportar = async (formato: 'pdf' | 'excel') => {
    setExporting(formato);
    setError(null);
    try {
      if (formato === 'pdf') {
        await reportesService.descargarPdf(fechaDesde, fechaHasta);
      } else {
        await reportesService.descargarExcel(fechaDesde, fechaHasta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar el reporte');
    } finally {
      setExporting(null);
    }
  };

  const k = resumen?.kpis;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Ventas y ganancias</h1>
          <p className="text-sm text-slate-500">
            Elige un período para ver cuánto vendiste, cuánto costó y qué margen quedó.
          </p>
        </div>

        {canExport && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void exportar('pdf')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              {exporting === 'pdf' ? 'Generando PDF...' : 'Exportar PDF'}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void exportar('excel')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              {exporting === 'excel' ? 'Generando Excel...' : 'Exportar Excel'}
            </button>
          </div>
        )}
      </div>

      <h2 className="text-lg font-bold text-slate-900">Estadísticas de ventas</h2>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="Fecha inicial" labelClassName="mb-1 block text-sm font-bold text-slate-700">
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        <Field label="Fecha final" labelClassName="mb-1 block text-sm font-bold text-slate-700">
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        <button
          type="button"
          onClick={() => void cargar()}
          className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Actualizar reporte
        </button>
        <div className="flex gap-1.5">
          {([
            { label: 'Hoy', periodo: 'dia' },
            { label: 'Esta semana', periodo: 'semana' },
            { label: 'Este mes', periodo: 'mes' },
          ] as const).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const { desde, hasta } = rangoActual(preset.periodo);
                setFechaDesde(desde);
                setFechaHasta(hasta);
              }}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Ingresos Totales</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {formatCurrency(k?.ingresosTotales ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {k?.cantidadVentas ?? 0} ventas · Ticket prom: {formatCurrency(k?.ticketPromedio ?? 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Costo Recetas + Mermas</p>
          <p className="mt-1 text-2xl font-black text-amber-700">
            {formatCurrency((k?.costoRecetasTotal ?? 0) + (k?.costoMermasTotal ?? 0))}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Recetas: {formatCurrency(k?.costoRecetasTotal ?? 0)} · Mermas:{' '}
            {formatCurrency(k?.costoMermasTotal ?? 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Utilidad antes de nómina y otros gastos</p>
          <p className={`mt-1 text-2xl font-black ${(k?.utilidadBruta ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {formatCurrency(k?.utilidadBruta ?? 0)}
          </p>
          <p className="mt-1 text-xs font-bold text-emerald-600">
            Margen: {(k?.margenBrutoPct ?? 0).toFixed(1)}%
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">IVA 12% & Métodos</p>
          <p className="mt-1 text-xl font-black text-sky-700">{formatCurrency(k?.ivaTotal ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Efec: {formatCurrency(resumen?.porMetodoPago.EFECTIVO?.total ?? 0)} · Tarj:{' '}
            {formatCurrency(resumen?.porMetodoPago.TARJETA?.total ?? 0)}
          </p>
        </div>
      </div>

      {!puedeVerBalance && resumen && !loading && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">Balance del período</h2>
          <p className="mt-1 text-sm text-slate-600">
            La ganancia es la venta sin IVA menos el costo de lo vendido y las mermas, antes de salarios y otros gastos.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-slate-600">Ventas del período sin IVA</dt>
              <dd className="text-xl font-bold text-slate-900">{formatCurrency(resumen.kpis.subtotalSinIva)}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Compras de inventario del período</dt>
              <dd className="text-xl font-bold text-slate-900">{formatCurrency(resumen.kpis.totalCompras)}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Valor del inventario disponible hoy</dt>
              <dd className="text-xl font-bold text-slate-900">
                {resumen.kpis.valorInventarioActual === null ? 'No disponible' : formatCurrency(resumen.kpis.valorInventarioActual)}
              </dd>
              {resumen.kpis.insumosConStockSinCosto > 0 && (
                <dd className="text-xs font-semibold text-amber-800">
                  Insumos con existencias y costo pendiente: {resumen.kpis.insumosConStockSinCosto}
                </dd>
              )}
            </div>
          </dl>
        </section>
      )}

      {/* Gráficos */}
      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-600">Generando estadísticas...</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">
              Ventas, costos y ganancia por día
            </h2>
            {serie.length === 0 ? (
              <EmptyState
                compact
                icon={BarChart3}
                title="Sin ventas ni mermas en este período"
                description="Selecciona otro rango de fechas o usa los accesos rápidos para consultar otros días."
              />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: number) => formatCurrency(val)} />
                    <Legend />
                    <Bar dataKey="ingresosSinIva" name="Ventas sin IVA" fill="#ea580c" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="costos" name="Costo de lo vendido" fill="#64748b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="mermas" name="Mermas" fill="#a16207" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="utilidad" name="Ganancia" fill="#047857" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {cargandoDetalle ? <p role="status" className="mt-4 text-sm text-slate-600">Cargando página…</p>
              : metaDetalle.totalPages > 1 && <Pagination meta={metaDetalle} onPageChange={(page) => void cargarPaginaDetalle(page, 'dias')} />}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">
              Platillos Más Vendidos (Unidades)
            </h2>
            {topProductos.length === 0 ? (
              <EmptyState
                compact
                icon={UtensilsCrossed}
                title="Sin datos de platillos"
                description="Cuando se registren ventas en el rango elegido, aquí aparecerán los más vendidos."
              />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProductos.slice(0, 7)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="nombre" type="category" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="cantidadVendida" name="Unidades" fill="#0284c7" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabla detallada Top Productos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
        <h2 className="mb-3 text-base font-bold text-slate-900">Rentabilidad por Platillo</h2>
        <table className="w-full min-w-[620px] text-left text-sm">
          <caption className="sr-only">
            Rentabilidad, unidades vendidas, ingresos y costos por platillo
          </caption>
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th scope="col" className="py-2.5 px-2">Platillo</th>
              <th scope="col" className="py-2.5 px-2 text-right">Unidades</th>
              <th scope="col" className="py-2.5 px-2 text-right">Ingresos</th>
              <th scope="col" className="py-2.5 px-2 text-right">Costo Receta</th>
              <th scope="col" className="py-2.5 px-2 text-right">Utilidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading || cargandoDetalle ? (
              <TableSkeleton rows={5} cols={5} label="Cargando rentabilidad por platillo..." />
            ) : topProductos.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    icon={BarChart3}
                    title="Sin ventas de platillos en este período"
                    description="No se registraron platillos vendidos en las fechas seleccionadas."
                    action={{
                      label: 'Ver este mes',
                      variant: 'secondary',
                      onClick: () => {
                        const { desde, hasta } = rangoActual('mes');
                        setFechaDesde(desde);
                        setFechaHasta(hasta);
                      },
                    }}
                  />
                </td>
              </tr>
            ) : (
              topProductos.map((p) => (
                <tr key={p.platilloId}>
                  <td className="py-2.5 px-2 font-bold text-slate-900">{p.nombre}</td>
                  <td className="py-2.5 px-2 text-right">{p.cantidadVendida}</td>
                  <td className="py-2.5 px-2 text-right font-semibold">{formatCurrency(p.ingresos)}</td>
                  <td className="py-2.5 px-2 text-right text-slate-600">{formatCurrency(p.costoTotal)}</td>
                  <td className="py-2.5 px-2 text-right font-bold text-emerald-700">
                    {formatCurrency(p.utilidad)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && !cargandoDetalle && metaProductos.totalPages > 1 && (
          <Pagination meta={metaProductos} onPageChange={(page) => void cargarPaginaDetalle(page, 'productos')} />
        )}
      </div>

      {/* Sección analítica de Servicio a Domicilio (solo si VITE_ENABLE_DELIVERY=true) */}
      {env.ENABLE_DELIVERY && reporteDomicilios && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Bike className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-slate-900">
              Desempeño de Servicio a Domicilio
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Pedidos</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {reporteDomicilios.kpis.totalPedidos}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Entregados</p>
              <p className="mt-1 text-xl font-black text-emerald-700">
                {reporteDomicilios.kpis.entregados}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Tiempo prom.</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {reporteDomicilios.kpis.tiempoPromedioEntregaMin} min
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Fallos / Canc.</p>
              <p className="mt-1 text-xl font-black text-red-700">
                {reporteDomicilios.kpis.tasaFalloPct}% / {reporteDomicilios.kpis.tasaCancelacionPct}%
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Ingresos envío</p>
              <p className="mt-1 text-xl font-black text-brand-700">
                {formatCurrency(reporteDomicilios.kpis.ingresosEnvioTotal)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500">Mermas dom.</p>
              <p className="mt-1 text-xl font-black text-amber-700">
                {formatCurrency(reporteDomicilios.kpis.costoMermasDomicilio)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 text-xs font-extrabold uppercase text-slate-600">Por zona</h3>
              {reporteDomicilios.porZona.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Sin pedidos en este período.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">Zona</th>
                      <th className="py-2 text-right">Pedidos</th>
                      <th className="py-2 text-right">Entreg.</th>
                      <th className="py-2 text-right">Prom.</th>
                      <th className="py-2 text-right">Envíos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reporteDomicilios.porZona.map((z) => (
                      <tr key={z.zonaEntregaId}>
                        <td className="py-2 font-bold text-slate-900">{z.zonaNombre}</td>
                        <td className="py-2 text-right">{z.totalPedidos}</td>
                        <td className="py-2 text-right text-emerald-700">{z.entregados}</td>
                        <td className="py-2 text-right">{z.tiempoPromedioMin} min</td>
                        <td className="py-2 text-right font-semibold">{formatCurrency(z.ingresosEnvio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 text-xs font-extrabold uppercase text-slate-600">Por repartidor</h3>
              {reporteDomicilios.porRepartidor.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Sin asignaciones en este período.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2">Repartidor</th>
                      <th className="py-2 text-right">Entreg.</th>
                      <th className="py-2 text-right">Fallidos</th>
                      <th className="py-2 text-right">Ruta prom.</th>
                      <th className="py-2 text-right">Dif. caja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reporteDomicilios.porRepartidor.map((r) => (
                      <tr key={r.repartidorId}>
                        <td className="py-2 font-bold text-slate-900">{r.nombreCompleto}</td>
                        <td className="py-2 text-right text-emerald-700">{r.entregados}</td>
                        <td className="py-2 text-right text-red-700">{r.fallidos}</td>
                        <td className="py-2 text-right">{r.tiempoPromedioRutaMin} min</td>
                        <td className="py-2 text-right font-semibold">
                          {formatCurrency(r.diferenciaAcumulada)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
