import { cn } from "@/lib/utils";

export function PartsReportState({ loading, error, retry }: {
  loading?: boolean;
  error?: Error | null;
  retry?: () => void;
}) {
  return <div role={error ? "alert" : "status"} className={cn("py-10 text-center text-[12px]", error ? "text-destructive" : "text-muted-foreground")}>
    {error ? error.message : loading ? "Cargando ventas…" : "No hay ventas de Repuestos en el período."}
    {error && retry && <button type="button" onClick={retry} className="ml-3 rounded border px-2 py-1 text-foreground">Reintentar</button>}
  </div>;
}
