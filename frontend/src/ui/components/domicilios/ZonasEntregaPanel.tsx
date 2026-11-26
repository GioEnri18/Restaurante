import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { ZonaEntregaModel } from '../../../models';
import { domiciliosService } from '../../../services/domicilios.service';
import { formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';
import { TableSkeleton } from '../common/TableSkeleton';

interface ZonasEntregaPanelProps {
  onZonasActualizadas?: () => void;
}

export const ZonasEntregaPanel: React.FC<ZonasEntregaPanelProps> = ({ onZonasActualizadas }) => {
  const [zonas, setZonas] = useState<ZonaEntregaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ZonaEntregaModel | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [costoEnvio, setCostoEnvio] = useState('15.00');
  const [tiempoEstimadoMin, setTiempoEstimadoMin] = useState('30');
  const [pedidoMinimo, setPedidoMinimo] = useState('50.00');
  const [activa, setActiva] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setZonas(await domiciliosService.listarZonas(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando zonas de entrega');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirCrear = () => {
    setEditando(null);
    setNombre('');
    setDescripcion('');
    setCostoEnvio('15.00');
    setTiempoEstimadoMin('30');
    setPedidoMinimo('50.00');
    setActiva(true);
    setError(null);
    setModalOpen(true);
  };

  const abrirEditar = (z: ZonaEntregaModel) => {
    setEditando(z);
    setNombre(z.nombre);
    setDescripcion(z.descripcion ?? '');
    setCostoEnvio(z.costoEnvio.toFixed(2));
    setTiempoEstimadoMin(String(z.tiempoEstimadoMin));
    setPedidoMinimo(z.pedidoMinimo.toFixed(2));
    setActiva(z.activa);
    setError(null);
    setModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setGuardando(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        costoEnvio: Number(costoEnvio),
        tiempoEstimadoMin: Number(tiempoEstimadoMin),
        pedidoMinimo: Number(pedidoMinimo),
        activa,
      };
      if (editando) {
        await domiciliosService.actualizarZona(editando.id, payload);
        setFeedback(`Zona "${payload.nombre}" actualizada.`);
      } else {
        await domiciliosService.crearZona(payload);
        setFeedback(`Zona "${payload.nombre}" creada.`);
      }
      setModalOpen(false);
      await cargar();
      onZonasActualizadas?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la zona');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Zonas de entrega y tarifas</h2>
          <p className="text-xs text-slate-600">
            El costo de envío incluye IVA 12% y queda congelado en cada pedido como snapshot.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirCrear}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-extrabold text-white hover:bg-brand-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva zona
        </button>
      </div>

      {error && <Alert type="error" message={error} />}
      {feedback && <Alert type="success" message={feedback} />}

      {loading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : zonas.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Sin zonas de entrega configuradas"
          description="Crea al menos una zona activa con tarifa de envío para habilitar pedidos a domicilio."
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">Zona</th>
                <th className="px-4 py-3 text-right">Envío (IVA incl.)</th>
                <th className="px-4 py-3 text-right">Pedido mínimo</th>
                <th className="px-4 py-3 text-center">Tiempo est.</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zonas.map((z) => (
                <tr key={z.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{z.nombre}</p>
                    {z.descripcion && <p className="text-xs text-slate-500">{z.descripcion}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">
                    {formatCurrency(z.costoEnvio)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatCurrency(z.pedidoMinimo)}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700">{z.tiempoEstimadoMin} min</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={z.activa ? 'success' : 'neutral'}>
                      {z.activa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => abrirEditar(z)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? `Editar ${editando.nombre}` : 'Nueva zona de entrega'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleGuardar} className="space-y-4">
          <Field label="Nombre de la zona" required>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Zona 10"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Descripción / cobertura (opcional)">
            <input
              type="text"
              maxLength={250}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Sectores cubiertos..."
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Costo envío (Q)" required>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={costoEnvio}
                onChange={(e) => setCostoEnvio(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
            </Field>
            <Field label="Pedido mínimo (Q)" required>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={pedidoMinimo}
                onChange={(e) => setPedidoMinimo(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </Field>
            <Field label="Tiempo est. (min)" required>
              <input
                type="number"
                min={1}
                max={480}
                required
                value={tiempoEstimadoMin}
                onChange={(e) => setTiempoEstimadoMin(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Zona activa para recibir pedidos
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-[44px] rounded-xl bg-brand-700 px-5 text-sm font-extrabold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar zona'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
