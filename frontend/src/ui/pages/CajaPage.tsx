import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Wallet,
  LockOpen,
  Lock,
  ArrowUpCircle,
  ArrowDownCircle,
  Banknote,
  CreditCard,
  Clock,
  Calculator,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  History,
  Coins,
} from 'lucide-react';
import { CajaSesionModel, PaginationMeta } from '../../models';
import { cajaService } from '../../services/caja.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';

// Denominaciones oficiales de billetes y monedas de Guatemala (GTQ) para arqueo profesional
const DENOMINACIONES_GTQ = [
  { key: '200', label: 'Q 200', valor: 200, tipo: 'Billete' },
  { key: '100', label: 'Q 100', valor: 100, tipo: 'Billete' },
  { key: '50', label: 'Q 50', valor: 50, tipo: 'Billete' },
  { key: '20', label: 'Q 20', valor: 20, tipo: 'Billete' },
  { key: '10', label: 'Q 10', valor: 10, tipo: 'Billete' },
  { key: '5', label: 'Q 5', valor: 5, tipo: 'Billete' },
  { key: '1', label: 'Q 1', valor: 1, tipo: 'Moneda' },
  { key: '0.5', label: 'Q 0.50', valor: 0.5, tipo: 'Moneda' },
  { key: '0.25', label: 'Q 0.25', valor: 0.25, tipo: 'Moneda' },
] as const;

const CONCEPTOS_EGRESO = [
  'Compra de hielo / insumo menor',
  'Pago de propinas / mensajería',
  'Retiro parcial a caja fuerte',
  'Gasto operativo de cocina',
];

const CONCEPTOS_INGRESO = [
  'Refuerzo de sencillo / cambio',
  'Ingreso adicional en efectivo',
  'Reposición de fondo de caja',
];

type MovFiltro = 'TODOS' | 'VENTAS' | 'INGRESOS' | 'EGRESOS';

