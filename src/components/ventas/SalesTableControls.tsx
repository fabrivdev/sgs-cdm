import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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
