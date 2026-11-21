import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Eye, RotateCcw } from 'lucide-react';
import { AuditoriaLogModel, PaginationMeta } from '../../models';
import { auditoriaService } from '../../services/auditoria.service';
import { formatDateTime } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';

export const AuditoriaPage: React.FC = () => {
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
          <ShieldCheck className="h-7 w-7 text-brand-600" />
          Auditoría Inmutable
        </h1>
        <p className="text-sm text-slate-500">
          Registro de solo lectura de accesos, anulaciones, reimpresiones, precios, mermas, caja y permisos
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <select
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value)}
          className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos los usuarios</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombreCompleto} ({u.username})
            </option>
          ))}
        </select>

        <select
          value={accion}
          onChange={(e) => setAccion(e.target.value)}
          className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
        >
          <option value="">Todas las acciones</option>
          {acciones.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
        />

        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-sm"
        />

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
          <RotateCcw className="h-4 w-4" />
          Limpiar
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="py-3 px-2">Fecha / Hora</th>
                <th className="py-3 px-2">Usuario</th>
                <th className="py-3 px-2">Acción</th>
                <th className="py-3 px-2">Entidad</th>
                <th className="py-3 px-2">Motivo / IP</th>
                <th className="py-3 px-2 text-right">Cambios</th>
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
                        {l.accion}
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
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver Diff
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
        title={`Detalle de Auditoría #${selectedLog?.id ?? ''} — ${selectedLog?.accion ?? ''}`}
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
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase text-red-700">Valor Anterior</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs text-slate-800">
                  {selectedLog.valorAnterior
                    ? JSON.stringify(selectedLog.valorAnterior, null, 2)
                    : 'null (registro nuevo)'}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase text-emerald-700">Valor Nuevo</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-800">
                  {selectedLog.valorNuevo
                    ? JSON.stringify(selectedLog.valorNuevo, null, 2)
                    : 'null'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
