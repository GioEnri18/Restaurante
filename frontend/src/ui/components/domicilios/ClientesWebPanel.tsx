import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle2, Search, ShieldAlert } from 'lucide-react';
import { ClienteDomicilioModel, PaginationMeta } from '../../../models';
import { domiciliosService } from '../../../services/domicilios.service';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { Pagination } from '../common/Pagination';
import { TableSkeleton } from '../common/TableSkeleton';

/**
 * Panel administrativo (permiso `domicilios:configurar`) para gestionar la marca
 * `bloqueado_pedidos_web` por cliente. Cada cambio queda auditado en `auditoria_logs`.
 */
export const ClientesWebPanel: React.FC = () => {
  const [clientes, setClientes] = useState<ClienteDomicilioModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchAplicado, setSearchAplicado] = useState('');
  const [soloBloqueados, setSoloBloqueados] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [objetivo, setObjetivo] = useState<ClienteDomicilioModel | null>(null);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await domiciliosService.listarClientes({
        page,
        limit: 20,
        search: searchAplicado || undefined,
        soloBloqueados,
      });
      setClientes(res.items);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando clientes de domicilio');
    } finally {
      setLoading(false);
    }
  }, [page, searchAplicado, soloBloqueados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchAplicado(search.trim());
  };

  const abrirConfirmacion = (cliente: ClienteDomicilioModel) => {
    setObjetivo(cliente);
    setMotivo('');
    setError(null);
    setFeedback(null);
  };

  const confirmarCambio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!objetivo) return;
    setGuardando(true);
    setError(null);
    setFeedback(null);
    try {
      const nuevoEstado = !objetivo.bloqueadoPedidosWeb;
      await domiciliosService.actualizarBloqueoWebCliente(objetivo.id, {
        bloqueado: nuevoEstado,
        motivo: motivo.trim(),
      });
      setFeedback(
        nuevoEstado
          ? `Se bloqueó el portal web para "${objetivo.nombre}".`
          : `Se reactivó el acceso al portal web para "${objetivo.nombre}".`,
      );
      setObjetivo(null);
      setMotivo('');
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado del cliente');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Control de clientes en portal web</h2>
          <p className="text-xs text-slate-600">
            Bloquea o reactiva teléfonos específicos para pedidos desde el portal público. Cada cambio manual queda auditado.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleBuscar}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <Field label="Buscar por nombre o teléfono" className="min-w-[240px] flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej. María o 5512..."
              className="min-h-[42px] w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
            />
          </div>
        </Field>

        <label className="flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            checked={soloBloqueados}
            onChange={(e) => {
              setSoloBloqueados(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Solo bloqueados web
        </label>

        <button
          type="submit"
          className="min-h-[42px] rounded-xl bg-brand-700 px-4 text-xs font-extrabold text-white hover:bg-brand-800"
        >
          Buscar
        </button>
      </form>

      {error && <Alert type="error" message={error} />}
      {feedback && <Alert type="success" message={feedback} />}

      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : clientes.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={soloBloqueados ? 'No hay clientes bloqueados' : 'Sin clientes registrados'}
          description="Los clientes aparecen automáticamente al recibir pedidos a domicilio o desde el portal web."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-left">NIT</th>
                  <th className="px-4 py-3 text-center">Portal web</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-bold text-slate-900">{c.nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{c.telefono}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.nit || 'CF'}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={c.bloqueadoPedidosWeb ? 'danger' : 'success'}>
                        {c.bloqueadoPedidosWeb ? 'Bloqueado web' : 'Permitido'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => abrirConfirmacion(c)}
                        className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                          c.bloqueadoPedidosWeb
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        {c.bloqueadoPedidosWeb ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Desbloquear web
                          </>
                        ) : (
                          <>
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            Bloquear web
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} />}
        </>
      )}

      <Modal
        open={Boolean(objetivo)}
        onClose={() => setObjetivo(null)}
        title={
          objetivo
            ? objetivo.bloqueadoPedidosWeb
              ? `Desbloquear pedidos web — ${objetivo.nombre}`
              : `Bloquear pedidos web — ${objetivo.nombre}`
            : ''
        }
        maxWidthClass="max-w-md"
      >
        {objetivo && (
          <form onSubmit={confirmarCambio} className="space-y-4">
            <Alert
              type={objetivo.bloqueadoPedidosWeb ? 'info' : 'warning'}
              message={
                objetivo.bloqueadoPedidosWeb
                  ? 'El cliente podrá enviar pedidos desde el portal público nuevamente (sujeto a los límites normales).'
                  : 'Los intentos desde el portal público con este teléfono recibirán un mensaje genérico sin revelar el bloqueo.'
              }
            />
            <Field label="Motivo obligatorio para auditoría (mínimo 5 caracteres)" required>
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={300}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={
                  objetivo.bloqueadoPedidosWeb
                    ? 'Ej. Cliente aclaró incidente por teléfono con gerencia'
                    : 'Ej. Tres pedidos falsos consecutivos sin recibir entrega'
                }
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setObjetivo(null)}
                className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className={`min-h-[42px] rounded-xl px-4 text-xs font-extrabold text-white disabled:opacity-50 ${
                  objetivo.bloqueadoPedidosWeb
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {guardando
                  ? 'Guardando...'
                  : objetivo.bloqueadoPedidosWeb
                    ? 'Confirmar desbloqueo'
                    : 'Confirmar bloqueo'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
