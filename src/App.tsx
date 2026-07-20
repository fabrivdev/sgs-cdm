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
const Auth = lazy(() => import("./pages/Auth"));
const Planificador = lazy(() => import("./pages/Planificador"));
const Calendario = lazy(() => import("./pages/Calendario"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Historial = lazy(() => import("./pages/Historial"));
const ParqueClientes = lazy(() => import("./pages/ParqueClientes"));
const Agenda = lazy(() => import("./pages/Agenda"));
const Trabajos = lazy(() => import("./pages/Trabajos"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Cargando vista...</div>}>
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
                <Route path="/" element={<Planificador />} />
                <Route path="/trabajos" element={<Trabajos />} />
                <Route path="/calendario" element={<Calendario />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute requireRoles={["admin"]}>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/historial" element={<Historial />} />
                <Route
                  path="/parque-clientes"
                  element={
                    <ProtectedRoute requireRoles={["admin"]}>
                      <ParqueClientes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agenda"
                  element={
                    <ProtectedRoute requireRoles={["admin"]}>
                      <Agenda />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireRoles={["admin"]}>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
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
