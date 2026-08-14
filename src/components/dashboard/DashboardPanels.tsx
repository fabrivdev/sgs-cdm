import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock3, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeekRow, Facturacion, FactMetric, OSMetric, PeriodMode } from "./types";
import { money, concept, formatWeekMetric } from "./utils";

export function FactPeriodsMobile({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: WeekRow[];
  selectedKey?: string;
  onSelect: (key: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(-5);

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground md:hidden">Sin facturacion.</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 md:hidden">
      {visible.map((row) => {
        const active = row.key === selectedKey;
        const trend = row.variacion;
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => onSelect(row.key)}
            className={cn(
              "w-full rounded-md border bg-background p-2 text-left shadow-sm",
              active && "border-primary bg-primary/5",
            )}
          >
            <div className="flex min-h-[52px] flex-col justify-between gap-1">
              <div className="text-[11px] font-medium">{row.label}</div>
              <div className="text-[13px] font-semibold tabular-nums">{formatWeekMetric(row, "usd")}</div>
              <div className={cn("text-[10px] tabular-nums", trend != null && trend < 0 ? "text-destructive" : "text-muted-foreground")}>

                {trend == null ? "-" : `${trend > 0 ? "+" : ""}${trend}%`}
              </div>
            </div>
          </button>
        );
      })}
      {rows.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="col-span-2 w-full rounded-md border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}

export function FacturasMobile({
  rows,
  visibleRows,
}: {
  rows: Facturacion[];
  visibleRows: Facturacion[];
}) {
  const [expanded, setExpanded] = useState(false);
  const source = expanded ? visibleRows : visibleRows.slice(0, 5);

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground md:hidden">Sin facturacion en el periodo.</div>;
  }

  return (
    <div className="space-y-1.5 md:hidden">
      {source.map((row, index) => (
        <div key={`${row.cod_factura}-${index}`} className="rounded-md border bg-background px-2.5 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{row.entidad_nombre || "Sin cliente"}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{row.cod_factura}</div>
            </div>
            <div className="shrink-0 text-right text-[13px] font-bold tabular-nums">{money(Number(row.total_venta || 0))}</div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>{format(parseISO(row.fecha), "dd/MM")}</span>
            <span>{concept(row)}</span>
            <span>{row.sucursal ?? "-"}</span>
            <span>{row.tipo_tiempo ?? "-"}</span>
          </div>
        </div>
      ))}
      {visibleRows.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-md border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${visibleRows.length})`}
        </button>
      )}
    </div>
  );
}

export function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/45 px-2 py-1">
      <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function PanelTitle({ icon: Icon, title }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
      <h2 className="truncate text-[13px] font-semibold leading-5">{title}</h2>
      <div className="shrink-0 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}


export function ConceptLine({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total > 0 ? Math.max(3, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{money(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function PeriodSelector({
  value,
  onChange,
  disabledModes,
}: {
  value: PeriodMode;
  onChange: (value: PeriodMode) => void;
  disabledModes?: Set<PeriodMode>;
}) {
  return (
    <div data-filter-field className="flex min-w-0 shrink-0 flex-col gap-0.5 max-sm:!w-full sm:w-[200px]">
      <span className="block h-3.5 truncate whitespace-nowrap text-[10px] font-medium uppercase leading-3.5 tracking-[0.04em] text-muted-foreground">Agrupar por</span>
      <div className="grid h-8 grid-cols-4 overflow-hidden rounded-md border bg-background text-[12px]">


        {[
          { value: "dia", label: "Día" },
          { value: "semana", label: "Semana" },
          { value: "mes", label: "Mes" },
          { value: "anio", label: "Año" },
        ].map((option) => {
          const disabled = disabledModes?.has(option.value as PeriodMode) ?? false;
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(option.value as PeriodMode)}
              className={cn(
                "border-r px-2 last:border-r-0",
                disabled && "cursor-not-allowed opacity-40",
                !disabled && "hover:bg-accent",
                active && !disabled && "bg-primary text-primary-foreground hover:bg-primary",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FactMetricSwitch({ value, onChange }: { value: FactMetric; onChange: (value: FactMetric) => void }) {
  const options: Array<{ value: FactMetric; label: string; icon?: React.ElementType }> = [
    { value: "usd", label: "$" },
    { value: "horasServicio", label: "Hs", icon: Clock3 },
    { value: "kmFacturados", label: "Km", icon: Truck },
  ];
  return (
    <div className="grid h-8 w-full grid-cols-3 overflow-hidden rounded-md border bg-background text-[11px] sm:w-auto sm:min-w-[190px]">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            title={option.value === "usd" ? "Facturacion" : option.value === "horasServicio" ? "Horas de servicio facturadas" : "Kilometros facturados"}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 border-r px-2 last:border-r-0 hover:bg-accent",
              value === option.value && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="font-semibold">{option.label}</span>}
            <span>{option.value === "usd" ? "Usd" : option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OSMetricSwitch({ value, onChange }: { value: OSMetric; onChange: (value: OSMetric) => void }) {
  const options: Array<{ value: OSMetric; label: string; icon?: React.ElementType }> = [
    { value: "usd", label: "$" },
    { value: "horas", label: "Hs", icon: Clock3 },
    { value: "km", label: "Km", icon: Truck },
  ];
  return (
    <div className="grid h-8 w-full grid-cols-3 overflow-hidden rounded-md border bg-background text-[11px] sm:w-auto sm:min-w-[176px]">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 border-r px-2 last:border-r-0 hover:bg-accent",
              value === option.value && "bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <span className="font-semibold">{option.label}</span>}
            <span>{option.value === "usd" ? "Usd" : option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
