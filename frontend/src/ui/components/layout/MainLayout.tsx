import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { AlertaMenuEspecialModel } from '../../../models';
import { ventasService } from '../../../services/ventas.service';
import { useAuthStore } from '../../../store/auth.store';
import { formatDateOnly } from '../../../utils/formatters';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { QuickHelpModal } from '../common/QuickHelpModal';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

const SIDEBAR_STORAGE_KEY = 'pos_sidebar_collapsed';

export const MainLayout: React.FC = () => {
  const location = useLocation();
  const [openMobile, setOpenMobile] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [alertasMenus, setAlertasMenus] = useState<AlertaMenuEspecialModel[]>([]);
  const [alertasError, setAlertasError] = useState(false);
  const [avisoErrorOculto, setAvisoErrorOculto] = useState(false);
  const [avisoOculto, setAvisoOculto] = useState<string | null>(null);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const toggleSidebarDesktop = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.sessionStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignorar si sessionStorage no está disponible
      }
      return next;
    });
  }, []);

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
      <Sidebar
        openMobile={openMobile}
        onCloseMobile={() => setOpenMobile(false)}
        collapsedDesktop={sidebarCollapsed}
        onToggleCollapseDesktop={toggleSidebarDesktop}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebarDesktop={toggleSidebarDesktop}
          onOpenSidebarMobile={() => setOpenMobile(true)}
          alertasMenusCount={alertasMenus.length}
          onOpenHelp={() => setHelpOpen(true)}
        />

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
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 text-sm lg:px-6 ${
              alertaDestacada.requiereAtencion
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CalendarClock
                className={`h-5 w-5 shrink-0 ${
                  alertaDestacada.requiereAtencion ? 'text-amber-600' : 'text-emerald-600'
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

        {/* Contenido principal (se expande automáticamente cuando el Sidebar está colapsado) */}
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
