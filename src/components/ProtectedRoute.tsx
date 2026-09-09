import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/lib/constants";
import type { SectionKey } from "@/lib/permissions";

interface Props {
  children: React.ReactNode;
  requireRoles?: Role[];
  /** Modulo requerido (independiente del nivel/rol), ej. "servicios" | "repuestos". */
  requireModulo?: string;
  requireSection?: SectionKey;
  requireAnySections?: SectionKey[];
}

export function ProtectedRoute({ children, requireRoles, requireModulo, requireSection, requireAnySections }: Props) {
  const { user, roles, isSuperAdmin, hasModuloAccess, hasSectionAccess, loading, defaultRoute } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (requireRoles && !isSuperAdmin && !requireRoles.some((r) => roles.includes(r))) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (requireModulo && !hasModuloAccess(requireModulo)) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (requireSection && !hasSectionAccess(requireSection)) {
    return <Navigate to={defaultRoute} replace />;
  }

  if (requireAnySections?.length && !requireAnySections.some(hasSectionAccess)) {
    return <Navigate to={defaultRoute} replace />;
  }

  return <>{children}</>;
}
