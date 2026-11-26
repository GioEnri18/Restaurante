import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  Coins,
  CheckCheck,
  CreditCard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { env } from '../../../config/env';
import { CajaSesionModel } from '../../../models';
import { cajaService, VoucherTurnoItem } from '../../../services/caja.service';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';
import {
  AUTORIZACION_VACIA,
  AutorizacionSupervisor,
  AutorizacionSupervisorFields,
} from './AutorizacionSupervisorFields';
import { ContadorBilletesGTQ, DENOMINACIONES_GTQ } from './ContadorBilletesGTQ';

interface ArqueoCierreModalProps {
  open: boolean;
  actual: CajaSesionModel | null;
  /** true cuando el usuario no tiene caja:autorizar (p. ej. un cajero): pide credenciales de supervisor */
  requiereAutorizacion: boolean;
  onClose: () => void;
  onConfirmarCierre: (payload: Parameters<typeof cajaService.cerrar>[0]) => Promise<void>;
}

interface VoucherSeleccionable {
  ventaId: number;
  referencia: string;
  monto: number;
  seleccionado: boolean;
}

const ETIQUETA_SERVICIO: Record<string, string> = {
  MOSTRADOR: 'Mostrador',
  LLEVAR: 'Para llevar',
  MESA: 'En mesa',
  DELIVERY: 'Delivery',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolverReferenciaVoucher(v: Pick<VoucherTurnoItem, 'ventaId' | 'referenciaPago' | 'numeroFactura'>): string {
  const ref = v.referenciaPago?.trim();
  if (ref) return ref;
  const fac = v.numeroFactura?.trim();
  if (fac) return fac;
  return `VOUCHER-${v.ventaId}`;
}

export const ArqueoCierreModal: React.FC<ArqueoCierreModalProps> = ({
  open,
  actual,
  requiereAutorizacion,
  onClose,
  onConfirmarCierre,
}) => {
  const [modoArqueo, setModoArqueo] = useState<'denominaciones' | 'directo'>('denominaciones');
  const [conteoBilletes, setConteoBilletes] = useState<Record<string, string>>({});
  const [montoContadoDirecto, setMontoContadoDirecto] = useState('');
  const [obsCierre, setObsCierre] = useState('');
  const [autorizacion, setAutorizacion] = useState<AutorizacionSupervisor>(AUTORIZACION_VACIA);
  const [turno, setTurno] = useState<Awaited<ReturnType<typeof cajaService.obtenerVouchersTurno>> | null>(null);
  const [vouchersMap, setVouchersMap] = useState<Record<number, VoucherSeleccionable>>({});
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({});
  const [seleccionandoTodos, setSeleccionandoTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (open && actual) {
      setConteoBilletes({});
      setMontoContadoDirecto('');
      setObsCierre('');
      setModoArqueo('denominaciones');
      setAutorizacion(AUTORIZACION_VACIA);
      setVouchersMap({});
      setExpandidos({});
      setError(null);
    }
  }, [open, actual]);

  const cajaId = actual?.id;
  useEffect(() => {
    if (!open || cajaId === undefined) return;
    let vigente = true;
    setTurno(null);
    setError(null);
    void cajaService.obtenerVouchersTurno(pagina).then((datos) => {
      if (!vigente) return;
      if (datos.cajaId !== cajaId) {
        setError('El turno cambió. Vuelve a cargar la página de Caja.');
        return;
      }
      if (pagina > datos.meta.totalPages) {
        setPagina(datos.meta.totalPages);
        return;
      }
      setTurno(datos);
      setVouchersMap((prev) => {
        const next = { ...prev };
        for (const v of datos.ventas) {
          if (!next[v.ventaId]) {
            next[v.ventaId] = {
              ventaId: v.ventaId,
              referencia: resolverReferenciaVoucher(v),
              monto: round2(v.monto),
              seleccionado: false,
            };
          }
        }
        return next;
      });
    }).catch((err: unknown) => {
      if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de vouchers');
    });
    return () => { vigente = false; };
  }, [open, cajaId, pagina, recarga]);

  const vouchersSeleccionados = useMemo(
    () =>
      Object.values(vouchersMap)
        .filter((v) => v.seleccionado)
        .map(({ ventaId, referencia, monto }) => ({ ventaId, referencia, monto })),
    [vouchersMap],
  );

  const conciliacionCompleta =
    turno !== null && vouchersSeleccionados.length === turno.meta.total;

  // Selecciona o deselecciona todos los vouchers del turno (incluyendo páginas adicionales si existen)
  async function handleToggleSeleccionarTodos() {
    if (!turno || seleccionandoTodos || cerrando) return;

    if (conciliacionCompleta) {
      setVouchersMap((prev) => {
        const next: Record<number, VoucherSeleccionable> = {};
        for (const [id, v] of Object.entries(prev)) {
          next[Number(id)] = { ...v, seleccionado: false };
        }
        return next;
      });
      return;
    }

    setSeleccionandoTodos(true);
    setError(null);
    try {
      const todasVentas = [...turno.ventas];
      if (turno.meta.totalPages > 1) {
        const paginasFaltantes: number[] = [];
        for (let p = 1; p <= turno.meta.totalPages; p++) {
          if (p !== pagina) paginasFaltantes.push(p);
        }
        const resultados = await Promise.all(
          paginasFaltantes.map((p) => cajaService.obtenerVouchersTurno(p)),
        );
        for (const res of resultados) {
          if (res.cajaId === turno.cajaId) {
            todasVentas.push(...res.ventas);
          }
        }
      }

      setVouchersMap((prev) => {
        const next = { ...prev };
        for (const v of todasVentas) {
          next[v.ventaId] = {
            ventaId: v.ventaId,
            referencia: resolverReferenciaVoucher(v),
            monto: round2(v.monto),
            seleccionado: true,
          };
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar todos los vouchers del turno');
    } finally {
      setSeleccionandoTodos(false);
    }
  }

  function toggleVoucher(v: VoucherTurnoItem) {
    setVouchersMap((prev) => {
      const actualItem = prev[v.ventaId] ?? {
        ventaId: v.ventaId,
        referencia: resolverReferenciaVoucher(v),
        monto: round2(v.monto),
        seleccionado: false,
      };
      return {
        ...prev,
        [v.ventaId]: {
          ...actualItem,
          seleccionado: !actualItem.seleccionado,
        },
      };
    });
  }

  function toggleExpandir(ventaId: number) {
    setExpandidos((prev) => ({ ...prev, [ventaId]: !prev[ventaId] }));
  }

  function cambiarPagina(nuevaPagina: number) {
    setTurno(null);
    setPagina(nuevaPagina);
  }

  function cerrarModal() {
    if (cerrando) return;
    setPagina(1);
    setTurno(null);
    onClose();
  }

  // Cálculo exacto del arqueo por denominaciones oficiales de Guatemala (al centavo)
  const totalPorDenominaciones = useMemo(() => {
    return round2(
      DENOMINACIONES_GTQ.reduce((sum, d) => {
        const qty = Number(conteoBilletes[d.key] || 0);
        return sum + (Number.isFinite(qty) && qty > 0 ? qty * d.valor : 0);
      }, 0),
    );
  }, [conteoBilletes]);

  const hayAlgunaDenominacion = useMemo(() => {
    return DENOMINACIONES_GTQ.some((d) => Number(conteoBilletes[d.key] || 0) > 0);
  }, [conteoBilletes]);

  const directoIngresado = montoContadoDirecto.trim() !== '';
  const montoDirectoValido =
    directoIngresado &&
    Number.isFinite(Number(montoContadoDirecto)) &&
    Number(montoContadoDirecto) >= 0;

  const montoContadoFinal =
    modoArqueo === 'denominaciones'
      ? totalPorDenominaciones
      : montoDirectoValido
        ? round2(Number(montoContadoDirecto))
        : 0;

  // Componentes del efectivo esperado (preferimos los valores frescos del endpoint /caja/vouchers)
  const fondoInicial = turno?.montoInicial ?? actual?.montoInicial ?? 0;
  const ventasEfectivo = turno?.totalVentasEfectivo ?? actual?.totalVentasEfectivo ?? 0;
  const anulacionesEfectivo = turno?.totalEgresosEfectivo ?? actual?.totalEgresosEfectivo ?? 0;
  const ingresosExtraPrevios = turno?.totalIngresosExtra ?? actual?.totalIngresosExtra ?? 0;
  const efectivoEsperado = round2(turno?.montoEsperadoEfectivo ?? actual?.montoEsperadoEfectivo ?? 0);

  // Exige conteo de efectivo y cuadre exacto (sin faltante ni excedente) para permitir el cierre
  const conteoEfectivoListo =
    modoArqueo === 'directo'
      ? montoDirectoValido
      : efectivoEsperado === 0 || hayAlgunaDenominacion;

  const diferenciaPreview = round2(montoContadoFinal - efectivoEsperado);
  const cuadreExacto = conteoEfectivoListo && diferenciaPreview === 0;
  const tarjetaIngresada = round2(
    vouchersSeleccionados.reduce((suma, voucher) => suma + voucher.monto, 0),
  );
  const tarjetaNetaIngresada = round2(tarjetaIngresada + (turno?.ajusteTarjeta ?? 0));
  const totalIngresado = round2(montoContadoFinal + tarjetaNetaIngresada);

  const motivoBloqueoSubmit = !turno
    ? 'Cargando información del turno…'
    : !conteoEfectivoListo
      ? modoArqueo === 'directo'
        ? 'Ingresa el total de efectivo físico contado en gaveta.'
        : 'Ingresa el conteo de billetes y monedas de la gaveta.'
      : diferenciaPreview > 0
        ? `Hay un excedente de ${formatCurrency(diferenciaPreview)}. No se puede cerrar hasta cuadrar exacto en Q 0.00.`
        : diferenciaPreview < 0
          ? `Hay un faltante de ${formatCurrency(Math.abs(diferenciaPreview))}. No se puede cerrar hasta cuadrar exacto en Q 0.00.`
          : !conciliacionCompleta
            ? `Faltan ${turno.meta.total - vouchersSeleccionados.length} voucher(s) de tarjeta por seleccionar.`
            : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || !conciliacionCompleta || !cuadreExacto || cerrando) return;
    setCerrando(true);
    setError(null);
    try {
      await onConfirmarCierre({
        cajaId: turno.cajaId,
        montoContadoEfectivo: montoContadoFinal,
        observacionesCierre: obsCierre || undefined,
        autorizacion: requiereAutorizacion ? autorizacion : undefined,
        vouchers: vouchersSeleccionados,
      });
      setPagina(1);
      setTurno(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    } finally {
      setAutorizacion((a) => ({ ...a, password: '' }));
      setCerrando(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Arqueo y cierre de turno"
      onClose={cerrarModal}
      maxWidthClass="max-w-2xl"
    >
      {actual && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fórmula transparente del efectivo esperado en gaveta */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
            <p className="font-bold text-slate-900">Cómo se calcula el efectivo esperado en gaveta:</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>Fondo inicial <strong>{formatCurrency(fondoInicial)}</strong></span>
              <span>+</span>
              <span>Ventas efectivo <strong>{formatCurrency(ventasEfectivo)}</strong></span>
              {ingresosExtraPrevios > 0 && (
                <>
                  <span>+</span>
                  <span>Ingresos previos <strong>{formatCurrency(ingresosExtraPrevios)}</strong></span>
                </>
              )}
              {anulacionesEfectivo > 0 && (
                <>
                  <span>−</span>
                  <span className="text-red-700">
                    Anulaciones efectivo <strong>{formatCurrency(anulacionesEfectivo)}</strong>
                  </span>
                </>
              )}
              <span>=</span>
              <strong className="text-slate-900">{formatCurrency(efectivoEsperado)}</strong>
            </p>
          </div>

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
              <Coins className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Contar Billetes y Monedas ({env.CURRENCY_CODE})
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
              <Calculator className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Ingresar Total Directo
            </button>
          </div>

          {modoArqueo === 'denominaciones' ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Escribe cuántos billetes o monedas tienes de cada valor (ej. un billete de Q 100 se ingresa como 1).
              </p>
              <ContadorBilletesGTQ
                conteoBilletes={conteoBilletes}
                onChange={(key, value) => {
                  setConteoBilletes((prev) => ({ ...prev, [key]: value }));
                }}
              />
            </div>
          ) : (
            <Field
              label={`Total efectivo físico contado en gaveta (${env.CURRENCY_SYMBOL})`}
              required
              labelClassName="mb-1 block text-sm font-bold text-slate-700"
            >
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={montoContadoDirecto}
                onChange={(e) => setMontoContadoDirecto(e.target.value)}
                className="min-h-[52px] w-full rounded-xl border border-slate-300 px-4 text-2xl font-black"
              />
            </Field>
          )}

          {/* Panel de Cuadre Esperado vs Contado */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs font-bold uppercase text-slate-600">Esperado</p>
                <p className="mt-0.5 text-lg font-black text-slate-900">
                  {formatCurrency(efectivoEsperado)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-600">Contado</p>
                <p className="mt-0.5 text-lg font-black text-brand-700">
                  {conteoEfectivoListo ? formatCurrency(montoContadoFinal) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-600">Diferencia</p>
                <p
                  className={`mt-0.5 text-lg font-black ${
                    !conteoEfectivoListo
                      ? 'text-slate-500'
                      : diferenciaPreview === 0
                        ? 'text-emerald-700'
                        : diferenciaPreview > 0
                          ? 'text-sky-700'
                          : 'text-red-600'
                  }`}
                >
                  {!conteoEfectivoListo
                    ? 'Pendiente'
                    : `${diferenciaPreview > 0 ? '+' : ''}${formatCurrency(diferenciaPreview)}`}
                </p>
              </div>
            </div>

            <div
              className={`mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${
                !conteoEfectivoListo
                  ? 'bg-slate-200 text-slate-700'
                  : diferenciaPreview === 0
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-red-100 text-red-900'
              }`}
            >
              {!conteoEfectivoListo ? (
                <>
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  Ingresa el efectivo contado para verificar el cuadre exacto
                </>
              ) : diferenciaPreview === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Cuadre perfecto — Sin diferencias en gaveta
                </>
              ) : diferenciaPreview > 0 ? (
                <>
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Excedente de efectivo por {formatCurrency(diferenciaPreview)} — Ajusta el conteo para poder cerrar
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Faltante de efectivo por {formatCurrency(Math.abs(diferenciaPreview))} — Ajusta el conteo para poder cerrar
                </>
              )}
            </div>
          </div>

          {/* Selector de vouchers de tarjeta con detalle colapsable */}
          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-sky-600" aria-hidden="true" />
                <div>
                  <h4 className="font-bold text-slate-900">Vouchers de tarjeta</h4>
                  {turno && turno.meta.total > 0 && (
                    <p className="text-xs text-slate-600">
                      <strong className={conciliacionCompleta ? 'text-emerald-700' : 'text-slate-900'}>
                        {vouchersSeleccionados.length} de {turno.meta.total}
                      </strong>{' '}
                      seleccionados ({formatCurrency(tarjetaIngresada)} de {formatCurrency(turno.totalVentasTarjeta)})
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {turno && turno.meta.total > 0 && (
                  <button
                    type="button"
                    disabled={cerrando || seleccionandoTodos}
                    onClick={() => void handleToggleSeleccionarTodos()}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <CheckCheck className="h-4 w-4" aria-hidden="true" />
                    {seleccionandoTodos
                      ? 'Seleccionando…'
                      : conciliacionCompleta
                        ? 'Deseleccionar todos'
                        : `Seleccionar todos (${turno.meta.total})`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={cerrando || seleccionandoTodos}
                  onClick={() => {
                    setVouchersMap({});
                    setExpandidos({});
                    cambiarPagina(1);
                    setRecarga((n) => n + 1);
                  }}
                  className="text-xs font-semibold text-brand-700 underline"
                >
                  Actualizar
                </button>
              </div>
            </div>

            {error && <Alert type="error" message={error} />}
            {!turno && !error && <p className="text-sm text-slate-600">Cargando ventas con tarjeta…</p>}
            {turno?.ventas.length === 0 && (
              <p className="text-sm text-slate-600">Sin ventas con tarjeta en este turno.</p>
            )}
            {!!turno?.ventas.length && (
              <p className="text-xs text-slate-600">
                Selecciona los vouchers que tienes físicamente. Usa <strong>Ver detalle</strong> para cotejar número de voucher, factura, hora y consumo.
              </p>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {turno?.ventas.map((v) => {
                const seleccionado = Boolean(vouchersMap[v.ventaId]?.seleccionado);
                const abierto = Boolean(expandidos[v.ventaId]);
                const numVoucher = v.referenciaPago?.trim() || null;

                return (
                  <div
                    key={v.ventaId}
                    className={`rounded-xl border transition ${
                      seleccionado
                        ? 'border-emerald-400 bg-emerald-50/70 shadow-sm'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={seleccionado}
                          onChange={() => toggleVoucher(v)}
                          className="h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-extrabold text-sky-900">
                              {numVoucher ? `Voucher #${numVoucher}` : `Sin No. voucher`}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {v.numeroFactura ? `Factura ${v.numeroFactura}` : `Venta #${v.ventaId}`}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-600">
                            {formatDateTime(v.fecha)}
                            {v.cajeroNombre ? ` · ${v.cajeroNombre}` : ''}
                          </p>
                        </div>
                      </label>

                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-base font-black text-slate-900">
                            {formatCurrency(round2(v.monto))}
                          </p>
                          <span
                            className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                              seleccionado
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {seleccionado ? 'Presente' : 'Pendiente'}
                          </span>
                        </div>

                        <button
                          type="button"
                          aria-expanded={abierto}
                          onClick={() => toggleExpandir(v.ventaId)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          title="Comparar datos completos del voucher"
                        >
                          <span>Detalle</span>
                          {abierto ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Panel colapsable para comparar todos los datos contra el voucher físico */}
                    {abierto && (
                      <div className="border-t border-slate-200/80 bg-white/90 px-3.5 py-3 text-xs text-slate-700 rounded-b-xl space-y-2.5">
                        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">No. de voucher / autorización:</dt>
                            <dd className="font-extrabold text-slate-900">
                              {numVoucher ?? 'No capturado al cobrar'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">Comprobante:</dt>
                            <dd className="font-bold text-slate-900">
                              {v.numeroFactura ? `${v.numeroFactura} (Venta #${v.ventaId})` : `Venta #${v.ventaId}`}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">Fecha y hora:</dt>
                            <dd className="font-semibold text-slate-900">{formatDateTime(v.fecha)}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">Cajero:</dt>
                            <dd className="font-semibold text-slate-900">{v.cajeroNombre ?? '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">Cliente / NIT:</dt>
                            <dd className="font-semibold text-slate-900">
                              {v.clienteNombre ?? 'Consumidor Final'} ({v.clienteNit ?? 'CF'})
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt className="font-semibold text-slate-500">Tipo de servicio:</dt>
                            <dd className="font-semibold text-slate-900">
                              {(v.tipoServicio && ETIQUETA_SERVICIO[v.tipoServicio]) || v.tipoServicio || 'Mostrador'}
                            </dd>
                          </div>
                          {v.subtotalSinIva !== undefined && v.ivaMonto !== undefined && (
                            <div className="flex justify-between gap-2 sm:col-span-2 border-t border-slate-100 pt-1.5">
                              <dt className="font-semibold text-slate-500">Desglose fiscal:</dt>
                              <dd className="font-semibold text-slate-900">
                                Base {formatCurrency(v.subtotalSinIva)} + IVA {formatCurrency(v.ivaMonto)} ={' '}
                                <strong>{formatCurrency(round2(v.monto))}</strong>
                              </dd>
                            </div>
                          )}
                        </dl>

                        {v.items && v.items.length > 0 && (
                          <div className="border-t border-slate-100 pt-2">
                            <p className="mb-1 font-bold text-slate-800">Consumo cobrado:</p>
                            <ul className="space-y-0.5 text-slate-700">
                              {v.items.map((item, idx) => (
                                <li key={idx} className="flex justify-between gap-2">
                                  <span>
                                    {item.cantidad} × {item.nombrePlatillo}
                                  </span>
                                  <span className="font-semibold text-slate-900">
                                    {formatCurrency(item.subtotal)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {v.observaciones && (
                          <p className="border-t border-slate-100 pt-1.5 text-slate-600">
                            <strong>Nota:</strong> {v.observaciones}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {turno && turno.meta.totalPages > 1 && !cerrando && (
              <Pagination meta={turno.meta} onPageChange={cambiarPagina} />
            )}
          </section>

          {turno && (
            <section className="space-y-2 rounded-xl bg-teal-50 p-4">
              <h4 className="font-bold text-teal-950">Cobros por ventas del turno</h4>
              <dl className="grid gap-2 text-sm text-teal-950 sm:grid-cols-3">
                <div>
                  <dt>Efectivo neto cobrado</dt>
                  <dd className="font-bold">{formatCurrency(turno.totalVentasEfectivo)}</dd>
                </div>
                <div>
                  <dt>Ventas con tarjeta</dt>
                  <dd className="font-bold">{formatCurrency(turno.totalVentasTarjeta)}</dd>
                </div>
                <div>
                  <dt>Total de cobros</dt>
                  <dd className="text-lg font-extrabold">{formatCurrency(turno.totalCobrosVentas)}</dd>
                </div>
              </dl>
              <h4 className="border-t border-teal-200 pt-2 font-bold text-teal-950">
                Resumen del arqueo general (con fondo inicial)
              </h4>
              <dl className="grid gap-2 text-sm text-teal-950 sm:grid-cols-3">
                <div>
                  <dt>Efectivo + tarjeta esperados</dt>
                  <dd className="font-bold">{formatCurrency(turno.totalGeneralEsperado)}</dd>
                </div>
                <div>
                  <dt>Tarjeta seleccionada (neta)</dt>
                  <dd className="font-bold">{formatCurrency(tarjetaNetaIngresada)}</dd>
                </div>
                <div>
                  <dt>Contado + tarjeta neta</dt>
                  <dd className="font-bold">
                    {conteoEfectivoListo ? formatCurrency(totalIngresado) : '—'}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-teal-900">
                Tarjeta esperada {formatCurrency(turno.totalTarjetaNeto)}
                {turno.ajusteTarjeta !== 0 &&
                  ` · Ajustes/anulaciones tarjeta ${formatCurrency(turno.ajusteTarjeta)}`}
                {conciliacionCompleta &&
                  conteoEfectivoListo &&
                  ` · Diferencia total ${formatCurrency(round2(totalIngresado - turno.totalGeneralEsperado))}`}
              </p>
            </section>
          )}

          <Field label="Observaciones de cierre">
            <textarea
              rows={2}
              value={obsCierre}
              onChange={(e) => setObsCierre(e.target.value)}
              placeholder="Ej. Cierre nocturno sin novedades..."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm"
            />
          </Field>

          {requiereAutorizacion && (
            <AutorizacionSupervisorFields
              value={autorizacion}
              onChange={setAutorizacion}
              operacion="cerrar"
            />
          )}

          {actual?.domiciliosPendientesLiquidar?.bloquearCierre &&
            actual.domiciliosPendientesLiquidar.cantidad > 0 && (
              <Alert
                type="error"
                message={`No se puede cerrar la caja: hay ${actual.domiciliosPendientesLiquidar.cantidad} entrega(s) a domicilio contra entrega sin liquidar (${formatCurrency(actual.domiciliosPendientesLiquidar.montoTotal)}). Liquídalas primero en el módulo Domicilios.`}
              />
            )}

          {motivoBloqueoSubmit && (
            <p className="text-right text-xs font-semibold text-amber-800">
              {motivoBloqueoSubmit}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={cerrando}
              onClick={cerrarModal}
              className="min-h-[46px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                !conciliacionCompleta ||
                !cuadreExacto ||
                cerrando ||
                Boolean(
                  actual?.domiciliosPendientesLiquidar?.bloquearCierre &&
                    actual.domiciliosPendientesLiquidar.cantidad > 0,
                )
              }
              className="min-h-[46px] rounded-xl bg-red-600 px-6 text-sm font-extrabold text-white shadow-md hover:bg-red-700 disabled:opacity-50"
            >
              {cerrando ? 'Cerrando turno…' : 'Confirmar cierre'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
