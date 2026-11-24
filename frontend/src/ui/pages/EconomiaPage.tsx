import { useEffect, useState } from 'react';
import { isAbortError } from '../../services/httpClient';
import { BalanceEconomico, reportesService } from '../../services/reportes.service';
import { useAuthStore } from '../../store/auth.store';
import { fechaGuatemala, rangoMes } from '../../utils/periodos';
import { Alert } from '../components/common/Alert';
import { Field } from '../components/common/Field';
import { CuadreEconomico } from '../components/economia/CuadreEconomico';
import { GastosPeriodo } from '../components/economia/GastosPeriodo';
import { NominaPanel } from '../components/economia/NominaPanel';

export function EconomiaPage() {
  const esAdmin = useAuthStore((s) => s.isAdmin());
  const puedeEditarPersonal = useAuthStore((s) => s.can('accesos:ver') && s.can('accesos:gestionar'));
  const [mostrarNomina, setMostrarNomina] = useState(false);
  const [mes, setMes] = useState(() => fechaGuatemala.format(new Date()).slice(0, 7));
  const [balance, setBalance] = useState<BalanceEconomico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const { desde, hasta } = rangoMes(mes);
  const rangoValido = Boolean(desde && hasta);

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
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">Economía</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <Field label="Mes del cuadre">
          <input type="month" placeholder="AAAA-MM" value={mes} onChange={(event) => { setConfirmacion(null); setMes(event.target.value); }}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm" />
        </Field>
        <p className="mt-2 text-sm text-slate-600">El cuadre mensual aplica el sueldo completo del personal registrado durante el mes.</p>
      </div>
      {!rangoValido ? (
        <Alert type="warning" message="Selecciona un mes válido." />
      ) : cargando ? (
        <p role="status" className="px-2 py-3 text-sm text-slate-600">Cargando cuadre…</p>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : balance?.periodo.fechaDesde === desde && balance.periodo.fechaHasta === hasta ? (
        <CuadreEconomico balance={balance} />
      ) : null}
      {confirmacion && <Alert type="success" message={confirmacion} />}
      {rangoValido && <GastosPeriodo key={`${desde}/${hasta}/${revision}`} desde={desde} hasta={hasta}
        puedeGestionar={esAdmin} onCambio={(fecha, mensaje) => {
          setConfirmacion(mensaje);
          setMes(fecha.slice(0, 7));
          setRevision((actual) => actual + 1);
        }} />}
      {esAdmin && (
        <details className="rounded-2xl border border-slate-200 bg-white p-4"
          onToggle={(event) => setMostrarNomina(event.currentTarget.open)}>
          <summary className="cursor-pointer font-semibold text-slate-900">Detalle de nómina</summary>
          {mostrarNomina && <div className="mt-3"><NominaPanel puedeEditar={puedeEditarPersonal} /></div>}
        </details>
      )}
    </div>
  );
}
