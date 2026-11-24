import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { isAbortError } from '../../../services/httpClient';
import { BalanceEconomico, GastoOperativo, reportesService } from '../../../services/reportes.service';
import { formatCurrency } from '../../../utils/formatters';
import { fechaGuatemala } from '../../../utils/periodos';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';
import { ResumenGastos } from './CuadreEconomico';
import { RegistroGastoForm } from './RegistroGastoForm';

type AccionGasto = { tipo: 'agregar' } | { tipo: 'editar' | 'anular'; gasto: GastoOperativo };

const botonSecundario = 'inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-45';

export function GastosPeriodo({ desde, hasta, balance, puedeGestionar, onCambio }: {
  desde: string;
  hasta: string;
  balance: BalanceEconomico | null;
  puedeGestionar: boolean;
  onCambio: (fecha: string, mensaje: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof reportesService.listarGastos>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<AccionGasto | null>(null);
  const [seleccionId, setSeleccionId] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [errorAnulacion, setErrorAnulacion] = useState<string | null>(null);
  const hoy = fechaGuatemala.format(new Date());
  const fechaInicial = hoy >= desde && hoy <= hasta ? hoy : desde;
  const seleccionado = resultado?.items.find((gasto) => gasto.id === seleccionId);

  function guardado(fecha: string, mensaje: string) {
    setAccion(null);
    onCambio(fecha, mensaje);
  }

  async function anular() {
    if (accion?.tipo !== 'anular' || anulando || motivo.trim().length < 3) return;
    const { gasto } = accion;
    setAnulando(true);
    setErrorAnulacion(null);
    try {
      await reportesService.anularGasto(gasto.id, gasto.version, motivo.trim());
      guardado(gasto.fecha, 'Gasto anulado.');
    } catch (err) {
      setErrorAnulacion(err instanceof Error ? err.message : 'No se pudo anular el gasto.');
    } finally {
      setAnulando(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void reportesService.listarGastos(desde, hasta, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResultado(data);
      })
      .catch((err: unknown) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle de gastos.');
        }
      });
    return () => controller.abort();
  }, [desde, hasta, page]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">Gastos del mes</h2>
      {balance && <ResumenGastos balance={balance} />}
      <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-900">Gastos manuales</h3>
        {puedeGestionar && (
          <div role="group" aria-label="Acciones de gastos" className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAccion({ tipo: 'agregar' })}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-sm font-bold text-white hover:bg-brand-800">
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar gasto
            </button>
            <button type="button" disabled={!seleccionado}
              onClick={() => { if (seleccionado) setAccion({ tipo: 'editar', gasto: seleccionado }); }}
              className={botonSecundario}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Editar gasto
            </button>
            <button type="button" disabled={!seleccionado}
              onClick={() => {
                if (!seleccionado) return;
                setMotivo('');
                setErrorAnulacion(null);
                setAccion({ tipo: 'anular', gasto: seleccionado });
              }}
              className={`${botonSecundario} text-red-700`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Anular gasto
            </button>
          </div>
        )}
      </div>
      {error ? <Alert type="error" message={error} /> : !resultado ? (
        <p role="status" className="text-sm text-slate-600">Cargando gastos…</p>
      ) : resultado.items.length === 0 ? (
        <p className="text-sm text-slate-600">No hay gastos manuales registrados para este mes.</p>
      ) : (
        <>
          {puedeGestionar && !seleccionado && (
            <p className="mb-2 text-sm text-slate-600">Selecciona una fila para editar o anular el gasto.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  {puedeGestionar && <th scope="col" className="px-2 py-2"><span className="sr-only">Seleccionar</span></th>}
                  <th scope="col" className="px-2 py-2">Fecha</th>
                  <th scope="col" className="px-2 py-2">Concepto</th>
                  <th scope="col" className="px-2 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resultado.items.map((gasto) => (
                  <tr key={gasto.id} className={gasto.id === seleccionId ? 'bg-brand-50' : undefined}>
                    {puedeGestionar && <td className="px-2 py-2">
                      <input type="radio" name="gasto-seleccionado" aria-label={`Seleccionar gasto ${gasto.concepto}`}
                        checked={gasto.id === seleccionId} onChange={() => setSeleccionId(gasto.id)} />
                    </td>}
                    <td className="whitespace-nowrap px-2 py-2">{gasto.fecha}</td>
                    <td className="px-2 py-2">{gasto.concepto}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{formatCurrency(gasto.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={resultado.meta} onPageChange={(pagina) => {
            setResultado(null);
            setSeleccionId(null);
            setError(null);
            setPage(pagina);
          }} />
        </>
      )}
      {accion && accion.tipo !== 'anular' && (
        <RegistroGastoForm gasto={accion.tipo === 'editar' ? accion.gasto : undefined}
          fechaInicial={fechaInicial} onCancelar={() => setAccion(null)} onGuardado={guardado} />
      )}
      {accion?.tipo === 'anular' && (
        <Modal open title="Anular gasto" onClose={() => { if (!anulando) setAccion(null); }}>
          <form onSubmit={(event) => { event.preventDefault(); void anular(); }} className="space-y-4">
            {errorAnulacion && <Alert type="error" message={errorAnulacion} />}
            <p className="text-sm text-slate-700">Se retirará del cuadre el gasto «{accion.gasto.concepto}» por {formatCurrency(accion.gasto.monto)}. La anulación quedará registrada en la bitácora.</p>
            <Field label="Motivo de anulación" required>
              <input value={motivo} onChange={(event) => setMotivo(event.target.value)} minLength={3}
                maxLength={250} disabled={anulando} className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm" />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAccion(null)} disabled={anulando}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold">Cancelar</button>
              <button type="submit" disabled={anulando || motivo.trim().length < 3}
                className="min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-60">
                {anulando ? 'Anulando…' : 'Confirmar anulación'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
