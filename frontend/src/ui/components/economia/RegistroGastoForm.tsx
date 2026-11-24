import { FormEvent, useRef, useState } from 'react';
import { GastoOperativo, reportesService } from '../../../services/reportes.service';
import { generarUuid } from '../../../utils/idempotency';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

const control = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';

export function RegistroGastoForm({ gasto, fechaInicial, onCancelar, onGuardado }: {
  gasto?: GastoOperativo;
  fechaInicial: string;
  onCancelar: () => void;
  onGuardado: (fecha: string, mensaje: string) => void;
}) {
  const [fecha, setFecha] = useState(gasto?.fecha ?? fechaInicial);
  const [monto, setMonto] = useState(gasto?.monto.toFixed(2) ?? '');
  const [concepto, setConcepto] = useState(gasto?.concepto ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const solicitud = useRef<{ datos: string; registroId: string } | null>(null);
  const enviando = useRef(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enviando.current) return;
    const importe = monto.trim().replace(',', '.');
    const detalle = concepto.trim();
    setError(null);
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(importe) || Number(importe) <= 0 || !detalle || !fecha) {
      setError('Indica la fecha, el concepto y un monto mayor que cero con hasta dos decimales.');
      return;
    }
    const datosGasto = { fecha, monto: Number(importe).toFixed(2), concepto: detalle };
    enviando.current = true;
    setGuardando(true);
    try {
      if (gasto) {
        await reportesService.editarGasto(gasto.id, { ...datosGasto, version: gasto.version });
      } else {
        const datos = JSON.stringify(datosGasto);
        if (solicitud.current?.datos !== datos) solicitud.current = { datos, registroId: generarUuid() };
        await reportesService.registrarGasto({ ...datosGasto, registroId: solicitud.current.registroId });
      }
      onGuardado(fecha, gasto ? 'Gasto actualizado.' : 'Gasto registrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto.');
    } finally {
      enviando.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal open title={gasto ? 'Editar gasto' : 'Agregar gasto'} onClose={() => { if (!enviando.current) onCancelar(); }}>
      <form onSubmit={(event) => void guardar(event)} className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <fieldset disabled={guardando} className="grid gap-3 sm:grid-cols-2">
          <Field label="Concepto" required className="sm:col-span-2">
            <input maxLength={200} value={concepto} placeholder="Ej. Alquiler o papel" onChange={(event) => setConcepto(event.target.value)} className={control} />
          </Field>
          <Field label="Fecha del gasto" required>
            <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} className={control} />
          </Field>
          <Field label="Monto (Q)" required>
            <input inputMode="decimal" maxLength={12} value={monto} onChange={(event) => setMonto(event.target.value)} className={control} />
          </Field>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando} className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold">Cancelar</button>
          <button type="submit" disabled={guardando} className="min-h-[44px] rounded-xl bg-brand-700 px-4 text-sm font-bold text-white disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar gasto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
