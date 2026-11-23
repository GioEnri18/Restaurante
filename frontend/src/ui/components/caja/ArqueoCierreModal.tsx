import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, Coins } from 'lucide-react';
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
  const [confirmarGavetaVacia, setConfirmarGavetaVacia] = useState(false);
  const [obsCierre, setObsCierre] = useState('');
  const [autorizacion, setAutorizacion] = useState<AutorizacionSupervisor>(AUTORIZACION_VACIA);
  const [turno, setTurno] = useState<Awaited<ReturnType<typeof cajaService.obtenerVouchersTurno>> | null>(null);
  const [capturas, setCapturas] = useState<Record<number, { referencia: string; monto: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (open && actual) {
      setConteoBilletes({});
      setMontoContadoDirecto('');
      setConfirmarGavetaVacia(false);
      setObsCierre('');
      setModoArqueo('denominaciones');
      setAutorizacion(AUTORIZACION_VACIA);
      setCapturas({});
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
    }).catch((err: unknown) => {
      if (vigente) setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de vouchers');
    });
    return () => { vigente = false; };
  }, [open, cajaId, pagina, recarga]);

  // Mapa de montos esperados por venta de tarjeta en la página actual para validar discrepancias en vivo
  const ventasTarjetaPaginaMap = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const v of turno?.ventas ?? []) {
      mapa.set(v.ventaId, round2(v.monto));
    }
    return mapa;
  }, [turno]);

  const vouchersCapturados = Object.entries(capturas)
    .filter(([, voucher]) => voucher.referencia.trim() && Number(voucher.monto) > 0)
    .map(([ventaId, voucher]) => ({
      ventaId: Number(ventaId),
      referencia: voucher.referencia.trim(),
      monto: round2(Number(voucher.monto)),
    }));

  const vouchersConMontoIncorrecto = vouchersCapturados.filter((v) => {
    const esperado = ventasTarjetaPaginaMap.get(v.ventaId);
    return esperado !== undefined && round2(v.monto) !== esperado;
  });

  const conciliacionCompleta =
    turno !== null &&
    vouchersCapturados.length === turno.meta.total &&
    vouchersConMontoIncorrecto.length === 0;

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

  // Evita cierres accidentales en Q 0.00 sin haber contado efectivo cuando se espera efectivo en gaveta
  const conteoEfectivoListo =
    modoArqueo === 'directo'
      ? montoDirectoValido
      : efectivoEsperado <= 0 || hayAlgunaDenominacion || confirmarGavetaVacia;

  const diferenciaPreview = round2(montoContadoFinal - efectivoEsperado);
  const tarjetaIngresada = round2(
    vouchersCapturados.reduce((suma, voucher) => suma + voucher.monto, 0),
  );
  const tarjetaNetaIngresada = round2(tarjetaIngresada + (turno?.ajusteTarjeta ?? 0));
  const totalIngresado = round2(montoContadoFinal + tarjetaNetaIngresada);

  const motivoBloqueoSubmit = !turno
    ? 'Cargando información del turno…'
    : !conteoEfectivoListo
      ? modoArqueo === 'directo'
        ? 'Ingresa el total de efectivo físico contado en gaveta.'
        : 'Ingresa el conteo de billetes/monedas (o confirma si la gaveta está en Q 0.00).'
      : vouchersConMontoIncorrecto.length > 0
        ? 'Corrige el monto de los vouchers que no coinciden con su venta.'
        : !conciliacionCompleta
          ? `Faltan ${turno.meta.total - vouchersCapturados.length} voucher(s) de tarjeta por cotejar.`
          : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || !conciliacionCompleta || !conteoEfectivoListo || cerrando) return;
    setCerrando(true);
    setError(null);
    try {
      await onConfirmarCierre({
        cajaId: turno.cajaId,
        montoContadoEfectivo: montoContadoFinal,
        observacionesCierre: obsCierre || undefined,
        autorizacion: requiereAutorizacion ? autorizacion : undefined,
        vouchers: vouchersCapturados,
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
                  setConfirmarGavetaVacia(false);
                  setConteoBilletes((prev) => ({ ...prev, [key]: value }));
                }}
              />
              {efectivoEsperado > 0 && !hayAlgunaDenominacion && (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  <input
                    type="checkbox"
                    checked={confirmarGavetaVacia}
                    onChange={(e) => setConfirmarGavetaVacia(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400"
                  />
                  Confirmo que la gaveta tiene exactamente Q 0.00 en efectivo físico
                </label>
              )}
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
                    : diferenciaPreview > 0
                      ? 'bg-sky-100 text-sky-900'
                      : 'bg-red-100 text-red-900'
              }`}
            >
              {!conteoEfectivoListo ? (
                <>
                  <Calculator className="h-4 w-4" aria-hidden="true" />
                  Ingresa el efectivo contado para calcular la diferencia del arqueo
                </>
              ) : diferenciaPreview === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Cuadre perfecto — Sin diferencias en gaveta
                </>
              ) : diferenciaPreview > 0 ? (
                <>
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Sobrante de efectivo por {formatCurrency(diferenciaPreview)}
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  Faltante de efectivo por {formatCurrency(Math.abs(diferenciaPreview))}
                </>
              )}
            </div>
          </div>

          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900">Vouchers de tarjeta</h4>
              <button
                type="button"
                disabled={cerrando}
                onClick={() => {
                  setCapturas({});
                  cambiarPagina(1);
                  setRecarga((n) => n + 1);
                }}
                className="text-sm font-semibold text-brand-700 underline"
              >
                Actualizar lista
              </button>
            </div>
            {error && <Alert type="error" message={error} />}
            {!turno && !error && <p className="text-sm text-slate-600">Cargando ventas con tarjeta…</p>}
            {turno?.ventas.length === 0 && (
              <p className="text-sm text-slate-600">Sin ventas con tarjeta por cotejar.</p>
            )}
            {!!turno?.ventas.length && (
              <p className="text-sm text-slate-600">
                Copia el número y el monto de cada comprobante de la terminal.{' '}
                <strong>
                  {vouchersCapturados.length} de {turno.meta.total}
                </strong>{' '}
                ingresados.
              </p>
            )}
            {turno?.ventas.map(({ ventaId, monto, fecha }) => {
              const captura = capturas[ventaId] ?? { referencia: '', monto: '' };
              const montoEsperadoVenta = round2(monto);
              const montoIngresado = captura.monto.trim() !== '' ? round2(Number(captura.monto)) : null;
              const montoCoincide = montoIngresado !== null && montoIngresado === montoEsperadoVenta;
              const voucherOk = captura.referencia.trim().length > 0 && montoCoincide;
              const montoErroneo = montoIngresado !== null && !montoCoincide;

              return (
                <fieldset
                  key={ventaId}
                  className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${
                    voucherOk
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : montoErroneo
                        ? 'border-red-300 bg-red-50/40'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <legend className="flex flex-wrap items-center gap-2 px-1 text-xs font-bold text-slate-700">
                    <span>
                      Venta #{ventaId} · {formatDateTime(fecha)} · {formatCurrency(montoEsperadoVenta)}
                    </span>
                    {voucherOk && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-extrabold text-emerald-800">
                        Cuadra
                      </span>
                    )}
                    {montoErroneo && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-extrabold text-red-800">
                        Debe ser {formatCurrency(montoEsperadoVenta)}
                      </span>
                    )}
                  </legend>
                  <Field
                    label="Número de voucher"
                    required
                    labelClassName="mb-1 block text-xs font-bold text-slate-700"
                  >
                    <input
                      autoComplete="off"
                      maxLength={80}
                      value={captura.referencia}
                      onChange={(e) =>
                        setCapturas({
                          ...capturas,
                          [ventaId]: { ...captura, referencia: e.target.value },
                        })
                      }
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
                      onChange={(e) =>
                        setCapturas({
                          ...capturas,
                          [ventaId]: { ...captura, monto: e.target.value },
                        })
                      }
                      className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    />
                  </Field>
                </fieldset>
              );
            })}
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
                  <dt>Tarjeta ingresada (neta)</dt>
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
              disabled={!conciliacionCompleta || !conteoEfectivoListo || cerrando}
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
