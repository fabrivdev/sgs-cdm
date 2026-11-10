import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  canManageFleet,
  canSubmitInvoice,
} from "@/features/fleet/managementModel";
import InvoiceUpload from "@/features/fleet/InvoiceUpload";
import { ManagementWorkspace } from "@/features/fleet/ManagementWorkspace";
export { ManagementWorkspace } from "@/features/fleet/ManagementWorkspace";
export default function FleetWorkspace() {
  const auth = useAuth(),
    location = useLocation();
  const allowed = auth.hasSectionAccess("servicios.flota");
  if (!canSubmitInvoice(auth.roles, allowed))
    return <Navigate to="/sin-acceso" replace />;
  if (
    !canManageFleet(auth.roles, allowed) ||
    location.pathname.endsWith("/cargar-factura")
  )
    return <InvoiceUpload key={auth.user?.id} />;
  return <ManagementWorkspace />;
}
