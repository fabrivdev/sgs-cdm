import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/lib/constants";

interface Props {
  children: React.ReactNode;
  requireRoles?: Role[];
  /** Modulo requerido (independiente del nivel/rol), ej. "servicios" | "repuestos". */
  requireModulo?: string;
}

export function ProtectedRoute({ children, requireRoles, requireModulo }: Props) {
  const { user, roles, hasModuloAccess, loading, defaultRoute } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (requireRoles && !requireRoles.some((r) => roles.includes(r))) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (requireModulo && !hasModuloAccess(requireModulo)) {
    return <Navigate to={defaultRoute} replace />;
  }

  return <>{children}</>;
}
