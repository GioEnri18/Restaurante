import { FormEvent, useRef, useState } from 'react';
import { RegistroGasto, reportesService } from '../../../services/reportes.service';
import { generarUuid } from '../../../utils/idempotency';
import { fechaGuatemala, rangoMes } from '../../../utils/periodos';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';

const control = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';

export function RegistroGastoForm({ onGuardado }: { onGuardado: (fecha: string) => void }) {
  const [categoria, setCategoria] = useState<RegistroGasto['categoria']>('OTRO');
  const [fecha, setFecha] = useState(() => fechaGuatemala.format(new Date()));
  const [mesInicio, setMesInicio] = useState(() => fechaGuatemala.format(new Date()).slice(0, 7));
  const [mesFin, setMesFin] = useState('');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const solicitud = useRef<{ datos: string; registroId: string } | null>(null);
  const enviando = useRef(false);
  const esAlquiler = categoria === 'ALQUILER';

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando.current) return;
    const importe = monto.trim().replace(',', '.');
    const detalle = concepto.trim() || (categoria === 'ALQUILER' ? 'Alquiler del local' : '');
    setError(null);
    setConfirmacion(null);
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(importe) || Number(importe) <= 0 || !detalle) {
      setError('Escribe un monto mayor a cero con hasta dos decimales y un concepto para el gasto.');
      return;
    }
    const inicio = esAlquiler ? rangoMes(mesInicio).desde : fecha;
    const hastaMes = esAlquiler && mesFin ? rangoMes(mesFin).desde : undefined;
    if (!inicio || (esAlquiler && mesFin && (!hastaMes || hastaMes < inicio))) {
      setError('Indica un mes de inicio válido y, si corresponde, un último mes igual o posterior.');
      return;
    }
    const gasto = { categoria, fecha: inicio, monto: Number(importe).toFixed(2), concepto: detalle, recurrente: esAlquiler, hastaMes };
    const datos = JSON.stringify(gasto);
    enviando.current = true;
    setGuardando(true);
    try {
      if (solicitud.current?.datos !== datos) {
        solicitud.current = { datos, registroId: generarUuid() };
      }
      await reportesService.registrarGasto({ ...gasto, registroId: solicitud.current.registroId });
      solicitud.current = null;
      setMonto('');
      setConcepto('');
      setConfirmacion(esAlquiler ? `Alquiler mensual configurado desde ${mesInicio}.` : `Gasto registrado con fecha ${fecha}.`);
      onGuardado(inicio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-900">Agregar gasto o configurar alquiler mensual</summary>
      <form onSubmit={(event) => void guardar(event)} className="mt-4 space-y-3">
        {error && <Alert type="error" message={error} />}
        {confirmacion && <Alert type="success" message={confirmacion} />}
        <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Tipo de gasto">
            <select value={categoria} onChange={(event) => setCategoria(event.target.value as RegistroGasto['categoria'])} className={control}>
              <option value="OTRO">Gasto indirecto</option>
              <option value="ALQUILER">Alquiler mensual</option>
            </select>
          </Field>
          {esAlquiler ? <>
            <Field label="Mes de inicio" required>
              <input type="month" placeholder="AAAA-MM" value={mesInicio} onChange={(event) => setMesInicio(event.target.value)} className={control} />
            </Field>
            <Field label="Último mes (opcional)">
              <input type="month" placeholder="AAAA-MM" min={mesInicio} value={mesFin} onChange={(event) => setMesFin(event.target.value)} className={control} />
            </Field>
          </> : (
            <Field label="Fecha del gasto" required>
              <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className={control} />
            </Field>
          )}
          <Field label={esAlquiler ? 'Monto mensual (Q)' : 'Monto (Q)'} required>
            <input inputMode="decimal" maxLength={12} value={monto} onChange={(event) => setMonto(event.target.value)} className={control} />
          </Field>
          <Field label="Concepto" required={categoria === 'OTRO'}>
            <input maxLength={200} value={concepto} placeholder={categoria === 'ALQUILER' ? 'Alquiler del local' : 'Ej. Papel o platos desechables'} onChange={(event) => setConcepto(event.target.value)} className={control} />
          </Field>
        </fieldset>
        <p className="text-sm text-slate-600">{esAlquiler
          ? 'El importe se incluye en cada mes desde el inicio. Si cambia el alquiler, guarda el nuevo importe desde el mes del cambio.'
          : 'El gasto se descuenta en el período de su fecha. Si el pago salió de la gaveta, anota también la salida en Caja.'}</p>
        <button type="submit" disabled={guardando} className="min-h-[44px] rounded-xl bg-brand-700 px-4 text-sm font-bold text-white disabled:opacity-60">
          {guardando ? 'Guardando…' : esAlquiler ? 'Guardar alquiler mensual' : 'Guardar gasto'}
        </button>
      </form>
    </details>
  );
}
