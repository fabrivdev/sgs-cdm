import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The same bordered, compact surface used by the existing operational lists. */
export function OperationsPanel({ title, actions, children, padded = false }: { title?: string; actions?: ReactNode; children: ReactNode; padded?: boolean }) {
  return <section className="min-w-0 overflow-hidden rounded-xl border bg-card max-sm:rounded-none max-sm:border-x-0">
    {(title || actions) && <div className="flex min-h-10 items-center justify-between gap-2 border-b px-3 py-2">
      {title && <h2 className="min-w-0 text-[12px] font-semibold">{title}</h2>}{actions}
    </div>}
    <div className={cn("min-w-0", padded && "p-3")}>{children}</div>
  </section>;
}

export function OperationsStatus({ value }: { value: string }) {
  const positive = /^(cerrada|realizada|completado|completada)$/i.test(value);
  const warning = /^(abierta|pendiente|programado)$/i.test(value);
  return <Badge variant="outline" className={cn("max-w-full whitespace-nowrap font-normal",
    positive && "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning && "border-amber-200 bg-amber-50 text-amber-700",
    !positive && !warning && "bg-muted/40 text-muted-foreground")}>{value || "—"}</Badge>;
}

