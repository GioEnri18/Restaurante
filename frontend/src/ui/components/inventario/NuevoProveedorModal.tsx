import React, { useState } from 'react';
import { mensajeErrorFormulario } from '../../../services/httpClient';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
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
  onGuardar: (payload: NuevoProveedorPayload) => Promise<void>;
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
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    setProvForm(INITIAL_FORM);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    if (provForm.nombre.trim().length < 2) {
      setError('Escribe el nombre del proveedor con al menos dos caracteres.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      await onGuardar(provForm);
      cerrar();
    } catch (err) {
      setError(mensajeErrorFormulario(err, 'No se pudo guardar el proveedor'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} title="Nuevo proveedor" onClose={() => { if (!guardando) cerrar(); }}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nombre comercial" required>
          <input
            maxLength={120}
            placeholder="Nombre comercial"
            value={provForm.nombre}
            onChange={(e) => setProvForm({ ...provForm, nombre: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="NIT">
            <input
              placeholder="NIT"
              maxLength={25}
              value={provForm.nit}
              onChange={(e) => setProvForm({ ...provForm, nit: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Teléfono">
            <input
              placeholder="Teléfono"
              type="tel"
              maxLength={30}
              value={provForm.telefono}
              onChange={(e) => setProvForm({ ...provForm, telefono: e.target.value })}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
        </div>
        <Field label="Persona de contacto">
          <input
            placeholder="Persona de contacto"
            maxLength={100}
            value={provForm.contacto}
            onChange={(e) => setProvForm({ ...provForm, contacto: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        <Field label="Correo electrónico (opcional)">
          <input
            type="email"
            maxLength={120}
            placeholder="Correo del proveedor (opcional)"
            value={provForm.email}
            onChange={(e) => setProvForm({ ...provForm, email: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>
        {error && <div role="alert"><Alert type="error" message={error} /></div>}
        <button
          type="submit"
          disabled={guardando}
          className="min-h-[46px] w-full rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar proveedor'}
        </button>
      </form>
    </Modal>
  );
};
