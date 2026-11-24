import { useEffect, useState } from 'react';
import { isAbortError } from '../../../services/httpClient';
import { reportesService } from '../../../services/reportes.service';
import { formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Pagination } from '../common/Pagination';

export function GastosPeriodo({ desde, hasta }: { desde: string; hasta: string }) {
  const [page, setPage] = useState(1);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof reportesService.listarGastos>> | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <h2 className="mb-3 font-bold text-slate-900">Gastos registrados del mes</h2>
      {error ? <Alert type="error" message={error} /> : !resultado ? (
        <p role="status" className="text-sm text-slate-600">Cargando gastos…</p>
      ) : resultado.items.length === 0 ? (
        <p className="text-sm text-slate-600">No hay gastos indirectos ni alquiler registrados para este período.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>{['Fecha', 'Tipo', 'Concepto', 'Monto'].map((titulo) =>
                  <th key={titulo} scope="col" className="px-2 py-2 last:text-right">{titulo}</th>,
                )}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resultado.items.map((gasto) => (
                  <tr key={gasto.id}>
                    <td className="whitespace-nowrap px-2 py-2">{gasto.fecha}</td>
                    <td className="px-2 py-2">{gasto.categoria === 'ALQUILER' ? 'Alquiler' : 'Gasto indirecto'}</td>
                    <td className="px-2 py-2">{gasto.concepto}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{formatCurrency(gasto.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={resultado.meta} onPageChange={(pagina) => {
            setResultado(null);
            setError(null);
            setPage(pagina);
          }} />
        </>
      )}
    </section>
  );
}
