import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ChefHat, Lock, User, LogIn } from 'lucide-react';
import { env } from '../../config/env';
import { useAuthStore } from '../../store/auth.store';
import { Alert } from '../components/common/Alert';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, usuario, login, loading } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (token && usuario) {
    return <Navigate to={usuario.rol.vistaInicial || '/ventas'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }

    try {
      const loggedUser = await login(identifier.trim(), password);
      navigate(loggedUser.rol.vistaInicial || '/ventas', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    }
  };

  const fillDemo = (user: string, pass: string) => {
    setIdentifier(user);
    setPassword(pass);
    setError(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
            <ChefHat className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">{env.APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sistema de Punto de Venta · Guatemala ({env.CURRENCY_CODE})
          </p>
        </div>

        {error && <Alert type="error" message={error} className="mb-5" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Usuario o correo electrónico
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Ej. admin, cajero o mesero"
                autoComplete="username"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Contraseña</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-base font-bold text-white shadow-lg shadow-brand-600/25 transition hover:bg-brand-700 disabled:opacity-60"
          >
            <LogIn className="h-5 w-5" />
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        {/* Accesos rápidos de prueba */}
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="mb-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
            Credenciales de prueba rápida
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fillDemo('admin', 'Admin123!')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:border-brand-300"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => fillDemo('cajero', 'Cajero123!')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:border-brand-300"
            >
              Cajero
            </button>
            <button
              type="button"
              onClick={() => fillDemo('mesero', 'Mesero123!')}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-brand-50 hover:border-brand-300"
            >
              Mesero
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
