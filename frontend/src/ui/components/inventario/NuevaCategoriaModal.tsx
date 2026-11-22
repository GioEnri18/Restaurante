import React, { useEffect, useState } from 'react';
import { Modal } from '../common/Modal';

export interface NuevaCategoriaPayload {
  nombre: string;
  descripcion?: string;
}

interface NuevaCategoriaModalProps {
  open: boolean;
  onClose: () => void;
  onGuardar: (payload: NuevaCategoriaPayload) => Promise<boolean>;
}

export const NuevaCategoriaModal: React.FC<NuevaCategoriaModalProps> = ({
  open,
  onClose,
  onGuardar,
}) => {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNombre('');
      setDescripcion('');
      setSaving(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const ok = await onGuardar({
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setNombre('');
      setDescripcion('');
    }
  };

  return (
    <Modal open={open} title="Nueva Categoría de Menú" onClose={onClose} maxWidthClass="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">
            Nombre de la categoría
          </label>
          <input
            required
            minLength={2}
            maxLength={80}
            placeholder="Ej. Entradas, Hamburguesas, Bebidas..."
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-600">
            Descripción (opcional)
          </label>
          <textarea
            rows={2}
            maxLength={250}
            placeholder="Descripción breve de los platillos en esta categoría"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar Categoría'}
        </button>
      </form>
    </Modal>
  );
};
