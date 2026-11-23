import React from 'react';
import { Link } from 'react-router-dom';
import {
  BellRing,
  HelpCircle,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Store,
} from 'lucide-react';
import { env } from '../../../config/env';
import { useAuthStore } from '../../../store/auth.store';

interface NavbarProps {
  sidebarCollapsed: boolean;
  onToggleSidebarDesktop: () => void;
  onOpenSidebarMobile: () => void;
  alertasMenusCount: number;
  onOpenHelp: () => void;
}

/**
 * Barra superior (Navbar) separada del Sidebar para controlar de forma independiente
 * el colapso del menú lateral, los datos de sucursal, alertas rápidas y la guía de ayuda.
 */
export const Navbar: React.FC<NavbarProps> = ({
  sidebarCollapsed,
  onToggleSidebarDesktop,
  onOpenSidebarMobile,
  alertasMenusCount,
  onOpenHelp,
}) => {
  const usuario = useAuthStore((s) => s.usuario);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {/* Botón de menú para móvil/tablet */}
        <button
          type="button"
          onClick={onOpenSidebarMobile}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 lg:hidden"
          aria-label="Abrir menú lateral"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Menú</span>
        </button>

        {/* Botón para colapsar / expandir el Sidebar en escritorio y ampliar la vista principal */}
        <button
          type="button"
          onClick={onToggleSidebarDesktop}
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
          title={sidebarCollapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral para ampliar vista'}
          className="hidden h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 lg:inline-flex"
        >
          {sidebarCollapsed ? (
            <>
              <PanelLeftOpen className="h-4 w-4 text-brand-600" aria-hidden="true" />
              <span>Menú</span>
            </>
          ) : (
            <PanelLeftClose className="h-4 w-4 text-slate-600" aria-hidden="true" />
          )}
        </button>

        <div className="flex min-w-0 items-center gap-2 text-slate-700">
          <Store className="h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {usuario?.sucursal.nombre ?? env.APP_NAME}
            </p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              NIT: {usuario?.sucursal.nit} ·{' '}
              {env.ENABLE_TABLE_SERVICE ? 'Mostrador y mesas' : 'Servicio en mostrador'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isAdmin && alertasMenusCount > 0 && (
          <Link
            to="/menus-especiales"
            className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-200 md:inline-flex"
          >
            <BellRing className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
            {alertasMenusCount} aviso(s) de menú
          </Link>
        )}
        <button
          type="button"
          onClick={onOpenHelp}
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
  );
};
