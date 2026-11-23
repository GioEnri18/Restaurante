import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, Coins, CheckCheck } from 'lucide-react';
import { env } from '../../../config/env';
import { CajaSesionModel } from '../../../models';
import { cajaService } from '../../../services/caja.service';
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

interface CapturaVoucherState {
  confirmado: boolean;
  referencia: string;
  monto: string;
  montoEsperado: number;
  referenciaOriginal: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const [capturas, setCapturas] = useState<Record<number, CapturaVoucherState>>({});
  const [avisoVouchers, setAvisoVouchers] = useState<string | null>(null);
  const [marcandoTodos, setMarcandoTodos] = useState(false);
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
      setCapturas({});
      setAvisoVouchers(null);
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
      // Precargar referencia (si existía al cobrar) y monto exacto para validar en 1 clic
      setCapturas((prev) => {
        const next = { ...prev };
        for (const v of datos.ventas) {
          if (!next[v.ventaId]) {
            const ref = v.referenciaPago?.trim() ?? '';
            next[v.ventaId] = {
              confirmado: false,
              referencia: ref,
              monto: round2(v.monto).toFixed(2),
              montoEsperado: round2(v.monto),
              referenciaOriginal: ref || null,
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

  const esVoucherValido = (v: CapturaVoucherState) => {
    const montoNum = round2(Number(v.monto));
    const montoOk = v.monto.trim() !== '' && Number.isFinite(montoNum) && montoNum === v.montoEsperado;
    const refOk =
      v.referencia.trim().length > 0 &&
      (!v.referenciaOriginal ||
        v.referencia.trim().toUpperCase() === v.referenciaOriginal.toUpperCase());
    return montoOk && refOk;
  };

  const vouchersVerificados = useMemo(
    () =>
      Object.entries(capturas)
        .filter(([, v]) => v.confirmado && esVoucherValido(v))
        .map(([ventaId, v]) => ({
          ventaId: Number(ventaId),
          referencia: v.referencia.trim(),
          monto: round2(Number(v.monto)),
        })),
    [capturas],
  );

  const conciliacionCompleta =
    turno !== null && vouchersVerificados.length === turno.meta.total;

  // Marca o desmarca todos los vouchers del turno (cargando todas las páginas si hay más de 1)
  async function handleToggleMarcarTodos() {
    if (!turno || marcandoTodos || cerrando) return;
    setAvisoVouchers(null);

    if (conciliacionCompleta) {
      setCapturas((prev) => {
        const next: Record<number, CapturaVoucherState> = {};
        for (const [id, v] of Object.entries(prev)) {
          next[Number(id)] = { ...v, confirmado: false };
        }
        return next;
      });
      return;
    }

    setMarcandoTodos(true);
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

      let faltantesRef = 0;
      setCapturas((prev) => {
        const next = { ...prev };
        for (const v of todasVentas) {
          const existente = next[v.ventaId];
          const refOriginal = v.referenciaPago?.trim() || null;
          const refActual = (existente?.referencia ?? refOriginal ?? '').trim();
          const montoEsperado = round2(v.monto);
          const candidato: CapturaVoucherState = {
            confirmado: false,
            referencia: refActual,
            monto: existente?.monto ?? montoEsperado.toFixed(2),
            montoEsperado,
            referenciaOriginal: refOriginal,
          };
          if (esVoucherValido(candidato)) {
            candidato.confirmado = true;
          } else {
            faltantesRef++;
          }
          next[v.ventaId] = candidato;
        }
        return next;
      });

      if (faltantesRef > 0) {
        setAvisoVouchers(
          `${faltantesRef} venta(s) con tarjeta no tenían número de voucher guardado al cobrar. Escribe el número del comprobante y márcalas.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar todos los vouchers del turno');
    } finally {
      setMarcandoTodos(false);
    }
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
    vouchersVerificados.reduce((suma, voucher) => suma + voucher.monto, 0),
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
            ? `Faltan ${turno.meta.total - vouchersVerificados.length} voucher(s) de tarjeta por confirmar.`
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
        vouchers: vouchersVerificados,
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

          {/* Lista con check rápido de vouchers de tarjeta */}
          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-slate-900">Vouchers de tarjeta</h4>
                {turno && turno.meta.total > 0 && (
                  <p className="text-xs text-slate-600">
                    <strong className={conciliacionCompleta ? 'text-emerald-700' : 'text-slate-900'}>
                      {vouchersVerificados.length} de {turno.meta.total}
                    </strong>{' '}
                    verificados
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {turno && turno.meta.total > 0 && (
                  <button
                    type="button"
                    disabled={cerrando || marcandoTodos}
                    onClick={() => void handleToggleMarcarTodos()}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <CheckCheck className="h-4 w-4" aria-hidden="true" />
                    {marcandoTodos
                      ? 'Marcando…'
                      : conciliacionCompleta
                        ? 'Desmarcar todos'
                        : `Marcar todos (${turno.meta.total})`}
                  </button>
                )}
                <button
                  type="button"
                  disabled={cerrando || marcandoTodos}
                  onClick={() => {
                    setCapturas({});
                    setAvisoVouchers(null);
                    cambiarPagina(1);
                    setRecarga((n) => n + 1);
                  }}
                  className="text-xs font-semibold text-brand-700 underline"
                >
                  Actualizar lista
                </button>
              </div>
            </div>

            {error && <Alert type="error" message={error} />}
            {avisoVouchers && <Alert type="warning" message={avisoVouchers} />}
            {!turno && !error && <p className="text-sm text-slate-600">Cargando ventas con tarjeta…</p>}
            {turno?.ventas.length === 0 && (
              <p className="text-sm text-slate-600">Sin ventas con tarjeta por cotejar.</p>
            )}
            {!!turno?.ventas.length && (
              <p className="text-xs text-slate-600">
                Los montos y referencias registradas al cobrar vienen precargados. Marca cada comprobante que cuadra con la terminal o usa <strong>Marcar todos</strong>.
              </p>
            )}

            <div className="max-h-72 space-y-2 overflow-y-auto pr-0.5">
              {turno?.ventas.map(({ ventaId, monto, referenciaPago, numeroFactura, fecha }) => {
                const montoEsperadoVenta = round2(monto);
                const refOrig = referenciaPago?.trim() || null;
                const captura: CapturaVoucherState = capturas[ventaId] ?? {
                  confirmado: false,
                  referencia: refOrig ?? '',
                  monto: montoEsperadoVenta.toFixed(2),
                  montoEsperado: montoEsperadoVenta,
                  referenciaOriginal: refOrig,
                };

                const montoIngresado =
                  captura.monto.trim() !== '' ? round2(Number(captura.monto)) : null;
                const montoErroneo =
                  montoIngresado === null || montoIngresado !== montoEsperadoVenta;
                const refNoCoincide =
                  Boolean(captura.referenciaOriginal) &&
                  captura.referencia.trim().length > 0 &&
                  captura.referencia.trim().toUpperCase() !==
                    captura.referenciaOriginal!.toUpperCase();
                const faltaRef = captura.referencia.trim().length === 0;
                const valido = !montoErroneo && !refNoCoincide && !faltaRef;
                const verificado = captura.confirmado && valido;

                return (
                  <div
                    key={ventaId}
                    className={`rounded-xl border p-3 transition ${
                      verificado
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : montoErroneo || refNoCoincide
                          ? 'border-red-300 bg-red-50/40'
                          : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={verificado}
                          onChange={(e) => {
                            const marcar = e.target.checked;
                            if (marcar && !valido) {
                              setAvisoVouchers(
                                faltaRef
                                  ? `Escribe el número de voucher de ${numeroFactura ?? `Venta #${ventaId}`} para poder marcarla.`
                                  : `Revisa los datos de ${numeroFactura ?? `Venta #${ventaId}`} antes de marcarla.`,
                              );
                              return;
                            }
                            setAvisoVouchers(null);
                            setCapturas((prev) => ({
                              ...prev,
                              [ventaId]: { ...captura, confirmado: marcar },
                            }));
                          }}
                          className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-xs font-extrabold text-slate-900">
                          {numeroFactura ? `Factura ${numeroFactura}` : `Venta #${ventaId}`}
                          <span className="ml-1.5 font-normal text-slate-600">
                            · {formatDateTime(fecha)}
                          </span>
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">
                          {formatCurrency(montoEsperadoVenta)}
                        </span>
                        {verificado ? (
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
                            Verificado
                          </span>
                        ) : (
                          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                            Pendiente
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Field
                        label={
                          captura.referenciaOriginal
                            ? 'No. voucher (registrado en venta)'
                            : 'No. voucher (ingresar del POS)'
                        }
                        required
                        labelClassName="mb-1 block text-xs font-bold text-slate-700"
                      >
                        <input
                          autoComplete="off"
                          maxLength={80}
                          placeholder="Ej. 000123 / AUT-456"
                          value={captura.referencia}
                          onChange={(e) => {
                            const nuevaRef = e.target.value;
                            const actualizado: CapturaVoucherState = {
                              ...captura,
                              referencia: nuevaRef,
                            };
                            setCapturas((prev) => ({
                              ...prev,
                              [ventaId]: {
                                ...actualizado,
                                confirmado: esVoucherValido(actualizado) ? captura.confirmado : false,
                              },
                            }));
                          }}
                          className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        />
                      </Field>
                      <Field
                        label={`Monto del voucher (${env.CURRENCY_SYMBOL})`}
                        required
                        labelClassName="mb-1 block text-xs font-bold text-slate-700"
                      >
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          step="0.01"
                          value={captura.monto}
                          onChange={(e) => {
                            const nuevoMonto = e.target.value;
                            const actualizado: CapturaVoucherState = {
                              ...captura,
                              monto: nuevoMonto,
                            };
                            setCapturas((prev) => ({
                              ...prev,
                              [ventaId]: {
                                ...actualizado,
                                confirmado: esVoucherValido(actualizado) ? captura.confirmado : false,
                              },
                            }));
                          }}
                          className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        />
                      </Field>
                    </div>

                    {(refNoCoincide || montoErroneo) && (
                      <p className="mt-1.5 text-xs font-bold text-red-700">
                        {refNoCoincide
                          ? `La referencia registrada en esta venta es "${captura.referenciaOriginal}".`
                          : `El monto del voucher debe coincidir con ${formatCurrency(montoEsperadoVenta)}.`}
                      </p>
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
                  <dt>Tarjeta verificada (neta)</dt>
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
              placeholder="Ej. Cierre nocturno sin novedades / explicación de diferencia..."
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
              disabled={!conciliacionCompleta || !cuadreExacto || cerrando}
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
