import React, { useState } from 'react';
import { LockOpen } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import {
  AUTORIZACION_VACIA,
  AutorizacionSupervisor,
  AutorizacionSupervisorFields,
} from './AutorizacionSupervisorFields';

interface AperturaCajaPanelProps {
  canOpen: boolean;
  /** true cuando el usuario no tiene caja:autorizar (p. ej. un cajero): pide credenciales de supervisor */
  requiereAutorizacion: boolean;
  onAbrirCaja: (
    montoInicial: number,
    observaciones?: string,
    autorizacion?: AutorizacionSupervisor,
  ) => Promise<boolean>;
}

export const AperturaCajaPanel: React.FC<AperturaCajaPanelProps> = ({
  canOpen,
  requiereAutorizacion,
  onAbrirCaja,
}) => {
  const [montoInicial, setMontoInicial] = useState('500.00');
  const [obsApertura, setObsApertura] = useState('');
  const [autorizacion, setAutorizacion] = useState<AutorizacionSupervisor>(AUTORIZACION_VACIA);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onAbrirCaja(
      Number(montoInicial),
      obsApertura || undefined,
      requiereAutorizacion ? autorizacion : undefined,
    );
    // La contraseña del supervisor no se conserva, salió bien o mal
    setAutorizacion((a) => ({ ...a, password: '' }));
    if (ok) {
      setObsApertura('');
      setAutorizacion(AUTORIZACION_VACIA);
    }
  };

  return (
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
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {requiereAutorizacion && (
            <AutorizacionSupervisorFields value={autorizacion} onChange={setAutorizacion} operacion="abrir" />
          )}

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
  );
};
