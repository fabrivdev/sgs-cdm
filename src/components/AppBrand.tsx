import { cn } from "@/lib/utils";

export const APP_SHORT_NAME = "SIG";
export const APP_NAME = "Sistema Integrado de Gestión";

export function AppLogo({ className }: { className?: string }) {
  return (
    <img
      src="/sig-cdm-logo.png"
      alt="Remolino CDM"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
