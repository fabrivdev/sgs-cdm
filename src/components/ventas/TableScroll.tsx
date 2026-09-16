import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Listas de ventas: mismo comportamiento en todas las secciones. */
export const SCROLL_THRESHOLD = 20;
export const scrollHead = "sticky top-0 z-10";
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

export function TableScroll({ rows, children, className }: { rows: number; children: ReactNode; className?: string }) {
  const scrolls = rows > SCROLL_THRESHOLD;
  return <div className={cn(scrolls && "max-h-[56vh] overflow-y-auto [scrollbar-gutter:stable] md:max-h-[480px]", className)}>{children}</div>;
}

export function RowCount({ rows, loaded, label = "registros", className }: { rows: number; loaded?: number; label?: string; className?: string }) {
  const partial = loaded != null && loaded < rows;
  return <div className={cn("flex h-7 items-center justify-end border-t px-3 text-[11px] text-muted-foreground", className)}>
    {partial ? `${integer.format(loaded)} de ${integer.format(rows)} ${label}` : `${integer.format(rows)} ${label}`}
  </div>;
}
