import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Eye, RotateCcw } from 'lucide-react';
import { AuditoriaLogModel, PaginationMeta } from '../../models';
import { auditoriaService } from '../../services/auditoria.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Field } from '../components/common/Field';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { NominaPanel } from '../components/auditoria/NominaPanel';

function nombreAccion(accion: string): string {
  if (accion === 'GESTION_NOMINA') return 'Cambio de sueldo o fecha de ingreso';
  const frase = accion.toLowerCase().replaceAll('_', ' ');
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

function ValoresRegistrados({ titulo, valor }: { titulo: string; valor: unknown }) {
  const campos = valor && typeof valor === 'object' ? Object.entries(valor) : [];
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-bold">{titulo}</h3>
      {campos.length === 0 ? <p className="text-sm text-slate-600">Sin datos registrados.</p> : (
        <dl className="divide-y divide-slate-200">
          {campos.map(([campo, dato]) => {
            const etiqueta = campo === 'sueldoMensual' ? 'Sueldo mensual' :
              nombreAccion(campo.replace(/([a-z])([A-Z])/g, '$1 $2'));
            return (
              <div key={campo} className="grid grid-cols-2 gap-2 py-2">
                <dt className="text-slate-600">{etiqueta}</dt>
                <dd className="break-words font-medium">
                  {dato == null ? '—' : typeof dato === 'object' ? (
                    <details>
                      <summary className="cursor-pointer text-teal-800">Ver detalle</summary>
                      <pre className="max-h-56 overflow-auto text-xs">{JSON.stringify(dato, null, 2)}</pre>
                    </details>
                  ) : campo === 'sueldoMensual' && typeof dato === 'number'
                    ? formatCurrency(dato)
                    : typeof dato === 'boolean' ? (dato ? 'Sí' : 'No') : String(dato)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}

export const AuditoriaPage: React.FC = () => {
  const puedeVerNomina = useAuthStore((s) => s.isAdmin());
  const puedeEditarPersonal = useAuthStore((s) => s.can('accesos:ver') && s.can('accesos:gestionar'));
  const [vista, setVista] = useState<'actividad' | 'nomina'>('actividad');
  const [logs, setLogs] = useState<AuditoriaLogModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [acciones, setAcciones] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<Array<{ id: number; username: string; nombreCompleto: string }>>([]);

  const [usuarioId, setUsuarioId] = useState('');
  const [accion, setAccion] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [selectedLog, setSelectedLog] = useState<AuditoriaLogModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void auditoriaService
      .obtenerCatalogo()
      .then((cat) => {
        setAcciones(cat.acciones);
        setUsuarios(cat.usuarios);
      })
      .catch(() => null);
  }, []);

  const cargar = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const res = await auditoriaService.listar({
          page,
          usuarioId: usuarioId || undefined,
          accion: accion || undefined,
          fechaDesde: fechaDesde || undefined,
          fechaHasta: fechaHasta || undefined,
        });
        setLogs(res.items);
        setMeta(res.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando bitácora de auditoría');
      } finally {
        setLoading(false);
      }
    },
    [usuarioId, accion, fechaDesde, fechaHasta],
  );

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
          <ShieldCheck className="h-7 w-7 text-brand-600" aria-hidden="true" />
          Auditoría
        </h1>
        <p className="text-sm text-slate-500">
          Consulta quién hizo cada cambio y cuándo ocurrió.
        </p>
      </div>

      {puedeVerNomina && (
        <div className="flex flex-wrap gap-2" aria-label="Vistas de Auditoría">
          {(['actividad', 'nomina'] as const).map((opcion) => (
            <button key={opcion} type="button" aria-pressed={vista === opcion} onClick={() => setVista(opcion)}
              className={`min-h-[44px] rounded-xl border px-4 text-sm font-bold ${vista === opcion ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
              {opcion === 'actividad' ? 'Actividad' : 'Nómina'}
            </button>
          ))}
        </div>
      )}
      {puedeVerNomina && vista === 'nomina' ? <NominaPanel puedeEditar={puedeEditarPersonal} /> : <>
      {error && <Alert type="error" message={error} />}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Persona que hizo el cambio" srOnlyLabel>
          <select
            value={usuarioId}
            onChange={(e) => setUsuarioId(e.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombreCompleto} ({u.username})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo de acción" srOnlyLabel>
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todas las acciones</option>
            {acciones.map((a) => (
              <option key={a} value={a}>
                {nombreAccion(a)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fecha inicial de la actividad" srOnlyLabel>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>

        <Field label="Fecha final de la actividad" srOnlyLabel>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>

        <button
          type="button"
          onClick={() => {
            setUsuarioId('');
            setAccion('');
            setFechaDesde('');
            setFechaHasta('');
          }}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Limpiar
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <caption className="sr-only">
              Bitácora de auditoría con usuario, acción, entidad y cambios registrados
            </caption>
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th scope="col" className="py-3 px-2">Fecha / Hora</th>
                <th scope="col" className="py-3 px-2">Usuario</th>
                <th scope="col" className="py-3 px-2">Acción</th>
                <th scope="col" className="py-3 px-2">Entidad</th>
                <th scope="col" className="py-3 px-2">Motivo / IP</th>
                <th scope="col" className="py-3 px-2 text-right">Cambios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Cargando registros de auditoría...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No se encontraron registros con esos filtros.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2 text-xs text-slate-600">{formatDateTime(l.createdAt)}</td>
                    <td className="py-2.5 px-2">
                      <p className="font-semibold text-slate-900">{l.usuarioNombre}</p>
                      <p className="text-xs text-slate-400">{l.rolNombre}</p>
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge
                        variant={
                          l.accion.includes('ANULACION') || l.accion.includes('FALLIDO')
                            ? 'danger'
                            : l.accion.includes('MERMA') || l.accion.includes('AJUSTE')
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {nombreAccion(l.accion)}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-xs font-medium text-slate-700">
                      {l.entidad}
                      {l.entidadId ? ` #${l.entidadId}` : ''}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-600">
                      <p>{l.motivo || '—'}</p>
                      <p className="text-slate-400">IP: {l.ipAddress || '—'}</p>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(l)}
                        aria-label={`Ver cambios del registro ${l.id} (${nombreAccion(l.accion)})`}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Ver cambio
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onPageChange={(p) => void cargar(p)} />
      </div>

      {/* Modal Valor Anterior vs Valor Nuevo */}
      <Modal
        open={Boolean(selectedLog)}
        title={selectedLog ? nombreAccion(selectedLog.accion) : 'Detalle de actividad'}
        onClose={() => setSelectedLog(null)}
        maxWidthClass="max-w-3xl"
      >
        {selectedLog && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
              <p>
                <strong>Usuario:</strong> {selectedLog.usuarioNombre} ({selectedLog.usuarioUsername})
              </p>
              <p>
                <strong>Fecha:</strong> {formatDateTime(selectedLog.createdAt)}
              </p>
              <p>
                <strong>Entidad:</strong> {selectedLog.entidad} #{selectedLog.entidadId ?? 'N/A'}
              </p>
              <p>
                <strong>IP:</strong> {selectedLog.ipAddress ?? '—'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ValoresRegistrados titulo="Antes" valor={selectedLog.valorAnterior} />
              <ValoresRegistrados titulo="Después" valor={selectedLog.valorNuevo} />
            </div>
          </div>
        )}
      </Modal>
      </>}
    </div>
  );
};
