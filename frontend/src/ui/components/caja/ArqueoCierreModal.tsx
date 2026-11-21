import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, AlertCircle, Coins } from 'lucide-react';
import { CajaSesionModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Modal } from '../common/Modal';
import { ContadorBilletesGTQ, DENOMINACIONES_GTQ } from './ContadorBilletesGTQ';

interface ArqueoCierreModalProps {
  open: boolean;
  actual: CajaSesionModel | null;
  onClose: () => void;
  onConfirmarCierre: (montoContado: number, observaciones?: string) => Promise<void>;
}

export const ArqueoCierreModal: React.FC<ArqueoCierreModalProps> = ({
  open,
  actual,
  onClose,
  onConfirmarCierre,
}) => {
  const [modoArqueo, setModoArqueo] = useState<'denominaciones' | 'directo'>('denominaciones');
  const [conteoBilletes, setConteoBilletes] = useState<Record<string, string>>({});
  const [montoContadoDirecto, setMontoContadoDirecto] = useState('');
  const [obsCierre, setObsCierre] = useState('');

  useEffect(() => {
    if (open && actual) {
      setConteoBilletes({});
      setMontoContadoDirecto(actual.montoEsperadoEfectivo.toFixed(2));
      setObsCierre('');
      setModoArqueo('denominaciones');
    }
  }, [open, actual]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirmarCierre(montoContadoFinal, obsCierre || undefined);
  };

  return (
    <Modal
      open={open}
      title="Arqueo de Efectivo y Cierre Diario"
      onClose={onClose}
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
            <ContadorBilletesGTQ
              conteoBilletes={conteoBilletes}
              onChange={(key, value) =>
                setConteoBilletes((prev) => ({ ...prev, [key]: value }))
              }
            />
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
              onClick={onClose}
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
  );
};
