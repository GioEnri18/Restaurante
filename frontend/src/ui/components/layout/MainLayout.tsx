import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, BellRing, CalendarClock, HelpCircle, Menu, Store, X } from 'lucide-react';
import { env } from '../../../config/env';
import { AlertaMenuEspecialModel } from '../../../models';
import { ventasService } from '../../../services/ventas.service';
import { useAuthStore } from '../../../store/auth.store';
import { formatDateOnly } from '../../../utils/formatters';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { QuickHelpModal } from '../common/QuickHelpModal';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const [openMobile, setOpenMobile] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [alertasMenus, setAlertasMenus] = useState<AlertaMenuEspecialModel[]>([]);
  const [alertasError, setAlertasError] = useState(false);
  const [avisoErrorOculto, setAvisoErrorOculto] = useState(false);
  const [avisoOculto, setAvisoOculto] = useState<string | null>(null);
  const usuario = useAuthStore((s) => s.usuario);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const cargarAlertasMenus = useCallback(async () => {
    try {
      const data = await ventasService.obtenerAlertasMenusEspeciales();
      setAlertasMenus(data);
      setAlertasError(false);
    } catch (err) {
      console.error('[MainLayout] Error al obtener alertas de menús especiales:', err);
      setAlertasError(true);
    }
  }, []);

  // Carga proactiva de avisos de cambio de menú por fecha especial para el Administrador
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const ejecutarCarga = () => {
      if (document.visibilityState !== 'visible') return;
      void ventasService
        .obtenerAlertasMenusEspeciales()
        .then((data) => {
          if (!active) return;
          setAlertasMenus(data);
          setAlertasError(false);
        })
        .catch((err) => {
          if (!active) return;
          console.error('[MainLayout] Error al obtener alertas de menús especiales:', err);
          setAlertasError(true);
        });
    };
    ejecutarCarga();
    const intervalo = window.setInterval(ejecutarCarga, 60000);
    document.addEventListener('visibilitychange', ejecutarCarga);
    return () => {
      active = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', ejecutarCarga);
    };
  }, [isAdmin]);

  const alertaDestacada =
    alertasMenus.find((a) => a.requiereAtencion) ?? alertasMenus[0] ?? null;
  const idAviso = alertaDestacada
    ? `${alertaDestacada.id}:${alertaDestacada.estado}:${alertaDestacada.fechaInicio}`
    : null;

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar openMobile={openMobile} onCloseMobile={() => setOpenMobile(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior responsive */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenMobile(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
              <span>Menú</span>
            </button>
            <div className="flex items-center gap-2 text-slate-700">
              <Store className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {usuario?.sucursal.nombre ?? env.APP_NAME}
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  NIT: {usuario?.sucursal.nit} · Servicio:{' '}
                  {env.ENABLE_TABLE_SERVICE ? 'Mostrador y Mesas' : 'En Mostrador'} · Moneda:{' '}
                  {env.CURRENCY_CODE} ({env.CURRENCY_SYMBOL})
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && alertasMenus.length > 0 && (
              <Link
                to="/menus-especiales"
                className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 md:inline-flex"
              >
                <BellRing className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
                {alertasMenus.length} aviso(s) de menú
              </Link>
            )}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Guía rápida de esta pantalla"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              title="Guía rápida de esta pantalla"
            >
              <HelpCircle className="h-4 w-4 text-brand-600" aria-hidden="true" />
              <span className="hidden sm:inline">¿Cómo usar?</span>
            </button>
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              {usuario?.rol.nombre}
            </span>
          </div>
        </header>

        {/* Aviso discreto al Administrador si falló la carga de alertas de menús especiales */}
        {isAdmin && alertasError && !avisoErrorOculto && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-4 py-2 text-xs text-amber-950 lg:px-6"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
              <span>
                No se pudieron actualizar los avisos de menús especiales. Puedes continuar operando con normalidad.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void cargarAlertasMenus()}
                className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => setAvisoErrorOculto(true)}
                className="rounded-lg p-1 text-amber-800 hover:bg-black/5"
                aria-label="Ocultar aviso de error de alertas"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Aviso proactivo global de Menú por Fecha Especial (exclusivo Administrador) */}
        {isAdmin && alertaDestacada && idAviso !== avisoOculto && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm lg:px-6 ${alertaDestacada.requiereAtencion
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950'
              }`}
          >
            <div className="flex items-center gap-2.5">
              <CalendarClock
                className={`h-5 w-5 shrink-0 ${alertaDestacada.requiereAtencion ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                aria-hidden="true"
              />
              <p className="text-xs sm:text-sm">
                <strong>
                  {alertaDestacada.estado === 'ACTIVO_HOY'
                    ? `Menú especial activo hoy: ${alertaDestacada.nombre}`
                    : `Aviso de próximo cambio de menú: ${alertaDestacada.nombre}`}
                </strong>{' '}
                ({formatDateOnly(alertaDestacada.fechaInicio)} al{' '}
                {formatDateOnly(alertaDestacada.fechaFin)}) — {alertaDestacada.mensaje}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/menus-especiales"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                Configurar menú
              </Link>
              <button
                type="button"
                onClick={() => setAvisoOculto(idAviso)}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5"
                aria-label="Ocultar aviso"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Contenido principal */}
        <main className="flex-1 p-4 lg:p-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-slate-600">Cargando módulo…</p>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <QuickHelpModal
        open={helpOpen}
        pathname={location.pathname}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
};
