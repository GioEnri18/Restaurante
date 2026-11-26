import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { env, ROLES_ECONOMIA } from './config/env';
import { MainLayout } from './ui/components/layout/MainLayout';
import { ProtectedRoute } from './ui/components/layout/ProtectedRoute';

import { LoginPage } from './ui/pages/LoginPage';

const VentasPage = lazy(() => import('./ui/pages/VentasPage').then((m) => ({ default: m.VentasPage })));
const FacturasPage = lazy(() => import('./ui/pages/FacturasPage').then((m) => ({ default: m.FacturasPage })));
const InventarioPage = lazy(() => import('./ui/pages/InventarioPage').then((m) => ({ default: m.InventarioPage })));
const MermasPage = lazy(() => import('./ui/pages/MermasPage').then((m) => ({ default: m.MermasPage })));
const CajaPage = lazy(() => import('./ui/pages/CajaPage').then((m) => ({ default: m.CajaPage })));
const ReportesPage = lazy(() => import('./ui/pages/ReportesPage').then((m) => ({ default: m.ReportesPage })));
const AuditoriaPage = lazy(() => import('./ui/pages/AuditoriaPage').then((m) => ({ default: m.AuditoriaPage })));
const EconomiaPage = lazy(() => import('./ui/pages/EconomiaPage').then((m) => ({ default: m.EconomiaPage })));
const AccesosPage = lazy(() => import('./ui/pages/AccesosPage').then((m) => ({ default: m.AccesosPage })));
const MenusEspecialesPage = lazy(() => import('./ui/pages/MenusEspecialesPage').then((m) => ({ default: m.MenusEspecialesPage })));
const DomiciliosPage = lazy(() => import('./ui/pages/DomiciliosPage').then((m) => ({ default: m.DomiciliosPage })));
const PedirPublicoPage = lazy(() => import('./ui/pages/PedirPublicoPage').then((m) => ({ default: m.PedirPublicoPage })));

export const App: React.FC = () => {
  const { hydrate, clearSession, usuario, can } = useAuthStore();
  const puedeVerEconomia = Boolean(usuario && ROLES_ECONOMIA.includes(usuario.rol.codigo) && can('reportes:balance'));

  useEffect(() => {
    void hydrate();

    const onUnauthorized = () => clearSession();
    window.addEventListener('pos:unauthorized', onUnauthorized);
    return () => window.removeEventListener('pos:unauthorized', onUnauthorized);
  }, [hydrate, clearSession]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 1. Login */}
        <Route path="/login" element={<LoginPage />} />

        {/* 1b. Menú público de pedidos en línea para clientes (sin login) */}
        {env.ENABLE_DELIVERY && (
          <>
            <Route
              path="/pedir"
              element={
                <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando menú...</div>}>
                  <PedirPublicoPage />
                </Suspense>
              }
            />
            <Route
              path="/pedir/seguimiento/:token"
              element={
                <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando seguimiento...</div>}>
                  <PedirPublicoPage />
                </Suspense>
              }
            />
            <Route
              path="/pedir/:codigoSucursal"
              element={
                <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Cargando menú...</div>}>
                  <PedirPublicoPage />
                </Suspense>
              }
            />
          </>
        )}

        {/* Shell principal con navegación lateral filtrada por permisos */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to={usuario?.rol.vistaInicial || '/ventas'} replace />} />

          {/* 2. Menú / Ventas */}
          <Route
            path="ventas"
            element={
              <ProtectedRoute permiso="ventas:ver">
                <VentasPage />
              </ProtectedRoute>
            }
          />

          {/* 2b. Servicio a Domicilio (solo si VITE_ENABLE_DELIVERY=true) */}
          {env.ENABLE_DELIVERY && (
            <Route
              path="domicilios"
              element={
                <ProtectedRoute permisoAlguno={['domicilios:ver', 'domicilios:ver_propios']}>
                  <DomiciliosPage />
                </ProtectedRoute>
              }
            />
          )}

          {/* 3. Facturas */}
          <Route
            path="facturas"
            element={
              <ProtectedRoute permiso="facturas:ver">
                <FacturasPage />
              </ProtectedRoute>
            }
          />

          {/* 4. Inventario */}
          <Route
            path="inventario"
            element={
              <ProtectedRoute permiso="inventario:ver">
                <InventarioPage />
              </ProtectedRoute>
            }
          />

          {/* 5. Mermas */}
          <Route
            path="mermas"
            element={
              <ProtectedRoute permiso="mermas:ver">
                <MermasPage />
              </ProtectedRoute>
            }
          />

          {/* 6. Caja */}
          <Route
            path="caja"
            element={
              <ProtectedRoute permiso="caja:ver">
                <CajaPage />
              </ProtectedRoute>
            }
          />

          {/* 7. Reportes */}
          <Route
            path="reportes"
            element={
              <ProtectedRoute permiso="reportes:ver">
                <ReportesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="economia"
            element={
              <ProtectedRoute permiso="reportes:balance" rolesPermitidos={ROLES_ECONOMIA}>
                <EconomiaPage />
              </ProtectedRoute>
            }
          />

          {/* 8. Auditoría de sistema */}
          <Route
            path="auditoria"
            element={
              !(can('auditoria:sistema') && can('auditoria:ver')) && puedeVerEconomia
                ? <Navigate to="/economia" replace />
                : <ProtectedRoute permiso={['auditoria:ver', 'auditoria:sistema']}><AuditoriaPage /></ProtectedRoute>
            }
          />

          {/* 9. Accesos (EXCLUSIVA DEL ADMINISTRADOR) */}
          <Route
            path="accesos"
            element={
              <ProtectedRoute permiso="accesos:ver" adminOnly>
                <AccesosPage />
              </ProtectedRoute>
            }
          />

          {/* Menús Especiales por Fecha (EXCLUSIVA DEL ADMINISTRADOR) */}
          <Route
            path="menus-especiales"
            element={
              <ProtectedRoute permiso="ventas:gestionar_menu" adminOnly>
                <MenusEspecialesPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
