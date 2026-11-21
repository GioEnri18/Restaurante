import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/auth.store';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permiso?: string;
  adminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  permiso,
  adminOnly = false,
}) => {
  const { token, usuario, initialized, can, isAdmin } = useAuthStore();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Cargando sesión...
      </div>
    );
  }

  if (!token || !usuario) {
    return <Navigate to="/login" replace />;
  }

  // Validación estricta de rol Administrador en frontend (respaldada además en el backend)
  if (adminOnly && !isAdmin()) {
    return <Navigate to={usuario.rol.vistaInicial || '/ventas'} replace />;
  }

  if (permiso && !can(permiso)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-red-700">Acceso restringido</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tu rol ({usuario.rol.nombre}) no tiene permiso para acceder a esta vista.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
