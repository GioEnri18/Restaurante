import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, Coins } from 'lucide-react';
import { CajaSesionModel } from '../../../models';
import { cajaService } from '../../../services/caja.service';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
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
  const [capturas, setCapturas] = useState<Record<number, { referencia: string; monto: string }>>({});
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

  const vouchersCapturados = Object.entries(capturas)
    .filter(([, voucher]) => voucher.referencia.trim() && Number(voucher.monto) > 0)
    .map(([ventaId, voucher]) => ({
      ventaId: Number(ventaId),
      referencia: voucher.referencia.trim(),
      monto: Number(voucher.monto),
    }));
  const conciliacionCompleta = turno !== null && vouchersCapturados.length === turno.meta.total;

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

  const efectivoEsperado = turno?.montoEsperadoEfectivo ?? actual?.montoEsperadoEfectivo ?? 0;
  const diferenciaPreview = Math.round((montoContadoFinal - efectivoEsperado) * 100) / 100;
  const tarjetaIngresada = vouchersCapturados.reduce((suma, voucher) => suma + voucher.monto, 0);
  const tarjetaNetaIngresada = Math.round((tarjetaIngresada + (turno?.ajusteTarjeta ?? 0)) * 100) / 100;
  const totalIngresado = Math.round((montoContadoFinal + tarjetaNetaIngresada) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turno || !conciliacionCompleta || cerrando) return;
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
      title="Cuadre de efectivo y vouchers"
      onClose={cerrarModal}
      maxWidthClass="max-w-2xl"
    >
      {actual && (
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Escribe cuántos billetes o monedas tienes de cada valor. Un billete de Q100 se ingresa como 1.</p>
              <ContadorBilletesGTQ
                conteoBilletes={conteoBilletes}
                onChange={(key, value) =>
                  setConteoBilletes((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>
          ) : (
            <div>
              <label htmlFor="cierre-efectivo-total" className="mb-1 block text-sm font-bold text-slate-700">
                Total efectivo físico contado en gaveta (Q)
              </label>
              <input
                required
                id="cierre-efectivo-total"
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
                  {formatCurrency(efectivoEsperado)}
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

          </div>

          <section className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900">Vouchers de tarjeta</h4>
              <button type="button" disabled={cerrando} onClick={() => {
                setCapturas({});
                cambiarPagina(1);
                setRecarga((n) => n + 1);
              }}
                className="text-sm font-semibold text-brand-700 underline">
                Actualizar lista
              </button>
            </div>
            {error && <Alert type="error" message={error} />}
            {!turno && !error && <p className="text-sm text-slate-600">Cargando ventas con tarjeta…</p>}
            {turno?.ventas.length === 0 && <p className="text-sm text-slate-600">Sin ventas con tarjeta por cotejar.</p>}
            {!!turno?.ventas.length && (
              <p className="text-sm text-slate-600">
                Copia el número y el monto de cada comprobante de la terminal.
                {' '}{vouchersCapturados.length} de {turno.meta.total} ingresados.
              </p>
            )}
            {turno?.ventas.map(({ ventaId, monto, fecha }) => {
              const captura = capturas[ventaId] ?? { referencia: '', monto: '' };
              return (
                <fieldset key={ventaId} className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-bold text-slate-700">
                    Venta #{ventaId} · {formatDateTime(fecha)} · {formatCurrency(monto)}
                  </legend>
                  <label className="text-xs font-bold text-slate-700">
                    Número de voucher
                    <input required autoComplete="off" maxLength={80} value={captura.referencia}
                      onChange={(e) => setCapturas({ ...capturas, [ventaId]: { ...captura, referencia: e.target.value } })}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Monto del voucher (Q)
                    <input required type="number" inputMode="decimal" min="0.01" step="0.01" value={captura.monto}
                      onChange={(e) => setCapturas({ ...capturas, [ventaId]: { ...captura, monto: e.target.value } })}
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                  </label>
                </fieldset>
              );
            })}
            {turno && turno.meta.totalPages > 1 && !cerrando && (
              <Pagination meta={turno.meta} onPageChange={cambiarPagina} />
            )}
          </section>

          {turno && (
            <section className="space-y-2 rounded-xl bg-teal-50 p-4">
              <h4 className="font-bold text-teal-950">Cobros por ventas del cierre</h4>
              <dl className="grid gap-2 text-sm text-teal-950 sm:grid-cols-3">
                <div><dt>Efectivo después del vuelto</dt><dd className="font-bold">{formatCurrency(turno.totalVentasEfectivo)}</dd></div>
                <div><dt>Ventas con tarjeta</dt><dd className="font-bold">{formatCurrency(turno.totalVentasTarjeta)}</dd></div>
                <div><dt>Total de cobros</dt><dd className="text-lg font-extrabold">{formatCurrency(turno.totalCobrosVentas)}</dd></div>
              </dl>
              <h4 className="border-t border-teal-200 pt-2 font-bold text-teal-950">Arqueo con fondo inicial</h4>
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
                  <dt>Efectivo contado + tarjeta neta</dt>
                  <dd className="font-bold">{formatCurrency(totalIngresado)}</dd>
                </div>
              </dl>
              <p className="text-xs text-teal-900">
                Tarjeta esperada {formatCurrency(turno.totalTarjetaNeto)}
                {turno.ajusteTarjeta !== 0 && ` · Ajustes de tarjeta ${formatCurrency(turno.ajusteTarjeta)}`}
                {conciliacionCompleta && ` · Diferencia total ${formatCurrency(totalIngresado - turno.totalGeneralEsperado)}`}
              </p>
            </section>
          )}

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

          {requiereAutorizacion && (
            <AutorizacionSupervisorFields value={autorizacion} onChange={setAutorizacion} operacion="cerrar" />
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
              disabled={!conciliacionCompleta || cerrando}
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
