import React from 'react';
import { ShieldCheck } from 'lucide-react';

export interface AutorizacionSupervisor {
  identifier: string;
  password: string;
}

interface AutorizacionSupervisorFieldsProps {
  value: AutorizacionSupervisor;
  onChange: (value: AutorizacionSupervisor) => void;
  operacion: 'abrir' | 'cerrar';
}

/**
 * Control dual de caja: un cajero no abre ni cierra caja por sí mismo. Un Administrador o Auditor
 * escribe aquí su usuario y contraseña para autorizar la operación. Las credenciales se envían solo
 * con esa petición y no se guardan en el navegador.
 */
export const AutorizacionSupervisorFields: React.FC<AutorizacionSupervisorFieldsProps> = ({
  value,
  onChange,
  operacion,
}) => (
  <fieldset className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
    <legend className="flex items-center gap-1.5 px-1 text-sm font-extrabold text-amber-900">
      <ShieldCheck className="h-4 w-4" />
      Autorización de supervisor
    </legend>
    <p className="text-xs text-amber-900">
      Para {operacion} la caja, un administrador o auditor debe escribir su usuario y contraseña.
    </p>
    <input
      required
      type="text"
      autoComplete="off"
      value={value.identifier}
      onChange={(e) => onChange({ ...value, identifier: e.target.value })}
      placeholder="Usuario del supervisor"
      aria-label="Usuario del supervisor"
      className="min-h-[46px] w-full rounded-xl border border-amber-300 bg-white px-3.5 text-sm"
    />
    <input
      required
      type="password"
      autoComplete="off"
      value={value.password}
      onChange={(e) => onChange({ ...value, password: e.target.value })}
      placeholder="Contraseña del supervisor"
      aria-label="Contraseña del supervisor"
      className="min-h-[46px] w-full rounded-xl border border-amber-300 bg-white px-3.5 text-sm"
    />
  </fieldset>
);

export const AUTORIZACION_VACIA: AutorizacionSupervisor = { identifier: '', password: '' };
