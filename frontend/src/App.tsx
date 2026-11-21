import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import { MainLayout } from './ui/components/layout/MainLayout';
import { ProtectedRoute } from './ui/components/layout/ProtectedRoute';

// Las 9 vistas obligatorias
import { LoginPage } from './ui/pages/LoginPage';
import { VentasPage } from './ui/pages/VentasPage';
import { FacturasPage } from './ui/pages/FacturasPage';
import { InventarioPage } from './ui/pages/InventarioPage';
import { MermasPage } from './ui/pages/MermasPage';
import { CajaPage } from './ui/pages/CajaPage';
import { ReportesPage } from './ui/pages/ReportesPage';
import { AuditoriaPage } from './ui/pages/AuditoriaPage';
import { AccesosPage } from './ui/pages/AccesosPage';
import { MenusEspecialesPage } from './ui/pages/MenusEspecialesPage';

export const App: React.FC = () => {
  const { hydrate, clearSession, usuario } = useAuthStore();

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

          {/* 8. Auditoría */}
          <Route
            path="auditoria"
            element={
              <ProtectedRoute permiso="auditoria:ver">
                <AuditoriaPage />
              </ProtectedRoute>
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
