import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PersonaNominaModel } from '../../../models';
import { auditoriaService } from '../../../services/auditoria.service';
import { formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { Pagination, usePaginacionLocal } from '../common/Pagination';

export function NominaPanel({ puedeEditar }: { puedeEditar: boolean }) {
  const [personas, setPersonas] = useState<PersonaNominaModel[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pagina = usePaginacionLocal(personas);

  useEffect(() => {
    let mounted = true;
    void auditoriaService.listarNomina()
      .then((datos) => { if (mounted) setPersonas(datos); })
      .catch((err: unknown) => { if (mounted) setError(err instanceof Error ? err.message : 'No se pudo consultar la nómina'); })
      .finally(() => { if (mounted) setCargando(false); });
    return () => { mounted = false; };
  }, []);

  if (cargando) return <p role="status" className="text-sm text-slate-600">Cargando nómina…</p>;
  if (error) return <Alert type="error" message={error} />;

  const activas = personas.filter((persona) => persona.activo);
  const pendientes = activas.filter((persona) => !persona.fechaIngreso || persona.sueldoMensual === null).length;
  const totalCentavos = activas.reduce((total, persona) => total + Math.round((persona.sueldoMensual ?? 0) * 100), 0);

  return (
    <section className="space-y-4" aria-label="Nómina del personal">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4">
        <div>
          <h2 className="font-bold text-teal-950">Sueldos mensuales acordados</h2>
          <p className="text-2xl font-extrabold text-teal-900">{formatCurrency(totalCentavos / 100)}</p>
          <p className="text-sm text-teal-900">
            Base mensual del personal activo, antes de deducciones y pagos. {pendientes > 0 && `${pendientes} con datos pendientes.`}
          </p>
        </div>
        {puedeEditar && <Link to="/accesos" className="rounded-xl border border-teal-300 bg-white px-4 py-2 text-sm font-bold text-teal-900">Editar datos del personal</Link>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
        {personas.length === 0 ? <p className="text-sm text-slate-600">Todavía no hay personal registrado.</p> : (
          <table className="w-full min-w-[540px] text-left text-sm">
            <thead className="border-b text-slate-600">
              <tr>
                <th scope="col" className="p-2">Persona</th>
                <th scope="col" className="p-2">Rol</th>
                <th scope="col" className="p-2">Fecha de ingreso</th>
                <th scope="col" className="p-2 text-right">Sueldo mensual</th>
                <th scope="col" className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagina.items.map((persona) => (
                <tr key={persona.id}>
                  <th scope="row" className="p-2 font-semibold">{persona.nombreCompleto}</th>
                  <td className="p-2">{persona.rol}</td>
                  <td className="p-2">{persona.fechaIngreso ? persona.fechaIngreso.split('-').reverse().join('/') : 'Pendiente'}</td>
                  <td className="p-2 text-right">{persona.sueldoMensual === null ? 'Pendiente' : formatCurrency(persona.sueldoMensual)}</td>
                  <td className="p-2"><Badge variant={persona.activo ? 'success' : 'neutral'}>{persona.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pagina.meta.totalPages > 1 && <Pagination meta={pagina.meta} onPageChange={pagina.onPageChange} />}
    </section>
  );
}
