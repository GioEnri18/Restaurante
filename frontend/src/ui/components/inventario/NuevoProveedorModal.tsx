import React, { useState } from 'react';
import { Modal } from '../common/Modal';

export interface NuevoProveedorPayload {
  nombre: string;
  nit: string;
  telefono: string;
  email: string;
  contacto: string;
}

interface NuevoProveedorModalProps {
  open: boolean;
  onClose: () => void;
  onGuardar: (payload: NuevoProveedorPayload) => Promise<boolean>;
}

const INITIAL_FORM: NuevoProveedorPayload = {
  nombre: '',
  nit: '',
  telefono: '',
  email: '',
  contacto: '',
};

export const NuevoProveedorModal: React.FC<NuevoProveedorModalProps> = ({
  open,
  onClose,
  onGuardar,
}) => {
  const [provForm, setProvForm] = useState<NuevoProveedorPayload>(INITIAL_FORM);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onGuardar(provForm);
    if (ok) {
      setProvForm(INITIAL_FORM);
    }
  };

  return (
    <Modal open={open} title="Nuevo Proveedor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          placeholder="Nombre comercial"
          value={provForm.nombre}
          onChange={(e) => setProvForm({ ...provForm, nombre: e.target.value })}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="NIT"
            value={provForm.nit}
            onChange={(e) => setProvForm({ ...provForm, nit: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
          <input
            placeholder="Teléfono"
            value={provForm.telefono}
            onChange={(e) => setProvForm({ ...provForm, telefono: e.target.value })}
            className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
          />
        </div>
        <input
          placeholder="Persona de contacto"
          value={provForm.contacto}
          onChange={(e) => setProvForm({ ...provForm, contacto: e.target.value })}
          className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
        />
        <button
          type="submit"
          className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
        >
          Guardar Proveedor
        </button>
      </form>
    </Modal>
  );
};
