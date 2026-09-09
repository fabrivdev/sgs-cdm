import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AssistantPageProvider } from "@/contexts/AssistantPageContext";
import { LoadingScreen } from "@/components/LoadingScreen";
import { OfflineExperience } from "@/components/offline/OfflineExperience";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
const Auth = lazy(() => import("./pages/Auth"));
const Planificador = lazy(() => import("./pages/Planificador"));
const Calendario = lazy(() => import("./pages/Calendario"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Comisiones = lazy(() => import("./pages/Comisiones"));
const ParqueClientes = lazy(() => import("./pages/ParqueClientes"));
const MaquinariaOperaciones = lazy(() => import("./pages/MaquinariaOperaciones"));
const Trabajos = lazy(() => import("./pages/Trabajos"));
const Repuestos = lazy(() => import("./pages/Repuestos"));
const RepuestosCompras = lazy(() => import("./pages/RepuestosCompras"));
const RepuestosSugerencias = lazy(() => import("./pages/RepuestosSugerencias"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SinAcceso = lazy(() => import("./pages/SinAcceso"));

const queryClient = new QueryClient();

function OfflineGuard() {
  const online = useOnlineStatus();
  const previewOffline = import.meta.env.DEV && new URLSearchParams(window.location.search).has("offline-preview");
  return online && !previewOffline ? null : <OfflineExperience />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OfflineGuard />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AssistantPageProvider>
                      <AppLayout />
                    </AssistantPageProvider>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<ProtectedRoute requireModulo="servicios" requireSection="servicios.planificador"><Planificador /></ProtectedRoute>} />
                <Route path="/trabajos" element={<ProtectedRoute requireModulo="servicios" requireSection="servicios.trabajos"><Trabajos /></ProtectedRoute>} />
                <Route path="/calendario" element={<ProtectedRoute requireModulo="servicios" requireSection="servicios.calendario"><Calendario /></ProtectedRoute>} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute requireRoles={["admin", "gerencia"]} requireModulo="servicios" requireSection="servicios.dashboard">
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/comisiones"
                  element={
                    <ProtectedRoute requireRoles={["admin"]} requireModulo="servicios" requireSection="servicios.comisiones">
                      <Comisiones />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/parque-clientes"
                  element={
                    <ProtectedRoute requireModulo="parque" requireSection="parque.clientes">
                      <ParqueClientes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/parque-maquinas"
                  element={
                    <ProtectedRoute requireModulo="parque" requireSection="parque.maquinas">
                      <ParqueClientes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/parque-stock"
                  element={
                    <ProtectedRoute requireModulo="parque" requireSection="parque.stock">
                      <ParqueClientes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/parque-operaciones"
                  element={
                    <ProtectedRoute requireModulo="parque" requireSection="parque.operaciones">
                      <MaquinariaOperaciones />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/parque-importaciones"
                  element={
                    <ProtectedRoute requireModulo="parque" requireSection="parque.importaciones">
                      <MaquinariaOperaciones />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/repuestos"
                  element={
                    <ProtectedRoute requireModulo="repuestos" requireSection="repuestos.stock">
                      <Repuestos />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/repuestos/compras"
                  element={
                    <ProtectedRoute requireModulo="repuestos" requireSection="repuestos.compras">
                      <RepuestosCompras />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireRoles={["admin"]} requireAnySections={["admin.usuarios", "admin.importaciones", "admin.parametros"]}>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/repuestos/sugerencias"
                  element={
                    <ProtectedRoute requireModulo="repuestos" requireSection="repuestos.sugerencias">
                      <RepuestosSugerencias />
                    </ProtectedRoute>
                  }
                />
                <Route path="/sin-acceso" element={<SinAcceso />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
