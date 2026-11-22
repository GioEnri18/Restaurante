import { useState, type FormEvent } from 'react';
import { CategoriaModel, IngredienteModel } from '../../../models';
import { mensajeErrorFormulario } from '../../../services/httpClient';
import { ventasService } from '../../../services/ventas.service';
import { Alert } from '../common/Alert';
import { Modal } from '../common/Modal';
import { LineaRecetaForm, RecetaCampos } from './RecetaCampos';

const CAMPO = 'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm';

export function NuevoPlatilloInventarioModal({
  categorias, ingredientes, onCerrar, onGuardado,
}: {
  categorias: CategoriaModel[];
  ingredientes: IngredienteModel[];
  onCerrar: () => void;
  onGuardado: (publicado: boolean) => void;
}) {
  const [form, setForm] = useState({ nombre: '', sku: '', categoriaId: '', precio: '', publicar: false });
  const [receta, setReceta] = useState<LineaRecetaForm[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (guardando || receta.length === 0) return;
    setGuardando(true);
    setError(null);
    try {
      await ventasService.crearPlatillo({
        categoriaId: Number(form.categoriaId),
        nombre: form.nombre.trim(),
        sku: form.sku.trim(),
        precioVenta: Number(form.precio),
        disponible: form.publicar,
        receta: receta.map(({ ingredienteId, cantidadOz }) => ({ ingredienteId, cantidadOz: Number(cantidadOz) })),
      });
      onGuardado(form.publicar);
    } catch (err) {
      setError(mensajeErrorFormulario(err, 'No se pudo guardar el platillo'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open title="Nuevo platillo con receta" onClose={() => { if (!guardando) onCerrar(); }}>
      <form onSubmit={guardar} className="space-y-4">
        <fieldset disabled={guardando} className="grid gap-3 text-sm font-semibold sm:grid-cols-2">
          <label className="space-y-1">
            <span>Nombre del platillo</span>
            <input className={CAMPO} required minLength={2} maxLength={120} value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span>Código único del platillo</span>
            <input className={CAMPO} required minLength={2} maxLength={30} value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span>Categoría</span>
            <select className={CAMPO} required value={form.categoriaId}
              onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
              <option value="">Selecciona una categoría</option>
              {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span>Precio de venta (Q)</span>
            <input className={CAMPO} required type="number" min="0.01" max="99999999.99" step="0.01"
              value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} />
          </label>
          <div className="space-y-3 sm:col-span-2">
            <RecetaCampos ingredientes={ingredientes} lineas={receta} onChange={setReceta} />
            <label className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-teal-950">
              <input type="checkbox" checked={form.publicar}
                onChange={(e) => setForm({ ...form, publicar: e.target.checked })} />
              <span>Habilitar para vender al guardar</span>
            </label>
          </div>
        </fieldset>
        {error && <div role="alert"><Alert type="error" message={error} /></div>}
        <button type="submit" disabled={guardando || receta.length === 0}
          className="min-h-[44px] rounded-xl bg-brand-600 px-4 text-sm font-bold text-white disabled:opacity-50">
          {guardando ? 'Guardando…' : form.publicar ? 'Guardar y habilitar venta' : 'Guardar borrador'}
        </button>
      </form>
    </Modal>
  );
}
