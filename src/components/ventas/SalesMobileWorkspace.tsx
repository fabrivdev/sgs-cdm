import { useState, type ReactNode } from "react";
import { CalendarDays, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { SalesMobileContext, useSalesMobile, type MobileView } from "./salesMobileContext";
import "./sales-mobile-workspace.css";

/** Presentation state only. Dates, financial sources and exports remain with each report. */
export function SalesMobileProvider({ children }: { children: ReactNode }) {
  const active = useIsMobile(640);
  const [view, setView] = useState<MobileView>("periodos");
  return <SalesMobileContext.Provider value={{ active, view, setView }}>{children}</SalesMobileContext.Provider>;
}
const shortDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
export function SalesMobileRange({ desde, hasta }: { desde: string; hasta: string }) {
  return <span className="sales-mobile-range"><CalendarDays aria-hidden="true" />{shortDate(desde)} — {shortDate(hasta)}</span>;
}

export function SalesMobileTabs({ selectedPeriod, desde, hasta, onClear }: {
  selectedPeriod: string | null; desde: string; hasta: string; onClear: () => void;
}) {
  const { active, view, setView } = useSalesMobile();
  if (!active) return null;
  return <div className="sales-mobile-navigation">
    <nav aria-label="Vistas de ventas" className="sales-mobile-tabs">
      {([["periodos", "Períodos"], ["resumen", "Resumen"], ["detalle", "Detalle"]] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={cn(view === key && "is-active")}>{label}</button>)}
    </nav>
    {selectedPeriod && <div className="sales-period-scope">
      <span>{shortDate(desde)} — {shortDate(hasta)}</span>
      <button type="button" onClick={onClear} aria-label="Ver período completo"><X className="h-3.5 w-3.5" /><span>Ver todo</span></button>
    </div>}
  </div>;
}

export function SalesMobileSummary({ billing, quantity, quantityLabel, quantityTitle, clients }: {
  billing: string; quantity: string; quantityLabel: string; quantityTitle?: string; clients: string;
}) {
  return <dl aria-label="Indicadores" className="sales-mobile-summary">
    <div><dt>Facturación</dt><dd>{billing}</dd></div>
    <div><dt title={quantityTitle}>{quantityLabel}</dt><dd>{quantity}</dd></div>
    <div><dt>Clientes</dt><dd>{clients}</dd></div>
  </dl>;
}

export function SalesMobileAverage({ label, value }: { label: string; value: string }) {
  const { active, view } = useSalesMobile();
  return active && view === "resumen" ? <dl className="sales-mobile-average"><dt>{label}</dt><dd>{value}</dd></dl> : null;
}
