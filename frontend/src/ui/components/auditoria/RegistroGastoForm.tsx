import { FormEvent, useRef, useState } from 'react';
import { RegistroGasto, reportesService } from '../../../services/reportes.service';
import { generarUuid } from '../../../utils/idempotency';
import { fechaGuatemala } from '../../../utils/periodos';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';

const control = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';

export function RegistroGastoForm({ onGuardado }: { onGuardado: (fecha: string) => void }) {
  const [categoria, setCategoria] = useState<RegistroGasto['categoria']>('ALQUILER');
  const [fecha, setFecha] = useState(() => fechaGuatemala.format(new Date()));
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const solicitud = useRef<{ datos: string; registroId: string } | null>(null);
  const enviando = useRef(false);

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
    const gasto = { categoria, fecha, monto: Number(importe).toFixed(2), concepto: detalle };
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
      setConfirmacion(`Gasto registrado con fecha ${fecha}.`);
      onGuardado(fecha);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-slate-900">Registrar alquiler o gasto indirecto</summary>
      <form onSubmit={(event) => void guardar(event)} className="mt-4 space-y-3">
        {error && <Alert type="error" message={error} />}
        {confirmacion && <Alert type="success" message={confirmacion} />}
        <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Tipo de gasto">
            <select value={categoria} onChange={(event) => setCategoria(event.target.value as RegistroGasto['categoria'])} className={control}>
              <option value="ALQUILER">Alquiler</option>
              <option value="OTRO">Otro gasto indirecto</option>
            </select>
          </Field>
          <Field label="Fecha del gasto" required>
            <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className={control} />
          </Field>
          <Field label="Monto (Q)" required>
            <input inputMode="decimal" maxLength={12} value={monto} onChange={(event) => setMonto(event.target.value)} className={control} />
          </Field>
          <Field label="Concepto" required={categoria === 'OTRO'}>
            <input maxLength={200} value={concepto} placeholder={categoria === 'ALQUILER' ? 'Alquiler del local' : 'Ej. Papel o platos desechables'} onChange={(event) => setConcepto(event.target.value)} className={control} />
          </Field>
        </fieldset>
        <p className="text-sm text-slate-600">Registra aquí el gasto para el balance. Si el pago salió de la gaveta, anota también la salida en Caja.</p>
        <button type="submit" disabled={guardando} className="min-h-[44px] rounded-xl bg-brand-700 px-4 text-sm font-bold text-white disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar gasto'}
        </button>
      </form>
    </details>
  );
}
