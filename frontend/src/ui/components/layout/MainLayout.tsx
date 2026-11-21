import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { BellRing, CalendarClock, Menu, Store, X } from 'lucide-react';
import { env } from '../../../config/env';
import { AlertaMenuEspecialModel } from '../../../models';
import { ventasService } from '../../../services/ventas.service';
import { useAuthStore } from '../../../store/auth.store';
import { formatDateOnly } from '../../../utils/formatters';
import { Sidebar } from './Sidebar';

export const MainLayout: React.FC = () => {
  const [openMobile, setOpenMobile] = useState(false);
  const [alertasMenus, setAlertasMenus] = useState<AlertaMenuEspecialModel[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const usuario = useAuthStore((s) => s.usuario);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  // Carga proactiva de avisos de cambio de menú por fecha especial para el Administrador
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void ventasService
      .obtenerAlertasMenusEspeciales()
      .then((data) => {
        if (active) setAlertasMenus(data);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const alertaDestacada =
    alertasMenus.find((a) => a.requiereAtencion) ?? alertasMenus[0] ?? null;

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
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex items-center gap-2 text-slate-700">
              <Store className="h-5 w-5 text-brand-600" />
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
                <BellRing className="h-3.5 w-3.5 text-amber-700" />
                {alertasMenus.length} aviso(s) de menú
              </Link>
            )}
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700">
              {usuario?.rol.nombre}
            </span>
          </div>
        </header>

        {/* Aviso proactivo global de Menú por Fecha Especial (exclusivo Administrador) */}
        {isAdmin && alertaDestacada && !bannerDismissed && (
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
                onClick={() => setBannerDismissed(true)}
                className="rounded-lg p-1 text-slate-500 hover:bg-black/5"
                aria-label="Ocultar aviso"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Contenido principal */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
