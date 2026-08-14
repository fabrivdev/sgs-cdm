import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ErrorState({
  title = "Error al cargar datos",
  description = "Ocurrió un error al conectar con el servidor.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-4 py-8 text-center", className)}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="text-[13px] font-semibold">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[12px] text-muted-foreground">{description}</div>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
