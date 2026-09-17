import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SalesColumn, SalesSort } from "./salesTableInteraction";

// The wrapper may be a th or a grid columnheader; this button keeps its axis.
export function SalesSortButton({ label, kind, align = "left", active, direction, onClick }: {
  label: string; kind: SalesColumn<unknown>["kind"]; align?: "left" | "center" | "right";
  active: boolean; direction: SalesSort["direction"]; onClick: () => void;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  const next = active && direction === "asc" ? "desc" : "asc";
  const action = kind === "text" ? next === "asc" ? "A a Z" : "Z a A"
    : kind === "date" ? next === "asc" ? "más antigua a más reciente" : "más reciente a más antigua"
      : next === "asc" ? "menor a mayor" : "mayor a menor";
  return <button type="button" onClick={onClick} aria-label={`Ordenar ${label}: ${action}`} title={`${label} · ${action}`}
    className={`flex w-full min-w-0 items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"}`}>
    <span className="truncate">{label}</span><Icon aria-hidden="true" className={`h-3 w-3 shrink-0 ${active ? "text-primary" : "opacity-50"}`} />
  </button>;
}

// Permission and complete-result readiness are explicit inputs. A paged caller
// must fetch/validate ALL filtered rows in onExport before saving a workbook.
export function SalesExportButton({ allowed, disabled, onExport }: { allowed: boolean; disabled: boolean; onExport: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!allowed) return null;
  const exportRows = async () => {
    if (disabled || busy) return;
    setBusy(true); setFailed(false);
    try { await onExport(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <div className="flex min-w-0 items-center gap-2">
    {failed && <span role="alert" className="truncate text-[11px] text-destructive" title="No se pudo exportar. Intentá nuevamente.">No se pudo exportar.</span>}
    <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[11px]" disabled={disabled || busy} onClick={() => void exportRows()} aria-label="Exportar tabla a Excel">
      {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Download aria-hidden="true" className="h-3.5 w-3.5" />} {busy ? "Exportando…" : "Exportar"}
    </Button>
  </div>;
}
