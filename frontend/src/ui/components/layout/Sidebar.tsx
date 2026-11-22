import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  UtensilsCrossed,
  FileText,
  Package,
  Trash2,
  Wallet,
  BarChart3,
  ShieldCheck,
  Users,
  CalendarClock,
  LogOut,
  X,
  ChefHat,
} from 'lucide-react';
import { env } from '../../../config/env';
import { useAuthStore } from '../../../store/auth.store';

interface NavItem {
  to: string;
  label: string;
  hint: string;
  permiso: string;
  adminOnly?: boolean;
  Icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Atención y Ventas',
    items: [
      { to: '/ventas', label: 'Menú / Ventas', hint: 'Tomar pedidos y cobrar', permiso: 'ventas:ver', Icon: UtensilsCrossed },
      { to: '/caja', label: 'Caja', hint: 'Abrir turno y cuadrar', permiso: 'caja:ver', Icon: Wallet },
      { to: '/facturas', label: 'Facturas', hint: 'Buscar, reimprimir y anular', permiso: 'facturas:ver', Icon: FileText },
    ],
  },
  {
    title: 'Cocina e Inventario',
    items: [
      { to: '/inventario', label: 'Inventario', hint: 'Compras, stock y recetas', permiso: 'inventario:ver', Icon: Package },
      { to: '/mermas', label: 'Mermas', hint: 'Registrar desperdicios', permiso: 'mermas:ver', Icon: Trash2 },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        to: '/menus-especiales',
        label: 'Menús Especiales',
        hint: 'Promociones por fecha',
        permiso: 'ventas:gestionar_menu',
        adminOnly: true,
        Icon: CalendarClock,
      },
      { to: '/reportes', label: 'Reportes', hint: 'Ventas, ganancias y PDF', permiso: 'reportes:ver', Icon: BarChart3 },
      { to: '/auditoria', label: 'Auditoría', hint: 'Historial de cambios', permiso: 'auditoria:ver', Icon: ShieldCheck },
      { to: '/accesos', label: 'Usuarios y Roles', hint: 'Crear personal y permisos', permiso: 'accesos:ver', adminOnly: true, Icon: Users },
    ],
  },
];

interface SidebarProps {
  openMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ openMobile, onCloseMobile }) => {
  const { usuario, can, isAdmin, logout } = useAuthStore();

  // Filtra estrictamente cada grupo y vista según el rol y permisos efectivos
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.adminOnly && !isAdmin()) return false;
      return can(item.permiso);
    }),
  })).filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    await logout();
  };

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Encabezado marca (siempre fijo arriba) */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/40">
            <ChefHat className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-extrabold leading-tight text-white">
              {env.APP_NAME}
            </h1>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
              {usuario?.sucursal.codigo ?? 'POS GT'} · Sistema POS
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navegación agrupada por contexto operativo (scroll interno solo si no cabe en pantallas bajas) */}
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map(({ to, label, hint, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `group flex min-h-[50px] items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-950/50'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="h-5 w-5 shrink-0 opacity-90" />
                      <div className="min-w-0">
                        <span className="block truncate leading-tight">{label}</span>
                        <span
                          className={`block truncate text-[11px] font-normal ${
                            isActive ? 'text-white/85' : 'text-slate-400 group-hover:text-slate-300'
                          }`}
                        >
                          {hint}
                        </span>
                      </div>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Pie de sesión (siempre fijo abajo en pantalla) */}
      <div className="shrink-0 border-t border-slate-800/80 bg-slate-950 p-3.5">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5 ring-1 ring-slate-800">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/20 text-sm font-extrabold text-brand-400">
            {(usuario?.nombreCompleto ?? 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{usuario?.nombreCompleto}</p>
            <p className="text-xs font-medium text-brand-300">{usuario?.rol.nombre}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 supports-[height:100dvh]:h-dvh lg:block">
        {sidebarContent}
      </aside>

      {openMobile && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCloseMobile} />
          <aside className="relative z-50 h-screen w-72 max-w-[85vw] supports-[height:100dvh]:h-dvh">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
