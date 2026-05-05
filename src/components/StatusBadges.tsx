import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Estado, Marca } from "@/lib/constants";

export function EstadoBadge({ estado, className }: { estado: Estado; className?: string }) {
  const map: Record<Estado, string> = {
    Pendiente: "bg-estado-pendiente-bg text-estado-pendiente border-estado-pendiente/30",
    Iniciado: "bg-estado-iniciado-bg text-estado-iniciado border-estado-iniciado/30",
    Completado: "bg-estado-completado-bg text-estado-completado border-estado-completado/30",
  };
  return <Badge variant="outline" className={cn("font-medium", map[estado], className)}>{estado}</Badge>;
}

export function MarcaBadge({ marca, className }: { marca: Marca; className?: string }) {
  const map: Record<Marca, string> = {
    CLAAS: "bg-marca-claas-bg text-marca-claas border-marca-claas/30",
    HORSCH: "bg-marca-horsch-bg text-marca-horsch border-marca-horsch/30",
    OTROS: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={cn("font-bold tracking-wide", map[marca], className)}>{marca}</Badge>;
}

export function rowClassByEstado(estado: Estado): string {
  if (estado === "Completado") return "row-completado";
  if (estado === "Iniciado") return "row-iniciado";
  return "row-pendiente";
}
