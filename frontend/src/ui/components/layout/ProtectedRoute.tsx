import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { useAuthStore } from '../../../store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permiso?: string | readonly string[];
  permisoAlguno?: readonly string[];
  rolesPermitidos?: readonly string[];
  adminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permiso,
  permisoAlguno,
  rolesPermitidos,
  adminOnly = false,
}) => {
  const { usuario, initialized, can, isAdmin } = useAuthStore();

  if (!initialized) {
    return (
      <div
        role="status"
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600"
      >
        <Loader2 className="h-7 w-7 animate-spin text-brand-700" aria-hidden="true" />
        <p className="text-sm font-semibold">Cargando tu sesión…</p>
      </div>
    );
  }

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  // Validación estricta de rol Administrador en frontend (respaldada además en el backend)
  if (adminOnly && !isAdmin()) {
    return <Navigate to={usuario.rol.vistaInicial || '/ventas'} replace />;
  }

  const permisoInsuficiente =
    (permiso && (typeof permiso === 'string' ? !can(permiso) : !permiso.every(can))) ||
    (permisoAlguno && !permisoAlguno.some(can));
  if (permisoInsuficiente || (rolesPermitidos && !rolesPermitidos.includes(usuario.rol.codigo))) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700"
          aria-hidden="true"
        >
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Acceso restringido</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu perfil (<strong>{usuario.rol.nombre}</strong>) no tiene permiso para ver esta sección.
        </p>
        <Link
          to={usuario.rol.vistaInicial || '/ventas'}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-700 px-5 text-sm font-bold text-white hover:bg-brand-800"
        >
          Ir a mi pantalla principal
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};
