import React, { useEffect, useState } from 'react';
import { CategoriaModel, IngredienteModel } from '../../../models';
import { ventasService } from '../../../services/ventas.service';
import { Alert } from '../common/Alert';
import { Modal } from '../common/Modal';
import { SelectorFotoPlatillo } from '../common/SelectorFotoPlatillo';
import { LineaRecetaForm, RecetaCampos } from './RecetaCampos';

interface NuevoPlatilloModalProps {
  open: boolean;
  categorias: CategoriaModel[];
  ingredientes: IngredienteModel[];
  onNuevaCategoria?: () => void;
  onClose: () => void;
  onCreated: (mensaje: string, avisoFoto?: string | null) => Promise<void>;
}

export const NuevoPlatilloModal: React.FC<NuevoPlatilloModalProps> = ({
  open,
  categorias,
  ingredientes,
  onNuevaCategoria,
  onClose,
  onCreated,
}) => {
  const [categoriaId, setCategoriaId] = useState('');
  const [sku, setSku] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [receta, setReceta] = useState<LineaRecetaForm[]>([]);
  const [foto, setFoto] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategoriaId(categorias[0] ? String(categorias[0].id) : '');
    setSku('');
    setNombre('');
    setDescripcion('');
    setPrecioVenta('');
    setReceta([]);
    setFoto(null);
    setError(null);
    setGuardando(false);
  }, [open, categorias]);

  useEffect(() => {
    if (open && !categoriaId && categorias.length > 0) {
      setCategoriaId(String(categorias[0].id));
    }
  }, [open, categoriaId, categorias]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando || !categoriaId) return;
    if (foto && foto.size > 5000000) {
      setError('La foto debe pesar como máximo 5 MB');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const recetaPayload = receta.length
        ? receta.map(({ ingredienteId, cantidadOz }) => ({
            ingredienteId,
            cantidadOz: Number(cantidadOz),
          }))
        : undefined;

      const { data: platillo } = await ventasService.crearPlatillo({
        categoriaId: Number(categoriaId),
        sku: sku.trim().toUpperCase(),
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        precioVenta: Number(precioVenta),
        ...(recetaPayload ? { receta: recetaPayload } : {}),
      });

      let avisoFoto: string | null = null;
      if (foto) {
        try {
          await ventasService.subirFotoPlatillo(platillo.id, foto);
        } catch (err) {
          avisoFoto = err instanceof Error ? err.message : 'No se pudo subir la foto';
        }
      }

      const msg = receta.length > 0
        ? `Platillo "${nombre.trim()}" guardado y disponible en Menú / Ventas.`
        : `Platillo "${nombre.trim()}" creado como borrador. Configura su receta con costo en Inventario → Recetas y Precios para habilitarlo en ventas.`;

      onClose();
      await onCreated(
        msg,
        avisoFoto
          ? `El platillo se guardó. Puedes cargar la foto en Inventario → Recetas y Precios. ${avisoFoto}`
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el platillo');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Agregar Nuevo Platillo (Solo Administrador)"
      onClose={() => { if (!guardando) onClose(); }}
      maxWidthClass="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-bold text-slate-600">Categoría</label>
            {onNuevaCategoria && (
              <button
                type="button"
                onClick={onNuevaCategoria}
                className="text-xs font-bold text-brand-600 hover:underline"
              >
                + Nueva categoría
              </button>
            )}
          </div>
          {categorias.length === 0 ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              Crea primero una categoría para poder registrar platillos.
            </p>
          ) : (
            <select
              required
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  Categoría: {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input
            required
            minLength={2}
            maxLength={30}
            placeholder="SKU (ej. BX-34)"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm uppercase"
          />
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Precio venta (Q)"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(e.target.value)}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-bold"
          />
        </div>

        <input
          required
          minLength={2}
          maxLength={120}
          placeholder="Nombre del platillo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />

        <textarea
          rows={2}
          maxLength={300}
          placeholder="Descripción breve (opcional)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3 text-sm"
        />

        <RecetaCampos ingredientes={ingredientes} lineas={receta} onChange={setReceta} />

        {receta.length === 0 && (
          <p className="text-xs text-amber-800">
            Sin receta el platillo se guarda como borrador (no disponible) hasta asignarle ingredientes con costo en Inventario → Recetas y Precios.
          </p>
        )}

        <SelectorFotoPlatillo onChange={setFoto} disabled={guardando} />

        {error && <Alert type="error" message={error} />}

        <button
          type="submit"
          disabled={guardando || categorias.length === 0}
          className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar Platillo'}
        </button>
      </form>
    </Modal>
  );
};