export const CajaPage: React.FC = () => {
  const canOpen = useAuthStore((s) => s.can('caja:abrir'));
  const canMove = useAuthStore((s) => s.can('caja:movimiento'));
  const canClose = useAuthStore((s) => s.can('caja:cerrar'));

  const [actual, setActual] = useState<CajaSesionModel | null>(null);
  const [historial, setHistorial] = useState<CajaSesionModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [movFiltro, setMovFiltro] = useState<MovFiltro>('TODOS');

  // Apertura
  const [montoInicial, setMontoInicial] = useState('500.00');
  const [obsApertura, setObsApertura] = useState('');

  // Modal de Movimiento Manual
  const [movModal, setMovModal] = useState(false);
  const [movForm, setMovForm] = useState({
    tipo: 'EGRESO_MANUAL' as 'INGRESO_MANUAL' | 'EGRESO_MANUAL',
    monto: '',
    descripcion: '',
  });

  // Modal de Cierre con Arqueo GTQ (por billetes o monto directo)
  const [closeModal, setCloseModal] = useState(false);
  const [modoArqueo, setModoArqueo] = useState<'denominaciones' | 'directo'>('denominaciones');
  const [conteoBilletes, setConteoBilletes] = useState<Record<string, string>>({});
  const [montoContadoDirecto, setMontoContadoDirecto] = useState('');
  const [obsCierre, setObsCierre] = useState('');

  const cargar = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [cajaActual, hist] = await Promise.all([
        cajaService.obtenerActual(),
        cajaService.listarHistorial(page),
      ]);
      setActual(cajaActual);
      setHistorial(hist.items);
      setMeta(hist.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando información de caja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  // Cálculo automático del arqueo por denominaciones de Guatemala
  const totalPorDenominaciones = useMemo(() => {
    return DENOMINACIONES_GTQ.reduce((sum, d) => {
      const qty = Number(conteoBilletes[d.key] || 0);
      return sum + (Number.isFinite(qty) && qty > 0 ? qty * d.valor : 0);
    }, 0);
  }, [conteoBilletes]);

  const montoContadoFinal =
    modoArqueo === 'denominaciones'
      ? Math.round(totalPorDenominaciones * 100) / 100
      : Number(montoContadoDirecto || 0);

  const diferenciaPreview = actual
    ? Math.round((montoContadoFinal - actual.montoEsperadoEfectivo) * 100) / 100
    : 0;

  const movimientosFiltrados = useMemo(() => {
    if (!actual) return [];
    return actual.movimientos.filter((m) => {
      if (movFiltro === 'VENTAS') return m.tipo === 'INGRESO_VENTA';
      if (movFiltro === 'INGRESOS') return m.tipo === 'INGRESO_MANUAL';
      if (movFiltro === 'EGRESOS')
        return m.tipo === 'EGRESO_MANUAL' || m.tipo === 'EGRESO_ANULACION';
      return true;
    });
  }, [actual, movFiltro]);

  const totalVentasTurno = actual
    ? actual.totalVentasEfectivo + actual.totalVentasTarjeta
    : 0;
  const pctEfectivo =
    totalVentasTurno > 0 ? Math.round((actual!.totalVentasEfectivo / totalVentasTurno) * 100) : 0;
  const pctTarjeta = totalVentasTurno > 0 ? 100 - pctEfectivo : 0;

  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await cajaService.abrir(Number(montoInicial), obsApertura || undefined);
      setSuccess('Turno de caja abierto correctamente. El punto de venta ya está habilitado.');
      setObsApertura('');
      await cargar(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la caja');
    }
  };

  const handleMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await cajaService.registrarMovimiento({
        tipo: movForm.tipo,
        monto: Number(movForm.monto),
        descripcion: movForm.descripcion,
      });
      setMovModal(false);
      setMovForm({ tipo: 'EGRESO_MANUAL', monto: '', descripcion: '' });
      setSuccess('Movimiento registrado en la sesión de caja y auditado.');
      await cargar(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento');
    }
  };

  const abrirModalCierre = () => {
    if (!actual) return;
    setConteoBilletes({});
    setMontoContadoDirecto(actual.montoEsperadoEfectivo.toFixed(2));
    setObsCierre('');
    setModoArqueo('denominaciones');
    setCloseModal(true);
  };

  const handleCerrarCaja = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const cerrada = await cajaService.cerrar(montoContadoFinal, obsCierre || undefined);
      setCloseModal(false);
      setSuccess(
        `Turno #${cerrada.id} cerrado. Esperado: ${formatCurrency(cerrada.montoEsperadoEfectivo)} | Contado: ${formatCurrency(cerrada.montoContadoEfectivo ?? 0)} | Diferencia: ${formatCurrency(cerrada.diferencia ?? 0)}.`,
      );
      await cargar(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    }
  };

  return (
    <div className="space-y-5">
      {/* ==================== HEADER PROFESIONAL DE TURNO ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              actual
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Wallet className="h-7 w-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900">Control de Caja y Arqueo</h1>
              {actual ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                  TURNO #{actual.id} ABIERTO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700">
                  CAJA CERRADA
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
              {actual ? (
                <>
                  <Clock className="h-4 w-4" />
                  Abierta el {formatDateTime(actual.fechaApertura)} por{' '}
                  <strong className="text-slate-700">{actual.usuarioAperturaNombre}</strong>
                </>
              ) : (
                'Abre un turno con fondo inicial para habilitar las ventas y el registro de cobros.'
              )}
            </p>
          </div>
        </div>

        {actual && (
          <div className="flex flex-wrap gap-2.5">
            {canMove && (
              <button
                type="button"
                onClick={() => {
                  setMovForm({ tipo: 'EGRESO_MANUAL', monto: '', descripcion: '' });
                  setMovModal(true);
                }}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                <PlusCircle className="h-4 w-4 text-brand-600" />
                Ingreso / Egreso
              </button>
            )}
            {canClose && (
              <button
                type="button"
                onClick={abrirModalCierre}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700"
              >
                <Lock className="h-4 w-4" />
                Realizar Arqueo y Cierre
              </button>
            )}
          </div>
        )}
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-slate-400">Cargando estado de caja...</div>
      ) : !actual ? (
        /* ==================== PANEL DE APERTURA INTUITIVO ==================== */
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <div className="mb-5 flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <LockOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Iniciar Turno de Caja</h2>
              <p className="text-sm text-slate-500">
                Ingresa el efectivo inicial disponible en la gaveta para dar cambio.
              </p>
            </div>
          </div>

          {canOpen ? (
            <form onSubmit={handleAbrirCaja} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Fondo inicial en efectivo (GTQ)
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoInicial}
                  onChange={(e) => setMontoInicial(e.target.value)}
                  className="min-h-[54px] w-full rounded-xl border border-slate-300 px-4 text-2xl font-black text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[200, 300, 500, 1000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMontoInicial(val.toFixed(2))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                    >
                      {formatCurrency(val)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Nota de apertura (opcional)
                </label>
                <input
                  type="text"
                  value={obsApertura}
                  onChange={(e) => setObsApertura(e.target.value)}
                  placeholder="Ej. Turno almuerzo · Sencillo completo"
                  className="min-h-[46px] w-full rounded-xl border border-slate-300 px-3.5 text-sm"
                />
              </div>

              <button
                type="submit"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-extrabold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700"
              >
                <LockOpen className="h-5 w-5" />
                Abrir Caja con {formatCurrency(Number(montoInicial || 0))}
              </button>
            </form>
          ) : (
            <Alert
              type="warning"
              message="Tu rol no tiene permiso para abrir caja. Solicita a un cajero o administrador."
            />
          )}
        </div>
      ) : (
        /* ==================== PANEL EN VIVO: ECUACIÓN DE GAVETA + TARJETAS ==================== */
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Bloque Izquierdo (7 cols): Ecuación clara del efectivo en gaveta */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Flujo de Efectivo en Gaveta
                </h2>
              </div>
              <span className="text-xs font-semibold text-slate-400">Cálculo en tiempo real</span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="text-[11px] font-bold uppercase text-slate-500">Fondo Inicial</p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {formatCurrency(actual.montoInicial)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase text-emerald-700">+ Ventas Efectivo</p>
                <p className="mt-1 text-lg font-black text-emerald-700">
                  {formatCurrency(actual.totalVentasEfectivo)}
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase text-sky-700">+ Ingresos Extra</p>
                <p className="mt-1 text-lg font-black text-sky-700">
                  {formatCurrency(actual.totalIngresosExtra)}
                </p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5">
                <p className="text-[11px] font-bold uppercase text-red-700">− Egresos / Anul.</p>
                <p className="mt-1 text-lg font-black text-red-600">
                  {formatCurrency(actual.totalEgresos)}
                </p>
              </div>
            </div>

            {/* Resultado principal de gaveta */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-300">
                  Efectivo Esperado en Gaveta
                </p>
                <p className="text-xs text-slate-400">
                  Monto que debe existir físicamente al hacer el arqueo
                </p>
              </div>
              <p className="text-3xl font-black text-white">
                {formatCurrency(actual.montoEsperadoEfectivo)}
              </p>
            </div>
          </div>

          {/* Bloque Derecho (5 cols): Resumen de Ventas del Turno y Tarjetas */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-5">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-sky-600" />
                <h2 className="text-base font-extrabold text-slate-900">
                  Resumen de Cobros del Turno
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-slate-500">Total Vendido</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {formatCurrency(totalVentasTurno)}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-sky-700">Vouchers Tarjeta</p>
                  <p className="mt-1 text-2xl font-black text-sky-700">
                    {formatCurrency(actual.totalVentasTarjeta)}
                  </p>
                </div>
              </div>
            </div>

            {/* Barra proporcional Efectivo vs Tarjeta */}
            <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
              <div className="mb-2 flex justify-between text-xs font-bold">
                <span className="text-emerald-700">Efectivo ({pctEfectivo}%)</span>
                <span className="text-sky-700">Tarjeta ({pctTarjeta}%)</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${pctEfectivo}%` }}
                />
                <div className="bg-sky-500 transition-all" style={{ width: `${pctTarjeta}%` }} />
              </div>
              <p className="mt-2.5 text-xs text-slate-500">
                Total general esperado (gaveta + tarjetas):{' '}
                <strong className="text-slate-800">
                  {formatCurrency(actual.totalGeneralEsperado)}
                </strong>
              </p>
            </div>
          </div>

          {/* ==================== BITÁCORA DE MOVIMIENTOS DEL TURNO ==================== */}
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
        </div>
      )}

      {/* ==================== HISTORIAL DE TURNOS Y CUADRES ==================== */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-extrabold text-slate-900">Historial de Cierres y Cuadres</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-3 px-2">Turno / Fecha</th>
                <th className="py-3 px-2">Responsables</th>
                <th className="py-3 px-2 text-right">Inicial</th>
                <th className="py-3 px-2 text-right">Ventas Totales</th>
                <th className="py-3 px-2 text-right">Esperado Efec.</th>
                <th className="py-3 px-2 text-right">Contado</th>
                <th className="py-3 px-2 text-right">Diferencia</th>
                <th className="py-3 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Aún no hay sesiones de caja registradas.
                  </td>
                </tr>
              ) : (
                historial.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-3 px-2">
                      <p className="font-bold text-slate-900">Turno #{s.id}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(s.fechaApertura)}</p>
                    </td>
                    <td className="py-3 px-2 text-xs text-slate-600">
                      <p>Abre: {s.usuarioAperturaNombre}</p>
                      {s.usuarioCierreNombre && <p>Cierra: {s.usuarioCierreNombre}</p>}
                    </td>
                    <td className="py-3 px-2 text-right">{formatCurrency(s.montoInicial)}</td>
                    <td className="py-3 px-2 text-right font-semibold text-slate-800">
                      {formatCurrency(s.totalVentasEfectivo + s.totalVentasTarjeta)}
                    </td>
                    <td className="py-3 px-2 text-right font-semibold">
                      {formatCurrency(s.montoEsperadoEfectivo)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {s.montoContadoEfectivo !== null ? formatCurrency(s.montoContadoEfectivo) : '—'}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {s.diferencia === null ? (
                        <span className="text-slate-400">—</span>
                      ) : s.diferencia === 0 ? (
                        <Badge variant="success">Exacto Q 0.00</Badge>
                      ) : s.diferencia > 0 ? (
                        <Badge variant="info">+{formatCurrency(s.diferencia)}</Badge>
                      ) : (
                        <Badge variant="danger">{formatCurrency(s.diferencia)}</Badge>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={s.estado === 'ABIERTA' ? 'success' : 'neutral'}>
                        {s.estado}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onPageChange={(p) => void cargar(p)} />
      </div>

      {/* ==================== MODAL DE MOVIMIENTO MANUAL ==================== */}
      <Modal
        open={movModal}
        title="Registrar Ingreso o Egreso de Caja"
        onClose={() => setMovModal(false)}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleMovimiento} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMovForm({ ...movForm, tipo: 'EGRESO_MANUAL', descripcion: '' })}
              className={`flex min-h-[50px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
                movForm.tipo === 'EGRESO_MANUAL'
                  ? 'border-red-600 bg-red-50 text-red-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ArrowDownCircle className="h-5 w-5" />
              Egreso / Salida
            </button>
            <button
              type="button"
              onClick={() => setMovForm({ ...movForm, tipo: 'INGRESO_MANUAL', descripcion: '' })}
              className={`flex min-h-[50px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-extrabold ${
                movForm.tipo === 'INGRESO_MANUAL'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ArrowUpCircle className="h-5 w-5" />
              Ingreso / Entrada
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Monto (Q)</label>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={movForm.monto}
              onChange={(e) => setMovForm({ ...movForm, monto: e.target.value })}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 px-4 text-lg font-black"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Descripción / Concepto
            </label>
            <input
              required
              minLength={3}
              placeholder="Describe el motivo del movimiento..."
              value={movForm.descripcion}
              onChange={(e) => setMovForm({ ...movForm, descripcion: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(movForm.tipo === 'EGRESO_MANUAL' ? CONCEPTOS_EGRESO : CONCEPTOS_INGRESO).map(
                (sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setMovForm({ ...movForm, descripcion: sug })}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {sug}
                  </button>
                ),
              )}
            </div>
          </div>

          <button
            type="submit"
            className="min-h-[48px] w-full rounded-xl bg-slate-900 text-sm font-extrabold text-white hover:bg-slate-800"
          >
            Guardar Movimiento en Caja
          </button>
        </form>
      </Modal>

      {/* ==================== MODAL PROFESIONAL DE ARQUEO Y CIERRE GTQ ==================== */}
      <Modal
        open={closeModal}
        title="Arqueo de Efectivo y Cierre Diario"
        onClose={() => setCloseModal(false)}
        maxWidthClass="max-w-2xl"
      >
        {actual && (
          <form onSubmit={handleCerrarCaja} className="space-y-4">
            {/* Switch entre Contador de Billetes GTQ e Ingreso Directo */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setModoArqueo('denominaciones')}
                className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs font-extrabold transition ${
                  modoArqueo === 'denominaciones'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <Coins className="h-4 w-4 text-brand-600" />
                Contar Billetes y Monedas (GTQ)
              </button>
              <button
                type="button"
                onClick={() => setModoArqueo('directo')}
                className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-xs font-extrabold transition ${
                  modoArqueo === 'directo'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                <Calculator className="h-4 w-4 text-brand-600" />
                Ingresar Total Directo
              </button>
            </div>

            {modoArqueo === 'denominaciones' ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DENOMINACIONES_GTQ.map((d) => {
                  const qty = Number(conteoBilletes[d.key] || 0);
                  const sub = qty > 0 ? qty * d.valor : 0;
                  return (
                    <div
                      key={d.key}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-900">{d.label}</p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {sub > 0 ? formatCurrency(sub) : d.tipo}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={conteoBilletes[d.key] ?? ''}
                        onChange={(e) =>
                          setConteoBilletes((prev) => ({ ...prev, [d.key]: e.target.value }))
                        }
                        className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm font-extrabold"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Total efectivo físico contado en gaveta (Q)
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={montoContadoDirecto}
                  onChange={(e) => setMontoContadoDirecto(e.target.value)}
                  className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 text-2xl font-black"
                />
              </div>
            )}

            {/* Panel de Cuadre Esperado vs Contado */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-500">Esperado</p>
                  <p className="mt-0.5 text-lg font-black text-slate-900">
                    {formatCurrency(actual.montoEsperadoEfectivo)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-500">Contado</p>
                  <p className="mt-0.5 text-lg font-black text-brand-700">
                    {formatCurrency(montoContadoFinal)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase text-slate-500">Diferencia</p>
                  <p
                    className={`mt-0.5 text-lg font-black ${
                      diferenciaPreview === 0
                        ? 'text-emerald-700'
                        : diferenciaPreview > 0
                          ? 'text-sky-700'
                          : 'text-red-600'
                    }`}
                  >
                    {diferenciaPreview > 0 ? '+' : ''}
                    {formatCurrency(diferenciaPreview)}
                  </p>
                </div>
              </div>

              <div
                className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${
                  diferenciaPreview === 0
                    ? 'bg-emerald-100 text-emerald-900'
                    : diferenciaPreview > 0
                      ? 'bg-sky-100 text-sky-900'
                      : 'bg-red-100 text-red-900'
                }`}
              >
                {diferenciaPreview === 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Cuadre perfecto — Sin diferencias en gaveta
                  </>
                ) : diferenciaPreview > 0 ? (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    Sobrante de efectivo por {formatCurrency(diferenciaPreview)}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    Faltante de efectivo por {formatCurrency(Math.abs(diferenciaPreview))}
                  </>
                )}
              </div>

              <p className="mt-2 text-center text-xs text-slate-500">
                Vouchers de tarjeta a conciliar:{' '}
                <strong className="text-slate-700">{formatCurrency(actual.totalVentasTarjeta)}</strong>
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                Observaciones de cierre
              </label>
              <textarea
                rows={2}
                value={obsCierre}
                onChange={(e) => setObsCierre(e.target.value)}
                placeholder="Ej. Cierre nocturno sin novedades / explicación de diferencia..."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseModal(false)}
                className="min-h-[46px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[46px] rounded-xl bg-red-600 px-6 text-sm font-extrabold text-white shadow-md hover:bg-red-700"
              >
                Confirmar Cierre Diario
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
