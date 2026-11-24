import { useEffect, useState } from 'react';
import { isAbortError } from '../../../services/httpClient';
import { BalanceEconomico, reportesService } from '../../../services/reportes.service';
import { fechaGuatemala, rangoActual, rangoMes } from '../../../utils/periodos';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { CuadreEconomico } from './CuadreEconomico';
import { GastosPeriodo } from './GastosPeriodo';
import { RegistroGastoForm } from './RegistroGastoForm';

const periodos = [['dia', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']] as const;

interface AuditoriaEconomicaProps {
  puedeRegistrar: boolean;
  mensual?: boolean;
  onGastoGuardado?: () => void;
}

export function AuditoriaEconomica({ puedeRegistrar, mensual = false, onGastoGuardado }: AuditoriaEconomicaProps) {
  const [rango, setRango] = useState(() => rangoActual('mes'));
  const [mes, setMes] = useState(() => fechaGuatemala.format(new Date()).slice(0, 7));
  const [balance, setBalance] = useState<BalanceEconomico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const { desde, hasta } = mensual ? rangoMes(mes) : rango;
  const rangoValido = Boolean(desde && hasta && desde <= hasta);

  useEffect(() => {
    if (!rangoValido) return;
    const controller = new AbortController();
    setCargando(true);
    setError(null);
    void reportesService.obtenerBalance(desde, hasta, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setBalance(data);
      })
      .catch((err: unknown) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el cuadre económico.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargando(false);
      });
    return () => controller.abort();
  }, [desde, hasta, rangoValido, revision]);

  return (
    <div className="space-y-3">
      {mensual ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <Field label="Mes del reporte">
            <input type="month" placeholder="AAAA-MM" value={mes} onChange={(event) => setMes(event.target.value)}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm" />
          </Field>
          {mes === fechaGuatemala.format(new Date()).slice(0, 7) && (
            <p className="mt-2 text-sm text-slate-600">Mes en curso. El resultado incluye la nómina correspondiente al mes completo.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          {periodos.map(([periodo, etiqueta]) => (
            <button key={periodo} type="button" onClick={() => setRango(rangoActual(periodo))}
              className="min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50">
              {etiqueta}
            </button>
          ))}
          <Field label="Desde">
            <input type="date" max={hasta} value={desde} onChange={(event) => setRango({ desde: event.target.value, hasta })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm" />
          </Field>
          <Field label="Hasta">
            <input type="date" min={desde} value={hasta} onChange={(event) => setRango({ desde, hasta: event.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm" />
          </Field>
        </div>
      )}
      {puedeRegistrar && <RegistroGastoForm onGuardado={(fecha) => {
        if (mensual) setMes(fecha.slice(0, 7));
        else if (!desde || !hasta || fecha < desde || fecha > hasta) setRango({ desde: fecha, hasta: fecha });
        setRevision((actual) => actual + 1);
        onGastoGuardado?.();
      }} />}
      {!rangoValido ? (
        <Alert type="warning" message={mensual ? 'Selecciona un mes válido.' : 'Selecciona una fecha inicial y final en orden.'} />
      ) : cargando ? (
        <p role="status" className="px-2 py-3 text-sm text-slate-600">Cargando cuadre…</p>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : balance?.periodo.fechaDesde === desde && balance.periodo.fechaHasta === hasta ? (
        <CuadreEconomico balance={balance} mensual={mensual} />
      ) : null}
      {rangoValido && <GastosPeriodo key={`${desde}/${hasta}/${revision}`} desde={desde} hasta={hasta} />}
    </div>
  );
}
