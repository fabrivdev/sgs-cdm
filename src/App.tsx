import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Planificador from "./pages/Planificador";
import Calendario from "./pages/Calendario";
import Dashboard from "./pages/Dashboard";
import Historial from "./pages/Historial";
import ParqueClientes from "./pages/ParqueClientes";
import Trabajos from "./pages/Trabajos";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Planificador />} />
              <Route path="/trabajos" element={<Trabajos />} />
              <Route path="/calendario" element={<Calendario />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute requireRoles={["admin", "tecnico"]}>
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
