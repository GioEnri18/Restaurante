import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { IngredienteModel, MermasListadoModel, MotivoMerma, UnidadMedida } from '../../models';
import { inventarioService } from '../../services/inventario.service';
import { mermasService } from '../../services/mermas.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime, lbToOzPreview } from '../../utils/formatters';
import { generarUuid } from '../../utils/idempotency';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Field } from '../components/common/Field';
import { Pagination } from '../components/common/Pagination';

const MOTIVOS: Array<{ value: MotivoMerma; label: string }> = [
  { value: 'VENCIMIENTO', label: 'Vencimiento' },
  { value: 'DANO', label: 'Daño / Deterioro' },
  { value: 'ERROR_PREPARACION', label: 'Error de preparación' },
  { value: 'ACCIDENTE', label: 'Accidente en cocina' },
  { value: 'OTRO', label: 'Otro' },
];

export const MermasPage: React.FC = () => {
  const canCreate = useAuthStore((s) => s.can('mermas:crear'));
  const esCajero = useAuthStore((s) => s.usuario?.rol?.codigo === 'CAJERO');
  const [ingredientes, setIngredientes] = useState<IngredienteModel[]>([]);
  const [listado, setListado] = useState<MermasListadoModel | null>(null);
  const [filtroMotivo, setFiltroMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const intento = useRef<{ datos: string; clave: string } | null>(null);

  const [form, setForm] = useState({
    ingredienteId: '',
    cantidad: '',
    unidad: 'oz' as UnidadMedida,
    motivo: 'ERROR_PREPARACION' as MotivoMerma,
    observacion: '',
  });

  const cargar = useCallback(
    async (page = 1, refrescarIngredientes = false) => {
      setError(null);
      try {
        const [ings, data] = await Promise.all([
          refrescarIngredientes && canCreate ? inventarioService.listarIngredientes() : null,
          mermasService.listar({ page, motivo: filtroMotivo || undefined }),
        ]);
        if (ings) setIngredientes(ings);
        setListado(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando mermas');
      }
    },
    [canCreate, filtroMotivo],
  );

  useEffect(() => {
    void cargar(1, true);
  }, [cargar]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ingredienteId: Number(form.ingredienteId),
        cantidad: Number(form.cantidad),
        unidad: form.unidad,
        motivo: form.motivo,
        observacion: form.observacion.trim() || undefined,
      };
      const datos = JSON.stringify(payload);
      if (intento.current?.datos !== datos) {
        intento.current = { datos, clave: generarUuid() };
      }
      await mermasService.registrar({ ...payload, idempotencyKey: intento.current.clave });
      intento.current = null;
      setSuccess('Merma registrada: se descontó del inventario y se generó movimiento en Kardex + auditoría.');
      setForm({
        ingredienteId: '',
        cantidad: '',
        unidad: 'oz',
        motivo: 'ERROR_PREPARACION',
        observacion: '',
      });
      await cargar(1, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la merma');
    } finally {
      setGuardando(false);
    }
  };

  const cantidadOzPreview =
    form.unidad === 'lb' ? lbToOzPreview(Number(form.cantidad || 0)) : Number(form.cantidad || 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">{esCajero ? 'Mermas de hoy' : 'Mermas y pérdidas'}</h1>
        <p className="text-sm text-slate-500">
          {esCajero
            ? 'Registra las pérdidas del turno abierto. La cantidad se descuenta del inventario.'
            : 'Registra ingredientes dañados, vencidos o desperdiciados. La cantidad se descuenta del inventario.'}
        </p>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Costo de las pérdidas</p>
          <p className="mt-1 text-2xl font-black text-red-600">
            {formatCurrency(listado?.resumen.costoTotalMermas ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Cantidad total (oz)</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {(listado?.resumen.totalOzMermadas ?? 0).toFixed(2)} oz
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Equivalente (lb)</p>
          <p className="mt-1 text-2xl font-black text-slate-900">
            {(listado?.resumen.totalLbMermadas ?? 0).toFixed(2)} lb
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {canCreate && (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4"
          >
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Trash2 className="h-5 w-5 text-red-600" aria-hidden="true" />
              Registrar una pérdida
            </h2>

            <Field label="Ingrediente" required labelClassName="mb-1 block text-sm font-bold text-slate-700">
              <select
                value={form.ingredienteId}
                onChange={(e) => setForm({ ...form, ingredienteId: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              >
                <option value="">-- Seleccionar ingrediente --</option>
                {ingredientes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} (disp: {i.stockActualOz.toFixed(1)} oz)
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantidad perdida" required labelClassName="mb-1 block text-sm font-bold text-slate-700">
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
                />
              </Field>
              <Field label="Unidad" labelClassName="mb-1 block text-sm font-bold text-slate-700">
                <select
                  value={form.unidad}
                  onChange={(e) => setForm({ ...form, unidad: e.target.value as UnidadMedida })}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="oz">Onzas (oz)</option>
                  <option value="lb">Libras (lb)</option>
                </select>
              </Field>
            </div>

            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Se descontarán <strong>{cantidadOzPreview.toFixed(4)} oz</strong> del inventario.
            </p>

            <Field label="¿Qué pasó?" labelClassName="mb-1 block text-sm font-bold text-slate-700">
              <select
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value as MotivoMerma })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              >
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Nota (opcional)" labelClassName="mb-1 block text-sm font-bold text-slate-700">
              <textarea
                rows={3}
                value={form.observacion}
                onChange={(e) => setForm({ ...form, observacion: e.target.value })}
                placeholder="Detalle opcional del incidente..."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </Field>

            <button
              type="submit"
              disabled={guardando}
              className="min-h-[48px] w-full rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar y descontar existencias'}
            </button>
          </form>
        )}

        <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canCreate ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">Historial de Mermas</h2>
            <Field label="Filtrar mermas por motivo" srOnlyLabel>
              <select
                value={filtroMotivo}
                onChange={(e) => setFiltroMotivo(e.target.value)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-sm"
              >
                <option value="">Todos los motivos</option>
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Historial de mermas y pérdidas registradas en cocina e inventario
              </caption>
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th scope="col" className="py-2.5 px-2">Fecha</th>
                  <th scope="col" className="py-2.5 px-2">Ingrediente</th>
                  <th scope="col" className="py-2.5 px-2">Cantidad</th>
                  <th scope="col" className="py-2.5 px-2">Motivo</th>
                  <th scope="col" className="py-2.5 px-2 text-right">Costo</th>
                  <th scope="col" className="py-2.5 px-2">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(listado?.items ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-600">
                      No hay mermas registradas.
                    </td>
                  </tr>
                ) : (
                  listado?.items.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-2 text-xs text-slate-500">{formatDateTime(m.fecha)}</td>
                      <td className="py-2.5 px-2 font-bold text-slate-900">{m.ingredienteNombre}</td>
                      <td className="py-2.5 px-2">
                        {m.cantidadOriginal} {m.unidadOriginal} ({m.cantidadOz} oz)
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge variant="warning">{m.motivo}</Badge>
                        {m.observacion && (
                          <p className="mt-0.5 text-xs text-slate-500">{m.observacion}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-red-600">
                        {formatCurrency(m.costoEstimado)}
                      </td>
                      <td className="py-2.5 px-2 text-xs text-slate-600">{m.usuarioNombre}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {listado && <Pagination meta={listado.meta} onPageChange={(p) => void cargar(p)} />}
        </div>
      </div>
    </div>
  );
};
