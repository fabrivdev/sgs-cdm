import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ESTADO_LABELS, type Estado } from "@/lib/constants";
import { machineBrandClass, machineBrandStyle, visibleMachineBrand } from "@/lib/machineBrands";
import { ESTADOS_TRABAJO, type EstadoTrabajo } from "@/lib/trabajos";

export function EstadoBadge({ estado, className }: { estado: Estado; className?: string }) {
  const map: Record<Estado, string> = {
    Pendiente: "bg-estado-pendiente-bg text-estado-pendiente border-estado-pendiente/30",
    Completado: "bg-estado-completado-bg text-estado-completado border-estado-completado/30",
    Cancelada: "bg-muted text-muted-foreground border-border line-through",
  };
  return <Badge variant="outline" className={cn("font-medium", map[estado], className)}>{ESTADO_LABELS[estado]}</Badge>;
}

export function MarcaBadge({ marca, className }: { marca: string | null | undefined; className?: string }) {
  return <Badge variant="outline" title={visibleMachineBrand(marca)} style={machineBrandStyle(marca)} className={cn("max-w-full font-medium tracking-wide", machineBrandClass(marca), className)}><span className="truncate">{visibleMachineBrand(marca)}</span></Badge>;
}

const TRABAJO_ESTADO_STYLES: Record<EstadoTrabajo, string> = {
  pendiente: "bg-amber-50 text-amber-800 border-amber-200",
  programado: "bg-blue-50 text-blue-800 border-blue-200",
  iniciado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pausado: "bg-orange-100 text-orange-800 border-orange-200",
  completado: "bg-green-50 text-green-800 border-green-200",
};

export function TrabajoEstadoBadge({ estado, className }: { estado: EstadoTrabajo; className?: string }) {
  const label = ESTADOS_TRABAJO.find((e) => e.key === estado)?.label ?? estado;
  return (
    <Badge variant="outline" className={cn("font-medium", TRABAJO_ESTADO_STYLES[estado], className)}>
      {label}
    </Badge>
  );
}

export function rowClassByEstado(estado: Estado): string {
  if (estado === "Completado") return "row-completado";
  if (estado === "Cancelada") return "row-pendiente opacity-60";
  return "row-pendiente";
}
