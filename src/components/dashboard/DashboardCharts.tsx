import { useEffect, useMemo, useRef, useState } from "react";
import { format, getDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Building2, CalendarDays, Clock3, FileText, Printer, Receipt, Route, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardLabel, filterLabel, metaText, tableHeadText } from "@/lib/ui-classes";
import type { Marca, Sucursal } from "@/lib/constants";
import type { WeekRow, OSImpactRow, OSRubro, FactMetric, OSMetric, PeriodMode, Facturacion, ServiciosDashboardData } from "./types";
import {
  money,
  pct,
  formatWeekMetric,
  formatFactMetric,
  concept,
  factMetricLabel,
  formatOSMetric,
  osMetricValue,
  weekMetric,
  comparisonWeekMetric,
  metricUnavailable,
  summarizeOSImpact,
} from "./utils";

const MAX_VISIBLE_BAR_COLUMNS = 12;

function barGridStyle(count: number, minColumnPx = 58) {
  const columns = Math.max(count, 1);
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    width: columns > MAX_VISIBLE_BAR_COLUMNS ? `${(columns / MAX_VISIBLE_BAR_COLUMNS) * 100}%` : "100%",
    minWidth: columns > MAX_VISIBLE_BAR_COLUMNS ? `${columns * minColumnPx}px` : "100%",
  };
}

export function OSImpactSection({
  loading,
  evolutionRows,
  activeKey,
  metric,
  selectedSummary,
  accumulatedSummary,
  sucursalRows,
  detailRows,
  detailMode,
  selectedRubros,
  comparisonLabel,
  onSelectPeriod,
  onSelectSucursal,
  onSelectRubro,
  onClearRubros,
  onDetailModeChange,
  onSelectOS,
}: {
  loading: boolean;
  evolutionRows: ReturnType<typeof summarizeOSImpact>[];
  activeKey?: string;
  metric: OSMetric;
  selectedSummary: ReturnType<typeof summarizeOSImpact>;
  accumulatedSummary: ReturnType<typeof summarizeOSImpact>;
  sucursalRows: Array<{ sucursal: Sucursal; rows: number; total: number; horas: number; km: number; previousTotal: number }>;
  detailRows: OSImpactRow[];
  detailMode: "os" | "cliente";
  selectedRubros: OSRubro[];
  comparisonLabel?: string;
  onSelectPeriod: (key: string) => void;
  onSelectSucursal: (sucursal: Sucursal) => void;
  onSelectRubro: (rubro: OSRubro) => void;
  onClearRubros: () => void;
  onDetailModeChange: (mode: "os" | "cliente") => void;
  onSelectOS: (os: string) => void;
}) {
  if (loading) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Cargando detalle OS...</div>;
  }
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <div className="min-w-0 space-y-3">
        <OSImpactKpis summary={selectedSummary} accumulatedSummary={accumulatedSummary} metric={metric} />
        <OSEvolution rows={evolutionRows} activeKey={activeKey} metric={metric} onSelect={onSelectPeriod} />
        <OSMix summary={selectedSummary} selectedRubros={selectedRubros} onSelect={onSelectRubro} onClear={onClearRubros} />
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-1">
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold">OS por sucursal</div>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <OSSucursalBars rows={sucursalRows} totalValue={selectedSummary.total} metric={metric} comparisonLabel={comparisonLabel} onSelect={onSelectSucursal} />
        </div>
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold">{detailMode === "os" ? "Detalle por OS" : "Detalle por cliente"}</div>
            <div className="flex items-center gap-2">
              <div className="grid h-7 grid-cols-2 overflow-hidden rounded-md border text-[10px]">
                <button
                  type="button"
                  onClick={() => onDetailModeChange("os")}
                  className={cn("px-2 hover:bg-accent", detailMode === "os" && "bg-primary text-primary-foreground hover:bg-primary")}
                >
                  OS
                </button>
                <button
                  type="button"
                  onClick={() => onDetailModeChange("cliente")}
                  className={cn("border-l px-2 hover:bg-accent", detailMode === "cliente" && "bg-primary text-primary-foreground hover:bg-primary")}
                >
                  Cliente
                </button>
              </div>
              <Receipt className="h-4 w-4 text-primary" />
            </div>
          </div>
          <OSDetalle rows={detailRows} metric={metric} mode={detailMode} onSelect={onSelectOS} />
        </div>
      </div>
    </div>
  );
}

function OSImpactKpis({
  summary,
  accumulatedSummary,
  metric,
}: {
  summary: ReturnType<typeof summarizeOSImpact>;
  accumulatedSummary: ReturnType<typeof summarizeOSImpact>;
  metric: OSMetric;
}) {
  const selectedValue = osMetricValue(summary, metric);
  const accumulatedValue = osMetricValue(accumulatedSummary, metric);
  const accumulatedRange = accumulatedSummary.osCount > 0
    ? `${format(accumulatedSummary.start, "dd/MM/yyyy")} - ${format(accumulatedSummary.end, "dd/MM/yyyy")}`
    : "Sin acumulado visible";
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-md border bg-primary/5 px-3 py-2">
          <div className={cardLabel}>Impacto OS</div>
          <div className="mt-1 text-[18px] font-bold tabular-nums">{formatOSMetric(selectedValue, metric)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{summary.osCount} OS cerradas</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className={cardLabel}>Servicio</div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums">{money(summary.servicios)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formatOSMetric(summary.horas, "horas")}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className={cardLabel}>Kilometraje</div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums">{money(summary.kilometraje)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formatOSMetric(summary.km, "km")}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className={cardLabel}>Repuestos</div>
          <div className="mt-1 text-[18px] font-semibold tabular-nums">{money(summary.repuestos)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">incluido en impacto OS</div>
        </div>
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className={cardLabel}>Acumulado visible</div>
            <div className="text-[11px] text-muted-foreground">{accumulatedRange}</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-[18px] font-bold tabular-nums">{formatOSMetric(accumulatedValue, metric)}</div>
            <div className="text-[11px] text-muted-foreground">
              {accumulatedSummary.osCount} OS · {formatOSMetric(accumulatedSummary.horas, "horas")} · {formatOSMetric(accumulatedSummary.km, "km")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OSEvolution({
  rows,
  activeKey,
  metric,
  onSelect,
}: {
  rows: ReturnType<typeof summarizeOSImpact>[];
  activeKey?: string;
  metric: OSMetric;
  onSelect: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => osMetricValue(row, metric)));
  const labelEvery = rows.length > 14 ? Math.ceil(rows.length / 6) : rows.length > 9 ? 2 : 1;
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin OS absorbidas.</div>;
  }
  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-1">
      <div
        className="grid min-h-[150px] shrink-0 items-end gap-1 border-b px-0.5 pt-2 sm:min-h-[160px] sm:gap-3 sm:px-2 sm:pt-3"
        style={barGridStyle(rows.length)}
      >
        {rows.map((row, index) => {
          const value = osMetricValue(row, metric);
          const height = value <= 0 ? 0 : Math.max(6, Math.round((value / max) * 130));
          const active = row.key === activeKey;
          const showLabel = index === 0 || index === rows.length - 1 || index % labelEvery === 0;
          return (
            <button key={row.key} type="button" onClick={() => onSelect(row.key)} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <span className="max-w-full truncate text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">{formatOSMetric(value, metric)}</span>
              <span className="flex h-[108px] w-full items-end justify-center sm:h-[124px]">
                <span
                  className={cn("w-full max-w-[34px] rounded-t-md bg-primary/80 transition-all hover:bg-primary sm:max-w-[42px]", active && "bg-primary ring-2 ring-primary/20")}
                  style={{ height }}
                />
              </span>
              <span className="min-h-7 max-w-full truncate text-[9px] leading-3 text-muted-foreground sm:text-[10px]">{showLabel ? row.label : ""}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
        {metric === "usd" ? "Impacto absorbido ($)" : metric === "horas" ? "Horas OS" : "Km OS"}
      </div>
    </div>
  );
}

function OSMix({
  summary,
  selectedRubros,
  onSelect,
  onClear,
}: {
  summary: ReturnType<typeof summarizeOSImpact>;
  selectedRubros: OSRubro[];
  onSelect: (rubro: OSRubro) => void;
  onClear: () => void;
}) {
  const total = summary.total || 1;
  const items: Array<{ label: string; filter: OSRubro; value: number; bar: string; dot: string }> = [
    { label: "Repuestos", filter: "Repuestos", value: summary.repuestos, bar: "bg-primary", dot: "bg-primary" },
    { label: "Servicio", filter: "Servicio", value: summary.servicios, bar: "bg-sky-500/80", dot: "bg-sky-500" },
    { label: "Kilometraje", filter: "Kilometraje", value: summary.kilometraje, bar: "bg-amber-500/80", dot: "bg-amber-500" },
  ];
  return (
    <div className="border-t pt-2">
      <div className={cn("mb-1.5 flex flex-wrap items-center justify-between gap-2", cardLabel)}>
        <button type="button" onClick={onClear} className="hover:text-primary">
          Mix OS interno
        </button>
        <span className="tabular-nums normal-case text-foreground/70">
          Garantia {money(summary.garantia)} · Interno {money(summary.interno)}
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {items.map((item) => item.value > 0 && (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.filter)}
            className={cn("h-full transition-opacity hover:opacity-80", item.bar, selectedRubros.includes(item.filter) && "opacity-90 ring-1 ring-inset ring-foreground/20")}
            style={{ width: `${(item.value / total) * 100}%` }}
            title={`${item.label}: ${money(item.value)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.filter)}
            className={cn("flex items-center gap-1.5 text-[11px] hover:text-primary", selectedRubros.includes(item.filter) && "text-primary")}
          >
            <span className={cn("h-2 w-2 rounded-full", item.dot)} />
            <span className="font-medium">{item.label}</span>
            <span className="tabular-nums text-muted-foreground">{money(item.value)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function OSSucursalBars({
  rows,
  totalValue,
  metric,
  comparisonLabel,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; rows: number; total: number; horas: number; km: number; previousTotal: number }>;
  totalValue: number;
  metric: OSMetric;
  comparisonLabel?: string;
  onSelect: (sucursal: Sucursal) => void;
}) {
  const visibleRows = rows.filter((row) => row.total > 0 || row.horas > 0 || row.km > 0);
  const max = Math.max(1, ...visibleRows.map((row) => osMetricValue(row, metric)));
  if (visibleRows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin OS absorbidas por sucursal.</div>;
  }
  return (
    <div className="space-y-2">
      {visibleRows.slice(0, 5).map((row) => {
        const value = osMetricValue(row, metric);
        const width = value <= 0 ? 0 : Math.max(4, Math.round((value / max) * 100));
        const previousWidth = row.previousTotal > 0 && metric === "usd" ? Math.round((row.previousTotal / max) * 100) : 0;
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.sucursal} type="button" onClick={() => onSelect(row.sucursal)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent">
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium">{row.sucursal}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatOSMetric(value, metric)}{metric === "usd" ? ` - ${participation}%` : ""}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              {previousWidth > 0 && (
                <span
                  className="absolute top-1/2 h-4 w-0 -translate-y-1/2 border-l border-red-500"
                  style={{ left: `${previousWidth}%` }}
                  title={`vs. ${comparisonLabel ?? "año anterior"}: ${money(row.previousTotal)}`}
                />
              )}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">{row.rows} OS · {formatOSMetric(row.horas, "horas")} · {formatOSMetric(row.km, "km")}</div>
          </button>
        );
      })}
      {visibleRows.length > 5 && (
        <div className="rounded-md border px-3 py-2 text-center text-[12px] text-muted-foreground md:hidden">
          Mostrando 5 de {visibleRows.length} sucursales
        </div>
      )}
    </div>
  );
}

function OSDetalle({
  rows,
  metric,
  mode,
  onSelect,
}: {
  rows: OSImpactRow[];
  metric: OSMetric;
  mode: "os" | "cliente";
  onSelect: (value: string) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin OS absorbidas en el periodo.</div>;
  }
  if (mode === "cliente") {
    const grouped = Array.from(rows.reduce((map, row) => {
      const current = map.get(row.cliente) ?? {
        cliente: row.cliente,
        sucursales: new Set<string>(),
        os: new Set<string>(),
        total: 0,
        horas: 0,
        km: 0,
        servicios: 0,
        repuestos: 0,
        kilometraje: 0,
      };
      if (row.sucursal) current.sucursales.add(row.sucursal);
      current.os.add(row.os);
      current.total += row.total;
      current.horas += row.horas;
      current.km += row.km;
      current.servicios += row.servicios;
      current.repuestos += row.repuestos;
      current.kilometraje += row.kilometraje;
      map.set(row.cliente, current);
      return map;
    }, new Map<string, {
      cliente: string;
      sucursales: Set<string>;
      os: Set<string>;
      total: number;
      horas: number;
      km: number;
      servicios: number;
      repuestos: number;
      kilometraje: number;
    }>()).values())
      .sort((a, b) => osMetricValue(a, metric) - osMetricValue(b, metric))
      .reverse()
      .slice(0, 10);

    return (
      <>
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {grouped.slice(0, 5).map((row) => (
          <button
            key={row.cliente}
            type="button"
            onClick={() => onSelect(row.cliente)}
            className="w-full rounded-md border bg-background px-2.5 py-2 text-left shadow-sm"
          >
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold">{row.cliente}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.os.size} OS - {Array.from(row.sucursales).join(", ") || "Sin sucursal"}</div>
            </div>
            <div className="mt-1 text-[13px] font-bold tabular-nums">{formatOSMetric(osMetricValue(row, metric), metric)}</div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>Serv. {money(row.servicios)}</span>
              <span>Rep. {money(row.repuestos)}</span>
              <span>Km {money(row.kilometraje)}</span>
            </div>
          </button>
        ))}
        {grouped.length > 5 && <div className="col-span-2 rounded-md border px-3 py-2 text-center text-[12px] text-muted-foreground">Mostrando 5 de {grouped.length} clientes</div>}
      </div>
      <div className="hidden overflow-hidden rounded-md border md:block">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_82px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_72px_86px_86px]">
          <div>Cliente</div>
          <div className="text-right">OS</div>
          <div className="hidden text-right sm:block">Sucursal</div>
          <div className="text-right">{metric === "usd" ? "Impacto" : metric === "horas" ? "Horas" : "Km"}</div>
        </div>
        {grouped.map((row) => (
          <button
            key={row.cliente}
            type="button"
            onClick={() => onSelect(row.cliente)}
            className="grid w-full grid-cols-[minmax(0,1fr)_72px_82px] items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent sm:grid-cols-[minmax(0,1fr)_72px_86px_86px]"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{row.cliente}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                Servicio {money(row.servicios)} · Repuestos {money(row.repuestos)} · Km {money(row.kilometraje)}
              </div>
            </div>
            <div className="text-right font-mono text-[11px] font-semibold">{row.os.size}</div>
            <div className="hidden truncate text-right text-[11px] text-muted-foreground sm:block">{Array.from(row.sucursales).join(", ") || "Sin sucursal"}</div>
            <div className="text-right font-semibold tabular-nums">{formatOSMetric(osMetricValue(row, metric), metric)}</div>
          </button>
        ))}
        {rows.length > grouped.length && (
          <div className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
            Mostrando {grouped.length} clientes principales
          </div>
        )}
      </div>
      </>
    );
  }

  const visible = rows.slice().sort((a, b) => b.total - a.total).slice(0, 10);
  return (
    <>
    <div className="space-y-1.5 md:hidden">
      {visible.slice(0, 5).map((row) => (
        <button
          key={`${row.os}-${row.fecha}`}
          type="button"
          onClick={() => onSelect(row.os)}
          className="w-full rounded-md border bg-background px-2.5 py-2 text-left shadow-sm"
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-[10px] font-semibold text-muted-foreground">{row.os}</div>
              <div className="truncate text-[12px] font-semibold">{row.cliente}</div>
            </div>
            <Badge variant="secondary" className="shrink-0 text-[10px]">{row.tipo}</Badge>
          </div>
          <div className="line-clamp-2 text-[11px] text-muted-foreground">{row.problema}</div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span className="truncate">{format(parseISO(row.fecha), "dd/MM")} - {row.sucursal ?? "-"}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatOSMetric(osMetricValue(row, metric), metric)}</span>
          </div>
        </button>
      ))}
      {rows.length > 5 && <div className="rounded-md border px-3 py-2 text-center text-[12px] text-muted-foreground">Mostrando 5 de {rows.length} OS</div>}
    </div>
    <div className="hidden overflow-hidden rounded-md border md:block">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_82px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:grid-cols-[72px_minmax(0,1fr)_86px_86px]">
        <div>OS</div>
        <div>Cliente</div>
        <div className="hidden text-right sm:block">Tipo</div>
        <div className="text-right">{metric === "usd" ? "Impacto" : metric === "horas" ? "Horas" : "Km"}</div>
      </div>
      {visible.map((row) => (
        <button
          key={`${row.os}-${row.fecha}`}
          type="button"
          onClick={() => onSelect(row.os)}
          className="grid w-full grid-cols-[72px_minmax(0,1fr)_82px] items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent sm:grid-cols-[72px_minmax(0,1fr)_86px_86px]"
        >
          <div className="font-mono text-[11px] font-semibold">{row.os}</div>
          <div className="min-w-0">
            <div className="truncate font-medium">{row.cliente}</div>
            <div className="truncate text-[10px] text-muted-foreground">
              {format(parseISO(row.fecha), "dd/MM")} · {row.sucursal ?? "Sin sucursal"} · {row.problema}
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <Badge variant="secondary" className="text-[10px]">{row.tipo}</Badge>
          </div>
          <div className="text-right font-semibold tabular-nums">{formatOSMetric(osMetricValue(row, metric), metric)}</div>
        </button>
      ))}
      {rows.length > visible.length && (
        <div className="border-t px-3 py-1.5 text-center text-[11px] text-muted-foreground">
          Mostrando {visible.length} de {rows.length} OS
        </div>
      )}
    </div>
    </>
  );
}

export function WeeklyBars({
  rows,
  activeKey,
  metric,
  onSelect,
}: {
  rows: WeekRow[];
  activeKey?: string;
  metric: FactMetric;
  onSelect: (key: string) => void;
}) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [weekMetric(row, metric), comparisonWeekMetric(row, metric)]),
  );
  const hasAnyComparisonData = rows.some((row) => comparisonWeekMetric(row, metric) > 0);

  const labelEvery = rows.length > 14 ? Math.ceil(rows.length / 6) : rows.length > 9 ? 2 : 1;

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-1">
      <div
        className="relative grid min-h-[160px] shrink-0 items-end gap-1 border-b px-0.5 pt-2 sm:min-h-[188px] sm:gap-3 sm:px-2 sm:pt-3"
        style={barGridStyle(rows.length, 62)}
      >
        {rows.map((row, index) => {
          const value = weekMetric(row, metric);
          const comparison = comparisonWeekMetric(row, metric);
          const unavailable = metricUnavailable(row, metric);
          const height = unavailable || value <= 0 ? 0 : Math.max(6, Math.round((value / max) * 118));
          const comparisonBottom = comparison > 0 ? Math.max(4, Math.round((comparison / max) * 118)) : 0;
          const active = row.key === activeKey;
          const showLabel = index === 0 || index === rows.length - 1 || index % labelEvery === 0;
          return (
            <button key={row.key} onClick={() => onSelect(row.key)} className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:gap-2">
              <span className="max-w-full truncate text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">{formatWeekMetric(row, metric)}</span>
              <span className="relative flex h-[118px] w-full items-end justify-center sm:h-[136px]">
                {comparison > 0 && (
                  <span
                    className="absolute left-1/2 z-10 w-full max-w-[34px] -translate-x-1/2 border-t-2 border-red-500 sm:max-w-[42px]"
                    style={{ bottom: comparisonBottom }}
                    title={`${row.comparisonLabel}: ${formatFactMetric(comparison, metric)}`}
                  />
                )}
                <span
                  className={cn(
                    "w-full max-w-[34px] rounded-t-md bg-primary/80 transition-all hover:bg-primary sm:max-w-[42px]",
                    active && "bg-primary ring-2 ring-primary/20",
                  )}
                  style={{ height }}
                />
              </span>
              <span className="min-h-7 max-w-full truncate text-[9px] leading-3 text-muted-foreground sm:min-h-8 sm:text-[10px] sm:leading-4">
                {showLabel ? row.label : ""}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
        <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
        {metric === "usd" ? "Facturación ($)" : metric === "horasServicio" ? "Horas servicio facturadas" : "Km facturados"}
        <span className="ml-3 h-0 w-8 max-w-[42px] border-t-2 border-red-500" />
        {hasAnyComparisonData ? "Año anterior equivalente" : "Año anterior: sin datos disponibles"}
      </div>
    </div>
  );
}

export function CumplimientoAgendaChart({
  rows,
  insights,
}: {
  rows: Array<{
    key: string;
    label: string;
    programadas: number;
    realizadas: number;
    noRealizadas: number;
    pendientes: number;
    porcentaje: number;
    estadoPeriodo: "cerrado" | "actual" | "futuro";
  }>;
  insights: {
    efectividad: number | null;
    tendencia: {
      delta: number;
      desde: string;
      hasta: string;
    } | null;
    mayorDesvio: {
      label: string;
      porcentaje: number;
    } | null;
  };
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">
        Sin agenda para los filtros seleccionados.
      </div>
    );
  }

  const labelEvery = rows.length > 18 ? Math.ceil(rows.length / 8) : rows.length > 12 ? 2 : 1;
  const tendenciaLabel = insights.tendencia
    ? `${insights.tendencia.delta > 0 ? "+" : ""}${insights.tendencia.delta} pp`
    : "Sin comparación";
  const tendenciaDetail = insights.tendencia
    ? `${insights.tendencia.desde} a ${insights.tendencia.hasta}`
    : "Se requieren dos periodos cerrados";

  return (
    <TooltipProvider delayDuration={100}>
      <div className="min-w-0 pb-1">
        <div className="min-w-0 overflow-x-auto overflow-y-hidden">
          <div
            className="relative grid min-h-[188px] shrink-0 items-end gap-1 border-b px-1 pt-6 sm:gap-2 sm:px-2"
            style={barGridStyle(rows.length, 58)}
          >
            <div className="pointer-events-none absolute inset-x-1 top-6 h-[140px] sm:inset-x-2">
              {[100, 75, 50, 25].map((value) => (
                <div
                  key={value}
                  className="absolute inset-x-0 border-t border-dashed border-border/70"
                  style={{ bottom: `${value}%` }}
                >
                  <span className="absolute -top-3 left-0 text-[9px] tabular-nums text-muted-foreground">
                    {value}%
                  </span>
                </div>
              ))}
            </div>

            {rows.map((row, index) => {
              const hasAgenda = row.programadas > 0;
              const hasClosedResult = row.realizadas + row.noRealizadas > 0;
              const isCurrent = row.estadoPeriodo === "actual";
              const isFuture = row.estadoPeriodo === "futuro";
              const barHeight = hasAgenda && row.porcentaje > 0
                ? Math.max(6, Math.round((row.porcentaje / 100) * 140))
                : 0;
              const showLabel = index === 0 || index === rows.length - 1 || index % labelEvery === 0;
              const valueLabel = !hasAgenda
                ? "—"
                : isFuture && !hasClosedResult
                  ? "Próx."
                  : isCurrent && !hasClosedResult
                    ? "En curso"
                    : `${row.porcentaje}%`;
              const statusLabel = isFuture
                ? "Periodo por ejecutar"
                : isCurrent
                  ? "Periodo en curso"
                  : `${row.porcentaje}% de cumplimiento`;
              const details = [
                `${row.realizadas} realizadas`,
                `${row.noRealizadas} no realizadas`,
                `${row.pendientes} pendientes`,
                `${row.programadas} agendadas`,
              ];

              return (
                <Tooltip key={row.key}>
                  <TooltipTrigger asChild>
                    <div
                      tabIndex={0}
                      className="relative z-10 flex min-w-0 flex-col items-center gap-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      aria-label={`${row.label}: ${hasAgenda ? statusLabel : "sin agenda"}`}
                    >
                      <span
                        className={cn(
                          "max-w-full truncate text-[10px] font-semibold tabular-nums",
                          isCurrent || isFuture
                            ? "text-sky-700"
                            : hasAgenda
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {valueLabel}
                      </span>
                      <span className="flex h-[140px] w-full items-end justify-center">
                        <span
                          className={cn(
                            "relative h-full w-full max-w-[42px] overflow-hidden rounded-t-md bg-muted/60",
                            isCurrent && "border border-sky-300 bg-sky-50",
                            isFuture && "border border-dashed border-sky-200 bg-sky-50/60",
                          )}
                        >
                          {barHeight > 0 ? (
                            <span
                              className={cn(
                                "absolute inset-x-0 bottom-0 rounded-t-md transition-[height]",
                                isCurrent || isFuture
                                  ? "bg-sky-500"
                                  : row.porcentaje >= 80
                                    ? "bg-emerald-600"
                                    : row.porcentaje >= 60
                                      ? "bg-primary"
                                      : "bg-amber-500",
                              )}
                              style={{ height: `${barHeight}px` }}
                            />
                          ) : null}
                        </span>
                      </span>
                      <span className="min-h-7 max-w-full truncate text-[9px] leading-3 text-muted-foreground sm:text-[10px]">
                        {showLabel ? row.label : ""}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <div className="font-semibold">{row.label}</div>
                    <div className="mt-1 text-[12px]">
                      {hasAgenda ? statusLabel : "Sin agenda programada"}
                    </div>
                    {hasAgenda ? (
                      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {details.map((detail) => <div key={detail}>{detail}</div>)}
                      </div>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
            80% o más
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
            60–79%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
            Menos de 60%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-sky-300 bg-sky-50" />
            En curso / por ejecutar
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 border-t pt-3">
          <div className="min-w-0 pr-2">
            <div className={cardLabel}>
              Efectividad de cierre
            </div>
            <div className="mt-1 truncate text-[18px] font-extrabold tabular-nums">
              {insights.efectividad === null ? "—" : `${insights.efectividad}%`}
            </div>
            <div className="truncate text-[9px] text-muted-foreground sm:text-[10px]">
              Solo resultados registrados
            </div>
          </div>
          <div className="min-w-0 border-l px-2 sm:px-3">
            <div className={cardLabel}>
              Tendencia reciente
            </div>
            <div
              className={cn(
                "mt-1 truncate text-[18px] font-extrabold tabular-nums",
                insights.tendencia && insights.tendencia.delta > 0 && "text-emerald-600",
                insights.tendencia && insights.tendencia.delta < 0 && "text-red-600",
              )}
            >
              {tendenciaLabel}
            </div>
            <div className="truncate text-[9px] text-muted-foreground sm:text-[10px]" title={tendenciaDetail}>
              {tendenciaDetail}
            </div>
          </div>
          <div className="min-w-0 border-l pl-2 sm:pl-3">
            <div className={cardLabel}>
              Mayor desvío
            </div>
            <div className="mt-1 truncate text-[18px] font-extrabold tabular-nums">
              {insights.mayorDesvio?.label ?? "Sin desvíos"}
            </div>
            <div className="truncate text-[9px] text-muted-foreground sm:text-[10px]">
              {insights.mayorDesvio ? `${insights.mayorDesvio.porcentaje}% no realizadas` : "Sin desvíos cerrados"}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function TecnicosNoRealizadosRanking({
  rows,
  onSelect,
}: {
  rows: Array<{
    id: string;
    nombre: string;
    programadas: number;
    realizadas: number;
    noRealizadas: number;
    pendientes: number;
    porcentaje: number;
    activo: boolean;
  }>;
  onSelect: (id: string) => void;
}) {
  const visibleRows = rows.slice(0, 5);

  if (visibleRows.length === 0) {
    return (
      <div className="flex min-h-[168px] items-center justify-center rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">
        Sin jornadas no realizadas para los filtros actuales.
      </div>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {visibleRows.map((row, index) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onSelect(row.id)}
          className="w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
          title={`Filtrar por ${row.nombre}`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold tabular-nums text-amber-700">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-[12px] font-semibold">{row.nombre}</div>
                <div className="shrink-0 text-[13px] font-bold tabular-nums text-amber-700">{row.porcentaje}%</div>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                <span>{row.noRealizadas} de {row.programadas} agendadas</span>
                {!row.activo ? <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">Inactivo</Badge> : null}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${Math.max(row.porcentaje > 0 ? 3 : 0, row.porcentaje)}%` }}
                />
              </div>
            </div>
          </div>
        </button>
      ))}
      {rows.length > visibleRows.length ? (
        <div className="px-3 py-2 text-center text-[10px] text-muted-foreground">
          Mostrando 5 de {rows.length} técnicos con no realizadas
        </div>
      ) : null}
    </div>
  );
}

export function SucursalBars({
  rows,
  totalValue,
  comparisonLabel,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; total: number; previousTotal?: number; facturas: number }>;
  totalValue: number;
  comparisonLabel?: string;
  onSelect: (sucursal: Sucursal) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.total, row.previousTotal ?? 0)));

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin movimiento por sucursal.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isZero = row.total <= 0;
        const width = isZero ? 0 : Math.max(4, Math.round((row.total / max) * 100));
        const previousWidth = row.previousTotal && row.previousTotal > 0 ? Math.round((row.previousTotal / max) * 100) : 0;
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.sucursal} onClick={() => !isZero && onSelect(row.sucursal)} className={cn("w-full rounded-md px-2 py-1.5 text-left", !isZero && "hover:bg-accent", isZero && "opacity-60 cursor-default")}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
              <span className={cn("font-medium", isZero && "text-muted-foreground")}>{row.sucursal}</span>
              <span className="tabular-nums text-muted-foreground">{money(row.total)} - {participation}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              {previousWidth > 0 && (
                <span
                  className="absolute top-1/2 h-4 w-0 -translate-y-1/2 border-l border-red-500"
                  style={{ left: `${previousWidth}%` }}
                  title={`vs. ${comparisonLabel ?? "año anterior"}: ${money(row.previousTotal ?? 0)}`}
                />
              )}
            </div>
          </button>
        );
      })}
      {rows.some((row) => (row.previousTotal ?? 0) > 0) && (
        <div className="flex items-center justify-end gap-1.5 px-2 text-[10px] text-muted-foreground">
          <span className="h-3 border-l border-red-500" />
          vs. {comparisonLabel ?? "año anterior"}
        </div>
      )}
    </div>
  );
}

export function ClientesRanking({
  rows,
  totalValue,
  onSelect,
}: {
  rows: Array<{ nombre: string; total: number; facturas: number }>;
  totalValue: number;
  onSelect: (nombre: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin clientes en el periodo.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row, index) => {
        const width = Math.max(4, Math.round((row.total / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.nombre} onClick={() => onSelect(row.nombre)} className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent">
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="min-w-0 font-semibold">
                <span className="mr-2 text-muted-foreground">{index + 1}</span>
                <span className="truncate">{row.nombre}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{money(row.total)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 min-w-0 flex-1 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
              <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{participation}%</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{row.facturas} factura{row.facturas !== 1 ? "s" : ""}</div>
          </button>
        );
      })}
    </div>
  );
}

export function EstadoBars({
  rows,
  totalValue,
  onSelect,
}: {
  rows: Array<{ estado: string; label: string; count: number }>;
  totalValue: number;
  onSelect: (estado: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const width = Math.max(row.count > 0 ? 4 : 0, Math.round((row.count / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.count / totalValue) * 100) : 0;
        return (
          <button key={row.estado} onClick={() => onSelect(row.estado)} className="grid w-full grid-cols-[96px_1fr_72px_52px] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-accent">
            <span className="font-medium">{row.label}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", row.estado === "pausado" ? "bg-amber-500" : "bg-primary")} style={{ width: `${width}%` }} />
            </span>
            <span className="text-right tabular-nums">{row.count}</span>
            <span className="text-right tabular-nums text-muted-foreground">{participation}%</span>
          </button>
        );
      })}
    </div>
  );
}

export function TrabajoSucursalBars({
  rows,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; activos: number; cerrados: number }>;
  onSelect: (sucursal: Sucursal) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.activos + row.cerrados));
  const visibleRows = rows.filter((row) => row.activos + row.cerrados > 0);

  if (visibleRows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin trabajos por sucursal.</div>;
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const totalRow = row.activos + row.cerrados;
        const width = Math.max(4, Math.round((totalRow / max) * 100));
        return (
          <button key={row.sucursal} onClick={() => onSelect(row.sucursal)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent">
            <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
              <span className="font-medium">{row.sucursal}</span>
              <span className="tabular-nums text-muted-foreground">{row.activos} activos - {row.cerrados} cerrados</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function TecnicoProductividad({ rows }: { rows: Array<{ id: string; nombre: string; jornadas: number; horas: number; trabajos: number }> }) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-[12px] text-muted-foreground">Sin actividad técnica en el período seleccionado.</div>;
  }

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[1fr_74px_74px_74px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <div>Tecnico</div>
        <div className="text-right">Jorn.</div>
        <div className="text-right">Horas</div>
        <div className="text-right">Trab.</div>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_74px_74px_74px] items-center border-t px-3 py-2 text-[12px]">
          <div className="truncate font-medium">{row.nombre}</div>
          <div className="text-right tabular-nums">{row.jornadas}</div>
          <div className="text-right tabular-nums">{row.horas.toFixed(1)}</div>
          <div className="text-right tabular-nums">{row.trabajos}</div>
        </div>
      ))}
    </div>
  );
}

export function MixRubros({
  row,
  rubroFiltro,
  onSelect,
}: {
  row: WeekRow | undefined;
  rubroFiltro: string;
  onSelect?: (rubro: string) => void;
}) {
  if (!row) return <div className="text-[12px] text-muted-foreground">Sin datos.</div>;
  if (rubroFiltro !== "all") {
    const valor = rubroFiltro === "Repuestos" ? row.repuestos
      : rubroFiltro === "Servicio" ? row.servicio
      : rubroFiltro === "Kilometraje" ? row.kilometraje
      : rubroFiltro === "Maquinarias" ? row.maquinarias
      : row.otros;
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className={cardLabel}>Rubro</div>
            <div className="text-[13px] font-semibold">{rubroFiltro}</div>
          </div>
          <div className="text-[15px] font-bold tabular-nums">{money(valor)}</div>
        </div>
      </div>
    );
  }
  const items: Array<{ label: string; value: number; bar: string; dot: string }> = [
    { label: "Repuestos", value: row.repuestos, bar: "bg-primary", dot: "bg-primary" },
    { label: "Servicios", value: row.servicio, bar: "bg-sky-500/80", dot: "bg-sky-500" },
    { label: "Kilometraje", value: row.kilometraje, bar: "bg-amber-500/80", dot: "bg-amber-500" },
    { label: "Maquinarias", value: row.maquinarias, bar: "bg-violet-500/80", dot: "bg-violet-500" },
    { label: "Otros", value: row.otros, bar: "bg-slate-400/80", dot: "bg-slate-400" },
  ];
  const total = row.total || 1;
  return (
    <div className="space-y-1.5">
      <div className={cn("flex items-center justify-between", cardLabel)}>
        <span>Mix $ del periodo</span>
        <span className="tabular-nums normal-case text-foreground/70">{money(row.total)}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {items.map((it) => it.value > 0 && (
          <button
            key={it.label}
            onClick={() => onSelect?.(it.label === "Servicios" ? "Servicio" : it.label)}
            className={cn("h-full transition-opacity hover:opacity-80", it.bar)}
            style={{ width: `${(it.value / total) * 100}%` }}
            title={`${it.label}: ${money(it.value)} (${Math.round((it.value / total) * 100)}%)`}
            aria-label={`${it.label} ${it.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((it) => {
          const itemPct = Math.round((it.value / total) * 100);
          return (
            <button
              key={it.label}
              onClick={() => onSelect?.(it.label === "Servicios" ? "Servicio" : it.label)}
              className="flex items-center gap-1.5 text-[11px] hover:text-primary"
            >
              <span className={cn("h-2 w-2 rounded-full", it.dot)} />
              <span className="font-medium">{it.label}</span>
              <span className="tabular-nums text-muted-foreground">{money(it.value)}</span>
              <span className="tabular-nums text-muted-foreground">({itemPct}%)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EstadoCompacto({
  flujo,
  onSelect,
  planificados,
  técnicosAsignados,
  jornadasPlanificadas,
  planificacionRango,
  jornadasPrev,
  horasPrev,
  tecnicosCierreAnterior,
  cierreAnteriorRango,
}: {
  flujo: { total: number; culminados: number; abiertos: number; pausados: number; pendiente: number; programado: number; iniciado: number; pct: (n: number) => number };
  onSelect: (estado: string) => void;
  planificados?: number;
  técnicosAsignados?: number;
  jornadasPlanificadas?: number;
  planificacionRango?: string;
  jornadasPrev?: number;
  horasPrev?: number;
  tecnicosCierreAnterior?: number;
  cierreAnteriorRango?: string;
}) {
  if (flujo.total === 0) {
    return (
      <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">
        Sin trabajos en el período seleccionado.
      </div>
    );
  }

  const segs = [
    { key: "completado", label: "Culminados", value: flujo.culminados, pct: flujo.pct(flujo.culminados), dot: "bg-primary" },
    { key: "iniciado", label: "Abiertos", value: flujo.abiertos, pct: flujo.pct(flujo.abiertos), dot: "bg-sky-500" },
    { key: "pausado", label: "Pausados", value: flujo.pausados, pct: flujo.pct(flujo.pausados), dot: "bg-amber-500" },
  ];

  const size = 136;
  const stroke = 19;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const activeSegs = segs.filter((s) => s.value > 0);
  const segColors: Record<string, string> = {
    completado: "hsl(var(--primary))",
    iniciado: "hsl(199 89% 48%)",
    pausado: "hsl(38 92% 50%)",
  };
  let offsetAcc = 0;

  return (
    <div className="space-y-3">
      <div className="grid items-center gap-4 sm:grid-cols-[148px_1fr]">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
            {activeSegs.map((s) => {
              const frac = s.value / flujo.total;
              const dash = circumference * frac;
              const gap = circumference - dash;
              const el = (
                <circle
                  key={s.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={segColors[s.key]}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offsetAcc}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => onSelect(s.key)}
                >
                  <title>{`${s.label}: ${s.value} (${s.pct}%)`}</title>
                </circle>
              );
              offsetAcc += dash;
              return el;
            })}
          </svg>
          <button
            onClick={() => onSelect("all")}
            className="absolute inset-0 flex flex-col items-center justify-center hover:text-primary"
          >
            <span className="text-[18px] font-bold tabular-nums leading-none">{flujo.total}</span>
            <span className={cn("mt-0.5", cardLabel)}>gestionados</span>
          </button>
        </div>

        <div className="min-w-0 rounded-md border">
          {segs.map((s) => (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className="grid w-full grid-cols-[1fr_54px_48px] items-center gap-2 border-b px-3 py-2 text-[12px] last:border-b-0 hover:bg-muted/50"
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                <span className="font-medium">{s.label}</span>
              </span>
              <span className="text-right font-semibold tabular-nums">{s.value}</span>
              <span className="text-right text-muted-foreground tabular-nums">{s.pct}%</span>
            </button>
          ))}
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <EstadoMiniCard
            icon={FileText}
            title="Abiertos"
            titleClassName="text-sky-700"
            iconClassName="bg-sky-500/10 text-sky-700"
            value={`${flujo.abiertos} trabajos`}
            detail={`${flujo.pendiente} pendientes · ${flujo.programado} programados · ${flujo.iniciado} iniciados`}
            onClick={() => onSelect("iniciado")}
          />
          <EstadoMiniCard
            icon={CalendarDays}
            title="Próximo período"
            value={`${jornadasPlanificadas ?? 0} jornadas`}
          />
          <EstadoMiniCard
            icon={Activity}
            title="Cierre anterior"
            value={jornadasPrev ? `${jornadasPrev} jornadas · ${(horasPrev ?? 0).toFixed(0)} hs` : "Sin cierre anterior disponible"}
            detail={jornadasPrev && tecnicosCierreAnterior ? `${tecnicosCierreAnterior} técnicos activos` : ""}
          />
        </div>
      </div>
    </div>
  );
}

function EstadoMiniCard({
  icon: Icon,
  title,
  subtitle,
  value,
  detail,
  titleClassName,
  iconClassName,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  value: string;
  detail?: string;
  titleClassName?: string;
  iconClassName?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex h-full flex-col rounded-md border bg-background p-2 text-left shadow-sm">
      <div className="mb-1.5 flex items-start gap-2">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", iconClassName)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <div className={cn(cardLabel, titleClassName)}>{title}</div>
        </div>
      </div>
      <div className="text-[14px] font-semibold leading-5 tabular-nums">{value}</div>
      {detail ? <div className={cn("mt-1", metaText)}>{detail}</div> : null}
    </div>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className="h-full hover:opacity-90">
      {content}
    </button>
  ) : content;
}

export function CargaSucursalTabla({
  rows,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; cerrados: number; abiertos: number; pausados: number; total: number; pct: number }>;
  onSelect: (sucursal: Sucursal) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin trabajos por sucursal.</div>;
  }

  const maxTotal = Math.max(1, ...rows.map((row) => row.total));

  return (
    <div className="space-y-2">
      <div className="rounded-xl border overflow-hidden">
        <div className={cn("grid grid-cols-[160px_minmax(0,1fr)_64px_44px] bg-muted/35 px-3 py-2", tableHeadText)}>
          <div>Sucursal</div>
          <div>Estado</div>
          <div className="text-right">Total</div>
          <div className="text-right">%</div>
        </div>
        <div className="divide-y">
          {rows.map((row) => {
            const widthPct = Math.max(8, Math.round((row.total / maxTotal) * 100));
            const cerradosPct = row.total > 0 ? (row.cerrados / row.total) * 100 : 0;
            const abiertosPct = row.total > 0 ? (row.abiertos / row.total) * 100 : 0;
            const pausadosPct = row.total > 0 ? (row.pausados / row.total) * 100 : 0;

            return (
              <button
                key={row.sucursal}
                type="button"
                onClick={() => onSelect(row.sucursal)}
                className="grid w-full grid-cols-[160px_minmax(0,1fr)_64px_44px] items-center gap-3 px-3 py-2 text-left hover:bg-accent/35"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{row.sucursal}</div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-foreground/85">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-600" /> {row.cerrados}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> {row.abiertos}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {row.pausados}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${widthPct}%` }}>
                      <div className="h-full bg-emerald-600" style={{ width: `${cerradosPct}%` }} />
                      <div className="h-full bg-sky-500" style={{ width: `${abiertosPct}%` }} />
                      <div className="h-full bg-amber-500" style={{ width: `${pausadosPct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-flex min-w-[40px] justify-center rounded-lg bg-primary/5 px-1.5 py-0.5 text-[13px] font-bold tabular-nums text-primary">
                    {row.total}
                  </span>
                </div>
                <div className="text-right text-[13px] font-semibold tabular-nums text-primary">{row.pct}%</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DistribucionMarca({
  data,
  onSelect,
  selected,
}: {
  data: Array<{ marca: Marca; cerrados: number; abiertos: number; pausados: number; total: number; horas: number; pct: number }>;
  onSelect: (marca: Marca) => void;
  selected: string[];
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const totales = data.reduce(
    (acc, d) => ({
      cerrados: acc.cerrados + d.cerrados,
      abiertos: acc.abiertos + d.abiertos,
      pausados: acc.pausados + d.pausados,
      total: acc.total + d.total,
      horas: acc.horas + d.horas,
    }),
    { cerrados: 0, abiertos: 0, pausados: 0, total: 0, horas: 0 },
  );
  if (totales.total === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin actividad por marca en el periodo.</div>;
  }
  const PALETAS: Record<Marca, { abiertos: string; pausados: string; cerrados: string; dot: string }> = {
    CLAAS: { abiertos: "#7BC58A", pausados: "#2E9F4F", cerrados: "#00853E", dot: "#00853E" },
    HORSCH: { abiertos: "#F4A6A6", pausados: "#E64545", cerrados: "#E2001A", dot: "#E2001A" },
    OTROS: { abiertos: "#9CA3AF", pausados: "#6B7280", cerrados: "#374151", dot: "#6B7280" },
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {data.map((d) => {
          const isActive = selected.length === 1 && selected[0] === d.marca;
          const widthAbiertos = d.total > 0 ? (d.abiertos / max) * 100 : 0;
          const widthPausados = d.total > 0 ? (d.pausados / max) * 100 : 0;
          const widthCerrados = d.total > 0 ? (d.cerrados / max) * 100 : 0;
          const pal = PALETAS[d.marca] ?? PALETAS.OTROS;
          return (
            <button
              key={d.marca}
              onClick={() => onSelect(d.marca)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition hover:bg-accent",
                isActive && "border-primary bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pal.dot }} />
                  <span className="font-semibold">{d.marca}</span>
                  <span className="text-[11px] text-muted-foreground">{d.pct}%</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums text-[11px] text-muted-foreground">
                  <span>{d.horas.toFixed(1)} h</span>
                  <span className="font-semibold text-foreground">{d.total}</span>
                </div>
              </div>
              <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full" style={{ width: `${widthAbiertos}%`, backgroundColor: pal.abiertos }} title={`Abiertos: ${d.abiertos}`} />
                <div className="h-full" style={{ width: `${widthPausados}%`, backgroundColor: pal.pausados }} title={`Pausados: ${d.pausados}`} />
                <div className="h-full" style={{ width: `${widthCerrados}%`, backgroundColor: pal.cerrados }} title={`Cerrados: ${d.cerrados}`} />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground tabular-nums">
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.abiertos }} />Abiertos {d.abiertos}</span>
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.pausados }} />Pausados {d.pausados}</span>
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.cerrados }} />Cerrados {d.cerrados}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">Total periodo</span>
        <div className="flex items-center gap-3">
          <span>Abiertos {totales.abiertos}</span>
          <span>Pausados {totales.pausados}</span>
          <span>Cerrados {totales.cerrados}</span>
          <span>{totales.horas.toFixed(1)} h</span>
          <span className="font-semibold text-foreground">{totales.total}</span>
        </div>
      </div>
    </div>
  );
}



type MatrizCellRef = {
  id?: string;
  fecha?: string;
  ref: string;
  cliente: string;
  trabajo?: string;
  sucursal?: string;
  tecnico?: string;
  estado: string;
  motivo?: string | null;
};
type MatrixBucketCell = {
  jornadas: number;
  horas: number;
  realizadas: number;
  noRealizadas: number;
  programadas: number;
  noDisponibilidad: string[];
  refs: MatrizCellRef[];
};
type MatrizTecnicoRow = {
  id: string;
  nombre: string;
  sucursal: string;
  sinAsignacion: boolean;
  tieneNoDisponibilidad: boolean;
  cells: Record<string, MatrixBucketCell>;
};
type MatrizSucursalBlock = {
  sucursal: string;
  totalActividad: number;
  totalTécnicos: number;
  técnicos: MatrizTecnicoRow[];
};

function matrixBucketIsSunday(key: string, mode: PeriodMode) {
  return mode === "dia" && getDay(parseISO(key)) === 0;
}

function MatrizCellVisual({
  cell,
  isCurrent,
  isSunday,
  metric,
}: {
  cell?: MatrixBucketCell;
  isCurrent: boolean;
  isSunday: boolean;
  metric: "trabajos" | "horas";
}) {
  const totalJornadas = (cell?.realizadas ?? 0) + (cell?.noRealizadas ?? 0) + (cell?.programadas ?? 0);
  const hasNoDisponibilidad = (cell?.noDisponibilidad?.length ?? 0) > 0;
  const labelValue = metric === "horas"
    ? ((cell?.horas ?? 0) > 0 ? `${Number(cell?.horas ?? 0).toFixed(1)}` : "")
    : (totalJornadas > 1 ? String(totalJornadas) : "");

  if (!cell || (totalJornadas === 0 && !hasNoDisponibilidad)) {
    return <div className={cn("h-9 rounded-md border border-transparent", isSunday && "bg-muted/45", isCurrent && "ring-1 ring-primary/10")} />;
  }

  const hasRealizadas = (cell.realizadas ?? 0) > 0;
  const hasNoRealizadas = (cell.noRealizadas ?? 0) > 0;
  const hasProgramadas = (cell.programadas ?? 0) > 0;

  if (hasRealizadas && hasNoRealizadas) {
    return (
      <div className={cn("relative flex h-9 items-center justify-center overflow-hidden rounded-md border border-border/60 text-[11px] font-semibold tabular-nums", isCurrent && "ring-1 ring-primary/10", isSunday && "bg-muted/40")}>
        <div className="absolute inset-y-0 left-0 w-1/2 bg-emerald-500/18" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-amber-400/25" />
        {hasNoDisponibilidad ? <div className="absolute inset-x-1 bottom-1 h-1 rounded-full bg-violet-400/75" /> : null}
        <span className="relative z-10 text-foreground">{labelValue || "●"}</span>
      </div>
    );
  }

  if (hasRealizadas) {
    return (
      <div className={cn("flex h-9 items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-500/12 px-1 text-[11px] font-semibold text-emerald-700 tabular-nums", isCurrent && "ring-1 ring-primary/10", isSunday && "bg-emerald-500/8")}>
        <span className="text-[10px] leading-none">●</span>
        {labelValue ? <span>{labelValue}</span> : null}
      </div>
    );
  }

  if (hasNoRealizadas) {
    return (
      <div className={cn("flex h-9 items-center justify-center gap-1 rounded-md border border-amber-200 bg-amber-400/12 px-1 text-[11px] font-semibold text-amber-700 tabular-nums", isCurrent && "ring-1 ring-primary/10", isSunday && "bg-amber-400/10")}>
        <span className="text-[10px] leading-none">▲</span>
        {labelValue ? <span>{labelValue}</span> : null}
      </div>
    );
  }

  if (hasProgramadas) {
    return (
      <div className={cn("flex h-9 items-center justify-center gap-1 rounded-md border border-sky-300 bg-sky-500/5 px-1 text-[11px] font-semibold text-sky-700 tabular-nums", isCurrent && "ring-1 ring-primary/10", isSunday && "bg-sky-500/5")}>
        <span className="text-[10px] leading-none">○</span>
        {labelValue ? <span>{labelValue}</span> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex h-9 items-center justify-center rounded-md border border-violet-200 bg-violet-500/10 px-1 text-[10px] font-semibold text-violet-700", isCurrent && "ring-1 ring-primary/10", isSunday && "bg-violet-500/8")}>
      ND
    </div>
  );
}

export function MatrizTécnicosDías({
  data,
  currentBucketKey,
  onSelectTecnico,
  onSelectSucursal,
  metric,
  onMetricChange,
}: {
  data: {
    buckets: string[];
    blocks: MatrizSucursalBlock[];
    bucketLabels: Record<string, string>;
    bucketMode: PeriodMode;
    overLimit: boolean;
  };
  currentBucketKey?: string | null;
  onSelectTecnico: (tecnicoId: string) => void;
  onSelectSucursal: (sucursal: string) => void;
  metric: "trabajos" | "horas";
  onMetricChange: (metric: "trabajos" | "horas") => void;
}) {
  const { buckets, blocks, bucketLabels, bucketMode, overLimit } = data;
  const [leftWidth, setLeftWidth] = useState(320);

  if (overLimit) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Disponible para rangos de hasta 31 columnas visibles.</div>;
  }

  if (blocks.length === 0 || buckets.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin actividad técnica para los filtros actuales.</div>;
  }

  const dayWidth = buckets.length <= 7 ? 1 : buckets.length <= 14 ? 76 : 58;
  const gridTemplateColumns = buckets.length <= 7
    ? `${leftWidth}px repeat(${buckets.length}, minmax(120px, 1fr))`
    : `${leftWidth}px repeat(${buckets.length}, ${dayWidth}px)`;

  const printDetailRows = useMemo(() => {
    const activity = new Map<string, {
      fecha: string;
      bucket: string;
      sucursal: string;
      ref: string;
      cliente: string;
      trabajo: string;
      estado: string;
      tecnicos: Set<string>;
    }>();
    const unavailable: Array<{
      fecha: string;
      bucket: string;
      sucursal: string;
      tecnico: string;
      motivo: string;
    }> = [];

    for (const block of blocks) {
      for (const row of block.técnicos) {
        for (const bucket of buckets) {
          const cell = row.cells[bucket];
          if (!cell) continue;

          for (const item of cell.refs ?? []) {
            const key = [
              item.id ?? item.ref,
              item.fecha ?? bucket,
              item.ref,
              item.cliente,
              item.trabajo ?? "",
              item.estado,
            ].join("|");
            const current = activity.get(key) ?? {
              fecha: item.fecha ?? bucket,
              bucket,
              sucursal: item.sucursal ?? block.sucursal,
              ref: item.ref,
              cliente: item.cliente,
              trabajo: item.trabajo ?? "",
              estado: item.estado,
              tecnicos: new Set<string>(),
            };
            current.tecnicos.add(item.tecnico ?? row.nombre);
            activity.set(key, current);
          }

          for (const motivo of cell.noDisponibilidad ?? []) {
            unavailable.push({
              fecha: bucket,
              bucket,
              sucursal: block.sucursal,
              tecnico: row.nombre,
              motivo,
            });
          }
        }
      }
    }

    return {
      activity: [...activity.values()].sort((a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        a.sucursal.localeCompare(b.sucursal) ||
        a.cliente.localeCompare(b.cliente) ||
        a.ref.localeCompare(b.ref)
      ),
      unavailable: unavailable.sort((a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        a.sucursal.localeCompare(b.sucursal) ||
        a.tecnico.localeCompare(b.tecnico)
      ),
    };
  }, [blocks, buckets]);

  const printMatrix = () => {
    document.body.classList.add("printing-dashboard-matrix");
    window.setTimeout(() => window.print(), 30);
  };

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("printing-dashboard-matrix");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      cleanup();
    };
  }, []);

  const startResize = (event: any) => {
    event.preventDefault();
    const startX = event.clientX;
    const initialWidth = leftWidth;

    const onMove = (moveEvent: any) => {
      const next = Math.max(260, Math.min(520, initialWidth + (moveEvent.clientX - startX)));
      setLeftWidth(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="dashboard-matrix-print-root space-y-3">
        <div className="dashboard-matrix-print-header hidden">
          <div>
            <div className="text-[13px] font-bold">Matriz técnicos por período</div>
            <div className="text-[10px] text-muted-foreground">
              {bucketMode === "dia" ? "Vista diaria" : bucketMode === "semana" ? "Vista semanal" : bucketMode === "mes" ? "Vista mensual" : "Vista anual"} · {metric === "horas" ? "Horas" : "Trabajos"}
            </div>
          </div>
          <div className="text-right text-[10px] text-muted-foreground">
            {buckets[0] ? bucketLabels[buckets[0]] ?? buckets[0] : ""} - {buckets[buckets.length - 1] ? bucketLabels[buckets[buckets.length - 1]] ?? buckets[buckets.length - 1] : ""}
          </div>
        </div>

        <div className="dashboard-matrix-print-toolbar flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="text-emerald-600">●</span> Realizadas</span>
            <span className="inline-flex items-center gap-1"><span className="text-amber-600">▲</span> No realizadas / vencidas</span>
            <span className="inline-flex items-center gap-1"><span className="text-sky-700">○</span> Programadas</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> No disponible</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
              <button type="button" onClick={() => onMetricChange("trabajos")} className={cn("px-2.5 py-1", metric === "trabajos" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>Trabajos</button>
              <button type="button" onClick={() => onMetricChange("horas")} className={cn("border-l px-2.5 py-1", metric === "horas" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>Horas</button>
            </div>
            <button
              type="button"
              onClick={printMatrix}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium hover:bg-accent"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
          </div>
        </div>

        <div className="dashboard-matrix-scroll space-y-3 overflow-x-auto pb-1">
          {blocks.map((block) => (
            <div key={block.sucursal} className="dashboard-matrix-block rounded-lg border bg-background">
              <div
                className="dashboard-matrix-grid grid min-w-max border-b bg-muted/25"
                style={{ gridTemplateColumns, "--matrix-days": buckets.length } as { [key: string]: string | number }}
              >
                <div className="dashboard-matrix-left sticky left-0 z-20 border-r bg-muted/25">
                  <button
                    type="button"
                    onClick={() => onSelectSucursal(block.sucursal)}
                    className="dashboard-matrix-sucursal flex h-11 w-full flex-col items-start justify-center px-3 text-left hover:bg-accent/60"
                  >
                    <span className="text-[13px] font-semibold">{block.sucursal}</span>
                    <span className="text-[11px] text-muted-foreground">{block.totalTécnicos} técnicos · {block.totalActividad} {metric === "horas" ? "hs" : "registros"}</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Ajustar ancho de nombres"
                    onPointerDown={startResize}
                    className="absolute inset-y-0 right-0 w-2 cursor-col-resize bg-transparent hover:bg-primary/10"
                  />
                </div>
                {buckets.map((bucket) => {
                  const isCurrent = currentBucketKey === bucket;
                  const isSunday = matrixBucketIsSunday(bucket, bucketMode);
                  return (
                    <div
                      key={`${block.sucursal}-${bucket}`}
                      className={cn(
                        "dashboard-matrix-day-header flex h-11 items-center justify-center border-l px-1 text-center text-[11px] font-medium text-muted-foreground",
                        isCurrent && "bg-primary/5 text-foreground",
                        isSunday && "bg-muted/50"
                      )}
                    >
                      {bucketLabels[bucket] ?? bucket}
                    </div>
                  );
                })}
              </div>

              {block.técnicos.map((row) => (
                <div
                  key={`${block.sucursal}-${row.id}`}
                  className="dashboard-matrix-grid grid min-w-max"
                  style={{ gridTemplateColumns, "--matrix-days": buckets.length } as { [key: string]: string | number }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectTecnico(row.id)}
                    className={cn(
                      "dashboard-matrix-tech sticky left-0 z-10 flex h-12 flex-col items-start justify-center border-r border-t px-3 text-left hover:bg-accent/60",
                      row.sinAsignacion ? "bg-red-50" : "bg-background"
                    )}
                  >
                    <span className="truncate text-[13px] font-medium">{row.nombre}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {row.sinAsignacion ? "Sin asignación" : row.tieneNoDisponibilidad ? "Con no disponibilidad" : row.sucursal}
                    </span>
                  </button>

                  {buckets.map((bucket) => {
                    const cell = row.cells[bucket];
                    const isCurrent = currentBucketKey === bucket;
                    const isSunday = matrixBucketIsSunday(bucket, bucketMode);
                    const title = cell?.refs?.length
                      ? cell.refs.map((item) => `${item.ref} · ${item.cliente} · ${item.estado}${item.motivo ? ` · ${item.motivo}` : ""}`).join("\n")
                      : cell?.noDisponibilidad?.length
                        ? cell.noDisponibilidad.join("\n")
                        : "Sin actividad";

                    return (
                      <div key={`${block.sucursal}-${row.id}-${bucket}`} className={cn("dashboard-matrix-cell border-l border-t p-1", isCurrent && "bg-primary/5", isSunday && "bg-muted/35")}>
                        {(cell?.refs?.length || cell?.noDisponibilidad?.length) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="block w-full text-left" title={title}>
                                <MatrizCellVisual cell={cell} isCurrent={isCurrent} isSunday={isSunday} metric={metric} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] p-2">
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold">{row.nombre} · {bucketLabels[bucket] ?? bucket}</div>
                                {cell?.refs?.map((item, index) => (
                                  <div key={`${item.ref}-${item.estado}-${index}`} className="text-[11px] leading-tight">
                                    <div className="font-medium">{item.ref} · {item.cliente}</div>
                                    <div className="text-muted-foreground">{item.estado}{item.motivo ? ` · ${item.motivo}` : ""}</div>
                                  </div>
                                ))}
                                {cell?.noDisponibilidad?.map((item, index) => (
                                  <div key={`${item}-${index}`} className="text-[11px] leading-tight text-violet-700">
                                    {item}
                                  </div>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <MatrizCellVisual cell={cell} isCurrent={isCurrent} isSunday={isSunday} metric={metric} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="dashboard-matrix-print-detail hidden">
          <div className="dashboard-matrix-print-section-title">Detalle operativo</div>
          {printDetailRows.activity.length > 0 ? (
            <table className="dashboard-matrix-print-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sucursal</th>
                  <th>Técnico(s)</th>
                  <th>OS/TR</th>
                  <th>Cliente</th>
                  <th>Trabajo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {printDetailRows.activity.map((row, index) => (
                  <tr key={`${row.fecha}-${row.ref}-${row.cliente}-${index}`}>
                    <td>{bucketLabels[row.fecha] ?? bucketLabels[row.bucket] ?? row.fecha}</td>
                    <td>{row.sucursal}</td>
                    <td>{[...row.tecnicos].join(", ")}</td>
                    <td>{row.ref}</td>
                    <td>{row.cliente}</td>
                    <td>{row.trabajo || "-"}</td>
                    <td>{row.estado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="dashboard-matrix-print-empty">Sin jornadas operativas en el período.</div>
          )}

          {printDetailRows.unavailable.length > 0 ? (
            <>
              <div className="dashboard-matrix-print-section-title dashboard-matrix-print-section-title-secondary">No disponibilidad</div>
              <table className="dashboard-matrix-print-table dashboard-matrix-print-table-compact">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Sucursal</th>
                    <th>Técnico</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {printDetailRows.unavailable.map((row, index) => (
                    <tr key={`${row.fecha}-${row.tecnico}-${row.motivo}-${index}`}>
                      <td>{bucketLabels[row.fecha] ?? bucketLabels[row.bucket] ?? row.fecha}</td>
                      <td>{row.sucursal}</td>
                      <td>{row.tecnico}</td>
                      <td>{row.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}

export function TrabajosAbiertosList({
  rows,
  onSelect,
}: {
  rows: Array<{
    id: string;
    ref: string;
    cliente: string;
    sucursal: string;
    estado: string;
    ultimaFecha: string;
    díasSinCierre: number;
    pendientes: number;
    programados: number;
    iniciados: number;
  }>;
  onSelect: (row: { id: string; ref: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin trabajos abiertos para los filtros actuales.</div>;
  }

  const visibleRows = expanded ? rows : rows.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="space-y-2 md:hidden">
        {visibleRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-left shadow-sm hover:bg-accent/40"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[11px] font-semibold text-muted-foreground">{row.ref}</div>
                <div className="truncate text-[13px] font-semibold">{row.cliente}</div>
                <div className="text-[11px] text-muted-foreground">{row.sucursal}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-bold tabular-nums">{row.díasSinCierre} d</div>
                <div className="text-[11px] text-muted-foreground">{row.estado}</div>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">Última fecha {row.ultimaFecha}</div>
          </button>
        ))}
      </div>

      <div className="hidden rounded-md border md:block">
        <div className="grid grid-cols-[90px_1.2fr_120px_100px_94px_90px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>OS/TR</div>
          <div>Cliente</div>
          <div>Sucursal</div>
          <div className="text-right">Estado</div>
          <div className="text-right">Últ. fecha</div>
          <div className="text-right">Sin cierre</div>
        </div>
        {visibleRows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            className="grid w-full grid-cols-[90px_1.2fr_120px_100px_94px_90px] items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent/40"
          >
            <div className="font-mono font-semibold text-muted-foreground">{row.ref}</div>
            <div className="truncate font-medium">{row.cliente}</div>
            <div className="truncate">{row.sucursal}</div>
            <div className="text-right">{row.estado}</div>
            <div className="text-right tabular-nums">{row.ultimaFecha}</div>
            <div className="text-right font-semibold tabular-nums">{row.díasSinCierre} d</div>
          </button>
        ))}
      </div>

      {rows.length > 5 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full rounded-md border px-3 py-2 text-[12px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
        </button>
      ) : null}
    </div>
  );
}

export function CargaEquipoChart({
  data,
}: {
  data: {
    buckets: string[];
    allRows: Array<{ porBucket: Record<string, { jornadas: number; horas: number }> }>;
    trabajosPorBucket: Record<string, number>;
    técnicosNoDisponiblesPorBucket?: Record<string, number>;
    bucketLabel: (k: string) => string;
    bucketMode: PeriodMode;
  };
}) {
  const { buckets, allRows, trabajosPorBucket, técnicosNoDisponiblesPorBucket = {}, bucketLabel, bucketMode } = data;
  const n = buckets.length;

  const isSunday = (k: string) => bucketMode === "dia" && getDay(parseISO(k)) === 0;

  const trabajos = buckets.map((k) => trabajosPorBucket[k] ?? 0);
  const techs = buckets.map((k) =>
    allRows.filter((r) => (r.porBucket[k]?.jornadas ?? 0) > 0).length
  );
  const noDisponibles = buckets.map((k) => técnicosNoDisponiblesPorBucket[k] ?? 0);

  // Stepped scale: round up to next multiple of 5 (min 5)
  const rawMax = Math.max(0, ...trabajos, ...techs, ...noDisponibles);
  const maxAll = Math.max(5, Math.ceil(rawMax / 5) * 5);

  // Measure the bar area's actual rendered height so bars fill it correctly
  const barAreaRef = useRef<HTMLDivElement>(null);
  const [chartH, setChartH] = useState(140);
  useEffect(() => {
    const el = barAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 20) setChartH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 8px breathing room at the bottom (matches pb-2 in bars grid)
  const usableH = Math.max(20, chartH - 8);
  const barH = (v: number) => v <= 0 ? 3 : Math.max(5, Math.round((v / maxAll) * usableH));

  // Y axis ticks at multiples of 5
  const yStep = maxAll > 20 ? 10 : 5;
  const yTicks: number[] = [];
  for (let v = 0; v <= maxAll; v += yStep) yTicks.push(v);
  yTicks.reverse();

  const gridCols = `repeat(${Math.max(n, 1)}, minmax(0, 1fr))`;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-2">
      {/* Chart: Y axis + bars — flex-1 fills remaining card height */}
      <div className="flex flex-1 min-h-0 gap-1">
        {/* Y axis */}
        <div className="relative w-5 shrink-0">
          {yTicks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0.5 -translate-y-1/2 text-[8px] tabular-nums text-muted-foreground/60"
              style={{ top: `${((maxAll - tick) / maxAll) * 100}%` }}
            >{tick}</span>
          ))}
        </div>

        {/* Bar area — ref'd for height measurement */}
        <div ref={barAreaRef} className="relative flex-1 border-b border-l">
          {/* Gridlines */}
          {yTicks.filter((t) => t > 0 && t < maxAll).map((tick) => (
            <div
              key={tick}
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted-foreground/15"
              style={{ top: `${((maxAll - tick) / maxAll) * 100}%` }}
            />
          ))}
          {/* Bars grid */}
          <div
            className="absolute inset-0 grid items-end px-0.5 pb-2"
            style={{ gridTemplateColumns: gridCols }}
          >
            {buckets.map((k, i) => {
              const sun = isSunday(k);
              const hT = barH(trabajos[i]);
              const hTech = barH(techs[i]);
              const hNoDisp = barH(noDisponibles[i]);
              return (
                <div key={k} className="flex items-end justify-center gap-px">
                  {/* Trabajos bar */}
                  <div className="flex flex-col items-center">
                    {trabajos[i] > 0 && (
                      <span className={cn(
                        "mb-0.5 text-[7px] font-semibold leading-none tabular-nums sm:text-[8px]",
                        sun ? "text-muted-foreground/30" : "text-primary/90",
                      )}>{trabajos[i]}</span>
                    )}
                    <div
                      style={{ height: hT }}
                      className={cn("w-3 rounded-t-sm sm:w-4", sun ? "bg-muted/40" : "bg-primary/75")}
                    />
                  </div>
                  {/* Técnicos bar */}
                  <div className="flex flex-col items-center">
                    {techs[i] > 0 && (
                      <span className={cn(
                        "mb-0.5 text-[7px] font-semibold leading-none tabular-nums sm:text-[8px]",
                        sun ? "text-muted-foreground/30" : "text-amber-500",
                      )}>{techs[i]}</span>
                    )}
                    <div
                      style={{ height: hTech }}
                      className={cn("w-3 rounded-t-sm sm:w-4", sun ? "bg-muted/40" : "bg-amber-400/90")}
                    />
                  </div>
                  <div className="flex flex-col items-center">
                    {noDisponibles[i] > 0 && (
                      <span className={cn(
                        "mb-0.5 text-[7px] font-semibold leading-none tabular-nums sm:text-[8px]",
                        sun ? "text-muted-foreground/30" : "text-sky-600",
                      )}>{noDisponibles[i]}</span>
                    )}
                    <div
                      style={{ height: hNoDisp }}
                      className={cn("w-2.5 rounded-t-sm sm:w-3", sun ? "bg-muted/40" : "bg-sky-400/90")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day labels — spacer matches Y axis width + gap */}
      <div className="flex gap-1">
        <div className="w-5 shrink-0" />
        <div className="grid flex-1 px-0.5" style={{ gridTemplateColumns: gridCols }}>
          {buckets.map((k) => (
            <div
              key={k}
              className={cn(
                "truncate text-center text-[9px] sm:text-[10px]",
                isSunday(k) ? "text-muted-foreground/40" : "text-muted-foreground",
              )}
            >
              {bucketLabel(k)}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground sm:text-[11px]">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/75" />
          Trabajos
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/90" />
          Técnicos con actividad
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400/90" />
          No disponibles
        </div>
      </div>
    </div>
  );
}

export function CargaTecnicaMatriz({
  data, onClick,
}: {
  data: {
    buckets: string[];
    rows: Array<{ id: string; nombre: string; porBucket: Record<string, { jornadas: number; horas: number }>; totalJornadas: number; totalHoras: number; trabajos: number }>;
    totalesPorBucket: Record<string, { jornadas: number; horas: number }>;
    bucketLabel: (k: string) => string;
    bucketMode: PeriodMode;
  };
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [metrica, setMetrica] = useState<"servicios" | "horas">("servicios");
  const { buckets, rows, totalesPorBucket, bucketLabel, bucketMode } = data;

  const fmt = (v: number) => metrica === "horas" ? (v ? v.toFixed(1) : "-") : (v ? String(v) : "-");
  const getVal = (cell: { jornadas: number; horas: number } | undefined) =>
    cell ? (metrica === "horas" ? cell.horas : cell.jornadas) : 0;

  const COLLAPSED = 5;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  const totalGeneral = rows.reduce((acc, r) => acc + (metrica === "horas" ? r.totalHoras : r.totalJornadas), 0);

  const colWidth = 56;
  const gridCols = `minmax(120px,1fr) repeat(${buckets.length}, ${colWidth}px) 64px`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
          <button
            type="button"
            onClick={() => setMetrica("servicios")}
            className={cn("px-2 py-1", metrica === "servicios" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
          >
            Servicios asignados
          </button>
          <button
            type="button"
            onClick={() => setMetrica("horas")}
            className={cn("px-2 py-1 border-l", metrica === "horas" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
          >
            Horas trabajadas
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Total: {metrica === "horas" ? `${totalGeneral.toFixed(1)} hs` : `${totalGeneral} serv.`}
        </div>
      </div>

      {rows.length === 0 || buckets.length === 0 ? (
        <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin datos para los filtros seleccionados.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:hidden">
            {visible.map((r) => {
              const rowTotal = metrica === "horas" ? r.totalHoras : r.totalJornadas;
              return (
                <button
                  key={r.id}
                  onClick={onClick}
                  className="w-full rounded-md border bg-background px-2.5 py-2 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-[11px] font-semibold">{r.nombre}</div>
                    <div className="shrink-0 text-[13px] font-bold tabular-nums">
                      {metrica === "horas" ? `${rowTotal.toFixed(1)} hs` : `${rowTotal} serv.`}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {buckets.slice(0, 3).map((k) => (
                      <span key={k}>{bucketLabel(k)} {fmt(getVal(r.porBucket[k]))}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className={cn("hidden overflow-auto rounded-md border md:block", expanded ? "max-h-[440px]" : "max-h-[280px]")}>
            <div
              className="sticky top-0 z-10 grid bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div>Tecnico</div>
              {buckets.map((k) => (
                <div key={k} className="text-right tabular-nums">{bucketLabel(k)}</div>
              ))}
              <div className="text-right">Total</div>
            </div>
            {visible.map((r) => (
              <button
                key={r.id}
                onClick={onClick}
                className="grid w-full items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="truncate font-medium">{r.nombre}</div>
                {buckets.map((k) => (
                  <div key={k} className="text-right tabular-nums text-foreground/80">
                    {fmt(getVal(r.porBucket[k]))}
                  </div>
                ))}
                <div className="text-right font-semibold tabular-nums">
                  {metrica === "horas" ? r.totalHoras.toFixed(1) : r.totalJornadas}
                </div>
              </button>
            ))}
            <div
              className="grid border-t bg-muted/40 px-3 py-2 text-[11px] font-semibold"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="text-muted-foreground">Total</div>
              {buckets.map((k) => (
                <div key={k} className="text-right tabular-nums">
                  {metrica === "horas" ? (totalesPorBucket[k]?.horas ?? 0).toFixed(1) : (totalesPorBucket[k]?.jornadas ?? 0)}
                </div>
              ))}
              <div className="text-right tabular-nums">
                {metrica === "horas" ? totalGeneral.toFixed(1) : totalGeneral}
              </div>
            </div>
          </div>
          {rows.length > COLLAPSED && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="w-full rounded-md border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
            </button>
          )}
          <div className="text-[10px] text-muted-foreground">
            Agrupado por {bucketMode === "mes" ? "mes" : bucketMode === "dia" ? "dia" : "semana ISO"} · servicios = jornadas asignadas (pendientes + completadas); horas = solo completadas
          </div>
        </>
      )}
    </div>
  );
}

export function ClientesCompacto({
  rows, totalValue, totalFacturas, totalClientes, onSelect,
}: {
  rows: Array<{ nombre: string; total: number; facturas: number }>;
  totalValue: number;
  totalFacturas: number;
  totalClientes: number;
  onSelect: (nombre: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin clientes en el periodo.</div>;
  }
  const top5 = rows.slice(0, 5).reduce((a, r) => a + r.total, 0);
  const pctTop5 = totalValue > 0 ? Math.round((top5 / totalValue) * 100) : 0;
  const COLLAPSED = 5;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  return (
    <div>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {totalClientes} clientes · {totalFacturas} facturas · Top 5 concentra {pctTop5}%
      </div>
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {visible.map((r) => {
          const rowPct = totalValue > 0 ? Math.round((r.total / totalValue) * 100) : 0;
          return (
            <button
              key={r.nombre}
              type="button"
              onClick={() => onSelect(r.nombre)}
              className="w-full rounded-md border bg-background px-2.5 py-2 text-left shadow-sm"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold">{r.nombre}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{r.facturas} facturas - {rowPct}%</div>
              </div>
              <div className="mt-1 truncate text-[13px] font-bold tabular-nums">{money(r.total)}</div>
            </button>
          );
        })}
      </div>
      <div className={cn("hidden overflow-y-auto rounded-md border md:block", expanded ? "max-h-[440px]" : "max-h-[260px]")}>
        <div className="sticky top-0 grid grid-cols-[1fr_60px_96px_48px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>Cliente</div>
          <div className="text-right">Fact.</div>
          <div className="text-right">Facturación</div>
          <div className="text-right">%</div>
        </div>
        {visible.map((r) => {
          const rowPct = totalValue > 0 ? Math.round((r.total / totalValue) * 100) : 0;
          return (
            <button
              key={r.nombre}
              onClick={() => onSelect(r.nombre)}
              className="grid w-full grid-cols-[1fr_60px_96px_48px] items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent"
            >
              <div className="truncate font-medium">{r.nombre}</div>
              <div className="text-right tabular-nums">{r.facturas}</div>
              <div className="text-right font-semibold tabular-nums">{money(r.total)}</div>
              <div className="text-right tabular-nums text-muted-foreground">{rowPct}%</div>
            </button>
          );
        })}
      </div>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-md border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}

export function FacturacionExplorer({
  view,
  onViewChange,
  selectedFacts,
  selectedLabel,
  clientRows: _clientRows,
  periodRows: _periodRows,
  selectedPeriodKey: _selectedPeriodKey,
  isRangeSelected,
  onSelectPeriod: _onSelectPeriod,
  onSelectFullRange,
}: {
  view: "facturas" | "clientes" | "analisis";
  onViewChange: (view: "facturas" | "clientes" | "analisis") => void;
  selectedFacts: Facturacion[];
  selectedLabel: string;
  clientRows: Array<{ nombre: string; total: number; facturas: number; rows: Facturacion[] }>;
  periodRows: WeekRow[];
  selectedPeriodKey?: string;
  isRangeSelected: boolean;
  onSelectPeriod: (key: string) => void;
  onSelectFullRange: () => void;
}) {
  type PivotRowDimension = "cliente" | "sucursal" | "tipoTiempo" | "concepto" | "factura" | "codigoRepuesto";
  type PivotColumnDimension = "none" | "mes" | "sucursal" | "tipoTiempo" | "concepto";
  type PivotMetric = "usd" | "lineas" | "cantidad";

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pivotRows, setPivotRows] = useState<PivotRowDimension>("sucursal");
  const [pivotColumns, setPivotColumns] = useState<PivotColumnDimension>("mes");
  const [pivotMetric, setPivotMetric] = useState<PivotMetric>("usd");

  const rowOptions: Array<{ value: PivotRowDimension; label: string }> = [
    { value: "cliente", label: "Cliente" },
    { value: "sucursal", label: "Sucursal" },
    { value: "tipoTiempo", label: "Tipo de tiempo" },
    { value: "concepto", label: "Rubro" },
    { value: "factura", label: "Factura" },
    { value: "codigoRepuesto", label: "Repuesto" },
  ];

  const columnOptions: Array<{ value: PivotColumnDimension; label: string }> = [
    { value: "none", label: "Sin columnas" },
    { value: "mes", label: "Mes" },
    { value: "sucursal", label: "Sucursal" },
    { value: "tipoTiempo", label: "Tipo de tiempo" },
    { value: "concepto", label: "Rubro" },
  ];

  const metricOptions: Array<{ value: PivotMetric; label: string }> = [
    { value: "usd", label: "USD" },
    { value: "lineas", label: "Lineas" },
    { value: "cantidad", label: "Cantidad" },
  ];

  const cleanValue = (value: unknown) => {
    const text = String(value ?? "").trim();
    return text || null;
  };

  const repuestoCode = (row: Facturacion) => {
    const direct = cleanValue(row.codigo_fabricante) ?? cleanValue(row.cod_mercaderia);
    if (direct) return direct;
    const raw = row.raw_data ?? {};
    return (
      cleanValue(raw["Codigo Fabricante"]) ??
      cleanValue(raw["CÃƒ³digo Fabricante"]) ??
      cleanValue(raw["Cod. Fabricante"]) ??
      cleanValue(raw["Codigo Mercaderia"]) ??
      cleanValue(raw["CÃƒ³digo MercaderÃƒ­a"]) ??
      cleanValue(raw["Cod. Mercaderia"]) ??
      cleanValue(raw["Cod Mercaderia"])
    );
  };

  const repuestoNombre = (row: Facturacion) => {
    const direct = cleanValue(row.mercaderia) ?? cleanValue(row.grupo);
    if (direct) return direct;
    const raw = row.raw_data ?? {};
    return (
      cleanValue(raw["Mercaderia"]) ??
      cleanValue(raw["MercaderÃƒ­a"]) ??
      cleanValue(raw["Nombre Impresion"]) ??
      cleanValue(raw["Nombre ImpresiÃƒ³n"]) ??
      cleanValue(raw["Descripcion"]) ??
      cleanValue(raw["DescripciÃƒ³n"])
    );
  };

  const repuestoIdentity = (row: Facturacion) => {
    const fabricante = repuestoCode(row);
    const nombre = repuestoNombre(row);
    return fabricante ?? nombre ?? null;
  };

  const repuestoDetail = (row: Facturacion) => {
    const fabricante = repuestoCode(row);
    const nombre = repuestoNombre(row);
    if (fabricante && nombre && fabricante !== nombre) return `${fabricante} · ${nombre}`;
    return fabricante ?? nombre ?? "-";
  };

  const quantityLabel = (value: number) => {
    const fixed = Number(value || 0);
    if (Math.abs(fixed - Math.round(fixed)) < 0.001) return String(Math.round(fixed));
    return fixed.toFixed(1);
  };

  const metricValue = (value: { usd: number; lineas: number; cantidad: number }, metric: PivotMetric) => {
    if (metric === "lineas") return value.lineas;
    if (metric === "cantidad") return value.cantidad;
    return value.usd;
  };

  const formatMetric = (value: number, metric: PivotMetric) => {
    if (metric === "usd") return money(value);
    if (metric === "lineas") return String(Math.round(value));
    return quantityLabel(value);
  };

  const monthLabel = (date: string) => {
    const key = `${date.slice(0, 7)}-01`;
    return format(parseISO(key), "MM/yyyy");
  };

  const dimensionValue = (row: Facturacion, dimension: PivotRowDimension | PivotColumnDimension) => {
    if (dimension === "none") return { key: "__single__", label: "Total", sortKey: "__single__" };
    if (dimension === "mes") {
      const key = row.fecha.slice(0, 7);
      return { key, label: monthLabel(row.fecha), sortKey: key };
    }
    if (dimension === "cliente") {
      const label = row.entidad_nombre || "Sin cliente";
      return { key: label, label, sortKey: label };
    }
    if (dimension === "sucursal") {
      const label = row.sucursal ?? "Sin sucursal";
      return { key: label, label, sortKey: label };
    }
    if (dimension === "tipoTiempo") {
      const label = row.tipo_tiempo ?? "Cliente";
      return { key: label, label, sortKey: label };
    }
    if (dimension === "concepto") {
      const label = concept(row);
      return { key: label, label, sortKey: label };
    }
    if (dimension === "factura") {
      const label = row.cod_factura || "Sin factura";
      return { key: label, label, sortKey: label };
    }
    const label = repuestoIdentity(row) ?? "Sin repuesto";
    return { key: label, label, sortKey: label };
  };

  const invoiceRows = useMemo(() => {
    const map = new Map<string, {
      key: string;
      factura: string;
      cliente: string;
      rubro: string;
      fecha: string;
      sucursal: string;
      total: number;
      lineas: number;
      rows: Facturacion[];
      tiposTiempo: string[];
      conceptos: string[];
      repuestos: string[];
    }>();
    for (const row of selectedFacts) {
      const key = `${row.cod_factura}__${row.entidad_nombre}__${row.fecha}`;
      const current = map.get(key) ?? {
        key,
        factura: row.cod_factura || "Sin factura",
        cliente: row.entidad_nombre || "Sin cliente",
        rubro: "",
        fecha: row.fecha,
        sucursal: row.sucursal ?? "-",
        total: 0,
        lineas: 0,
        rows: [],
        tiposTiempo: [],
        conceptos: [],
        repuestos: [],
      };
      current.total += Number(row.total_venta || 0);
      current.lineas += 1;
      current.rows.push(row);
      if (row.tipo_tiempo && !current.tiposTiempo.includes(row.tipo_tiempo)) current.tiposTiempo.push(row.tipo_tiempo);
      const rowConcept = concept(row);
      if (!current.conceptos.includes(rowConcept)) current.conceptos.push(rowConcept);
      const code = repuestoCode(row);
      if (code && !current.repuestos.includes(code)) current.repuestos.push(code);
      map.set(key, current);
    }
    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        rubro: entry.conceptos.join(" / ") || "Sin rubro",
      }))
      .sort((a, b) => b.total - a.total);
  }, [selectedFacts]);

  const clientRowsComputed = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; facturas: number; rows: Facturacion[] }>();
    for (const row of selectedFacts) {
      const key = row.entidad_nombre || "Sin cliente";
      const current = map.get(key) ?? { nombre: key, total: 0, facturas: 0, rows: [] };
      current.total += Number(row.total_venta || 0);
      current.rows.push(row);
      map.set(key, current);
    }
    for (const entry of map.values()) {
      entry.facturas = new Set(entry.rows.map((row) => row.cod_factura || `${row.fecha}-${row.entidad_nombre}`)).size;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [selectedFacts]);

  const pivotSource = useMemo(() => {
    return selectedFacts.filter((row) => {
      if (pivotRows === "codigoRepuesto" && concept(row) !== "Repuestos") return false;
      if (pivotRows === "codigoRepuesto" && !repuestoIdentity(row)) return false;
      return true;
    });
  }, [pivotRows, selectedFacts]);

  const pivot = useMemo(() => {
    const columnMap = new Map<string, { key: string; label: string; sortKey: string }>();
    const rowMap = new Map<string, {
      key: string;
      label: string;
      sortKey: string;
      cells: Map<string, { usd: number; lineas: number; cantidad: number }>;
      usd: number;
      lineas: number;
      cantidad: number;
    }>();

    for (const row of pivotSource) {
      const rowValue = dimensionValue(row, pivotRows);
      const columnValue = dimensionValue(row, pivotColumns);
      if (!columnMap.has(columnValue.key)) {
        columnMap.set(columnValue.key, columnValue);
      }
      const currentRow = rowMap.get(rowValue.key) ?? {
        key: rowValue.key,
        label: rowValue.label,
        sortKey: rowValue.sortKey,
        cells: new Map<string, { usd: number; lineas: number; cantidad: number }>(),
        usd: 0,
        lineas: 0,
        cantidad: 0,
      };
      const currentCell = currentRow.cells.get(columnValue.key) ?? { usd: 0, lineas: 0, cantidad: 0 };
      currentCell.usd += Number(row.total_venta || 0);
      currentCell.lineas += 1;
      currentCell.cantidad += Number(row.cantidad || 0);
      currentRow.cells.set(columnValue.key, currentCell);
      currentRow.usd += Number(row.total_venta || 0);
      currentRow.lineas += 1;
      currentRow.cantidad += Number(row.cantidad || 0);
      rowMap.set(rowValue.key, currentRow);
    }

    const columns = Array.from(columnMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const rows = Array.from(rowMap.values()).sort((a, b) => metricValue(b, pivotMetric) - metricValue(a, pivotMetric));
    const totals = new Map<string, { usd: number; lineas: number; cantidad: number }>();
    for (const column of columns) {
      totals.set(column.key, { usd: 0, lineas: 0, cantidad: 0 });
    }
    for (const row of rows) {
      for (const column of columns) {
        const cell = row.cells.get(column.key);
        if (!cell) continue;
        const totalCell = totals.get(column.key)!;
        totalCell.usd += cell.usd;
        totalCell.lineas += cell.lineas;
        totalCell.cantidad += cell.cantidad;
      }
    }
    return { columns, rows, totals };
  }, [pivotColumns, pivotMetric, pivotRows, pivotSource]);

    const visibleTotal = selectedFacts.reduce((acc, row) => acc + Number(row.total_venta || 0), 0);
  const visibleFacturas = new Set(selectedFacts.map((row) => row.cod_factura || `${row.fecha}-${row.entidad_nombre}`)).size;
  const visibleClientes = new Set(selectedFacts.map((row) => row.entidad_nombre || "Sin cliente")).size;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">Mesa flexible de facturación</h3>
          <p className="text-[12px] text-muted-foreground">
            {selectedLabel} · explora por cliente, sucursal, tipo de tiempo, factura o repuesto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isRangeSelected && (
            <button
              type="button"
              onClick={() => {
                onSelectFullRange();
                setExpandedKey(null);
              }}
              className="h-8 rounded-md border px-3 text-[11px] font-medium text-muted-foreground hover:bg-accent"
            >
              Ver todo el rango
            </button>
          )}
          <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border text-[11px]">
            {([
              ["facturas", "Facturas"],
              ["clientes", "Clientes"],
              ["analisis", "Analisis"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onViewChange(value);
                  setExpandedKey(null);
                }}
                className={cn("px-3 hover:bg-accent", view === value && "bg-primary text-primary-foreground hover:bg-primary")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "facturas" && (
        <>
          <div className="space-y-2 md:hidden">
            {invoiceRows.length === 0 ? (
              <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin facturas en el período seleccionado.</div>
            ) : (
              invoiceRows.slice(0, 30).map((row) => (
                <div key={row.key} className="rounded-md border bg-background shadow-sm">
                  <button type="button" onClick={() => setExpandedKey((current) => current === row.key ? null : row.key)} className="w-full px-3 py-2.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] font-semibold text-muted-foreground">{row.factura}</div>
                        <div className="truncate text-[13px] font-semibold">{row.cliente}</div>
                        <div className="text-[10px] text-muted-foreground">{row.sucursal} · {format(parseISO(row.fecha), "dd/MM/yy")}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-bold tabular-nums">{money(row.total)}</div>
                        <div className="text-[10px] text-muted-foreground">{row.lineas} lineas</div>
                      </div>
                    </div>
                  </button>
                  {expandedKey === row.key && (
                    <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                      <div className="mb-2 flex flex-wrap gap-1">
                        {row.tiposTiempo.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
                        {row.conceptos.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
                      </div>
                      <div className="space-y-1">
                        {row.rows.map((detail, index) => {
                          const code = repuestoCode(detail);
                          return (
                            <div key={`${row.key}-${index}`} className="rounded-md border bg-muted/20 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-foreground">{concept(detail)} · {detail.tipo_tiempo ?? "-"}</div>
                                  <div className="truncate">{repuestoDetail(detail)}</div>
                                </div>
                                <div className="shrink-0 tabular-nums text-foreground">{money(Number(detail.total_venta || 0))}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-hidden rounded-md border md:block">
            <div className="grid grid-cols-[110px_1.15fr_140px_90px_90px_80px_120px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Factura</div>
              <div>Cliente</div>
              <div>Rubro</div>
              <div>Fecha</div>
              <div>Sucursal</div>
              <div className="text-right">Lineas</div>
              <div className="text-right">Importe</div>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {invoiceRows.length === 0 ? (
                <div className="px-3 py-10 text-center text-[12px] text-muted-foreground">Sin facturas en el período seleccionado.</div>
              ) : (
                invoiceRows.map((row) => (
                  <div key={row.key} className="border-t">
                    <button type="button" onClick={() => setExpandedKey((current) => current === row.key ? null : row.key)} className="grid w-full grid-cols-[110px_1.15fr_140px_90px_90px_80px_120px] items-center px-3 py-2 text-left text-[12px] hover:bg-accent">
                      <div className="truncate font-mono font-semibold">{row.factura}</div>
                      <div className="truncate font-medium">{row.cliente}</div>
                      <div className="truncate text-muted-foreground">{row.rubro}</div>
                      <div className="tabular-nums">{format(parseISO(row.fecha), "dd/MM/yy")}</div>
                      <div className="truncate">{row.sucursal}</div>
                      <div className="text-right tabular-nums">{row.lineas}</div>
                      <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
                    </button>
                    {expandedKey === row.key && (
                      <div className="bg-muted/20 px-3 py-2 text-[12px]">
                        <div className="mb-2 flex flex-wrap gap-1">
                          {row.tiposTiempo.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}
                          {row.conceptos.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}
                        </div>
                        <div className="grid grid-cols-[1fr_140px_90px_120px] gap-2 text-[11px] font-medium text-muted-foreground">
                          <div>Concepto</div>
                          <div>Codigo / detalle</div>
                          <div className="text-right">Cantidad</div>
                          <div className="text-right">Importe</div>
                        </div>
                        <div className="mt-1 space-y-1">
                          {row.rows.map((detail, index) => {
                            const code = repuestoCode(detail);
                            return (
                              <div key={`${row.key}-${index}`} className="grid grid-cols-[1fr_140px_90px_120px] gap-2 text-[11px] text-muted-foreground">
                                <div className="truncate">{concept(detail)} · {detail.tipo_tiempo ?? "-"}</div>
                                <div className="truncate">{repuestoDetail(detail)}</div>
                                <div className="text-right tabular-nums">{quantityLabel(Number(detail.cantidad || 0))}</div>
                                <div className="text-right font-medium tabular-nums text-foreground">{money(Number(detail.total_venta || 0))}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {view === "clientes" && (
        <>
          <div className="space-y-2 md:hidden">
            {clientRowsComputed.length === 0 ? (
              <div className="rounded-md border px-3 py-6 text-center text-[12px] text-muted-foreground">Sin clientes facturados en el periodo.</div>
            ) : (
              clientRowsComputed.slice(0, 30).map((row) => (
                <div key={row.nombre} className="rounded-md border bg-background shadow-sm">
                  <button type="button" onClick={() => setExpandedKey((current) => current === row.nombre ? null : row.nombre)} className="w-full px-3 py-2.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold">{row.nombre}</div>
                        <div className="text-[10px] text-muted-foreground">{row.facturas} facturas</div>
                      </div>
                      <div className="shrink-0 text-[13px] font-bold tabular-nums">{money(row.total)}</div>
                    </div>
                  </button>
                  {expandedKey === row.nombre && (
                    <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                      {row.rows.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((detail, index) => {
                        const code = repuestoCode(detail);
                        return (
                          <div key={`${row.nombre}-${index}`} className="flex items-center justify-between gap-2 py-1">
                            <span className="truncate">{detail.cod_factura} · {concept(detail)} · {repuestoDetail(detail)}</span>
                            <span className="shrink-0 tabular-nums">{money(Number(detail.total_venta || 0))}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-hidden rounded-md border md:block">
            <div className="grid grid-cols-[1.4fr_84px_120px_110px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Cliente</div>
              <div className="text-right">Fact.</div>
              <div className="text-right">Ticket prom.</div>
              <div className="text-right">Facturación</div>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {clientRowsComputed.length === 0 ? (
                <div className="px-3 py-10 text-center text-[12px] text-muted-foreground">Sin clientes facturados en el periodo.</div>
              ) : (
                clientRowsComputed.map((row) => (
                  <div key={row.nombre} className="border-t">
                    <button type="button" onClick={() => setExpandedKey((current) => current === row.nombre ? null : row.nombre)} className="grid w-full grid-cols-[1.4fr_84px_120px_110px] items-center px-3 py-2 text-left text-[12px] hover:bg-accent">
                      <div className="truncate font-medium">{row.nombre}</div>
                      <div className="text-right tabular-nums">{row.facturas}</div>
                      <div className="text-right tabular-nums">{money(row.facturas ? row.total / row.facturas : 0)}</div>
                      <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
                    </button>
                    {expandedKey === row.nombre && (
                      <div className="bg-muted/20 px-3 py-2 text-[12px]">
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">Facturas del cliente en el periodo</div>
                        {row.rows.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((detail, index) => {
                          const code = repuestoCode(detail);
                          return (
                            <div key={`${row.nombre}-${index}`} className="grid grid-cols-[90px_1fr_110px] gap-2 py-0.5 text-[11px]">
                              <div className="font-mono text-muted-foreground">{detail.cod_factura}</div>
                              <div className="truncate text-muted-foreground">{concept(detail)} · {detail.sucursal ?? "-"} · {repuestoDetail(detail)}</div>
                              <div className="text-right font-medium tabular-nums">{money(Number(detail.total_venta || 0))}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {view === "analisis" && (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border p-3 lg:grid-cols-[1.2fr_1.2fr_0.9fr]">
            <label className="space-y-2">
              <span className={filterLabel}>Filas</span>
              <select value={pivotRows} onChange={(e) => setPivotRows(e.target.value as PivotRowDimension)} className="h-9 w-full rounded-md border bg-background px-3 text-[13px] outline-none focus:border-primary">
                {rowOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={filterLabel}>Columnas</span>
              <select value={pivotColumns} onChange={(e) => setPivotColumns(e.target.value as PivotColumnDimension)} className="h-9 w-full rounded-md border bg-background px-3 text-[13px] outline-none focus:border-primary">
                {columnOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={filterLabel}>Medida</span>
              <select value={pivotMetric} onChange={(e) => setPivotMetric(e.target.value as PivotMetric)} className="h-9 w-full rounded-md border bg-background px-3 text-[13px] outline-none focus:border-primary">
                {metricOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div>
                <div className="text-[13px] font-semibold">Tabla dinamica</div>
                <div className="text-[12px] text-muted-foreground">Configurable por fila, columna y medida. En repuestos prioriza fabricante y descripcion.</div>
              </div>
              <Badge variant="secondary">{pivot.rows.length} filas</Badge>
            </div>

            {pivot.rows.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">No hay datos para la combinacion elegida.</div>
            ) : (
              <>
                <div className="space-y-2 p-3 md:hidden">
                  {pivot.rows.slice(0, 25).map((row) => (
                    <div key={row.key} className="rounded-md border bg-background px-3 py-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-[13px] font-semibold">{row.label}</div>
                        <div className="shrink-0 text-[13px] font-bold tabular-nums">{formatMetric(metricValue(row, pivotMetric), pivotMetric)}</div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {pivot.columns.map((column) => {
                          const cell = row.cells.get(column.key);
                          if (!cell) return null;
                          return (
                            <div key={`${row.key}-${column.key}`} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                              <span>{column.label}</span>
                              <span className="shrink-0 tabular-nums text-foreground">{formatMetric(metricValue(cell, pivotMetric), pivotMetric)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <div className="min-w-max">
                    <div
                      className="grid items-center border-b bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"
                      style={{ gridTemplateColumns: `240px repeat(${Math.max(pivot.columns.length, 1)}, minmax(120px, 1fr)) 140px` }}
                    >
                      <div>{rowOptions.find((option) => option.value === pivotRows)?.label ?? "Fila"}</div>
                      {pivot.columns.map((column) => (
                        <div key={column.key} className="text-right">{column.label}</div>
                      ))}
                      <div className="text-right">Total</div>
                    </div>
                    <div className="max-h-[520px] overflow-y-auto">
                      {pivot.rows.map((row) => (
                        <div
                          key={row.key}
                          className="grid items-center border-b px-3 py-2 text-[12px]"
                          style={{ gridTemplateColumns: `240px repeat(${Math.max(pivot.columns.length, 1)}, minmax(120px, 1fr)) 140px` }}
                        >
                          <div className="truncate font-medium">{row.label}</div>
                          {pivot.columns.map((column) => {
                            const cell = row.cells.get(column.key);
                            return (
                              <div key={`${row.key}-${column.key}`} className="text-right tabular-nums text-muted-foreground">
                                {cell ? formatMetric(metricValue(cell, pivotMetric), pivotMetric) : "-"}
                              </div>
                            );
                          })}
                          <div className="text-right font-semibold tabular-nums">{formatMetric(metricValue(row, pivotMetric), pivotMetric)}</div>
                        </div>
                      ))}
                    </div>
                    <div
                      className="grid items-center bg-muted/30 px-3 py-2 text-[12px] font-semibold"
                      style={{ gridTemplateColumns: `240px repeat(${Math.max(pivot.columns.length, 1)}, minmax(120px, 1fr)) 140px` }}
                    >
                      <div>Total</div>
                      {pivot.columns.map((column) => {
                        const cell = pivot.totals.get(column.key) ?? { usd: 0, lineas: 0, cantidad: 0 };
                        return (
                          <div key={`total-${column.key}`} className="text-right tabular-nums">
                            {formatMetric(metricValue(cell, pivotMetric), pivotMetric)}
                          </div>
                        );
                      })}
                      <div className="text-right tabular-nums">{formatMetric(metricValue({
                        usd: pivotSource.reduce((acc, row) => acc + Number(row.total_venta || 0), 0),
                        lineas: pivotSource.length,
                        cantidad: pivotSource.reduce((acc, row) => acc + Number(row.cantidad || 0), 0),
                      }, pivotMetric), pivotMetric)}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export function TrabajoChip({
  label, value, tone = "neutral", onClick,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] hover:bg-accent",
        tone === "good" && "border-primary/30 bg-primary/5 text-primary",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </button>
  );
}

const servicioMoney = (value: number) =>
  `USD ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Number(value || 0))}`;

export function ServiciosDashboard({
  data,
  loading,
  selectedTecnicos,
  onSelectTecnico,
}: {
  data: ServiciosDashboardData;
  loading: boolean;
  selectedTecnicos: string[];
  onSelectTecnico: (tecnico: string) => void;
}) {
  if (loading) {
    return <div className="rounded-md border px-3 py-10 text-center text-[12px] text-muted-foreground">Cargando servicios...</div>;
  }

  const maxTecnico = Math.max(...data.tecnicos.map((row) => row.totalOS), 1);
  const totalMixTiempo = data.mixTiempo.reduce((sum, row) => sum + row.total, 0);

  const kpis = [
    { label: "OS del periodo", value: String(data.totalOS), detail: `${data.cerradas} cerradas · ${data.abiertas} abiertas`, icon: Wrench },
    { label: "OS cerradas", value: String(data.cerradas), detail: data.totalOS > 0 ? `${Math.round((data.cerradas / data.totalOS) * 100)}% del total` : "Sin OS en el periodo", icon: Receipt },
    { label: "OS abiertas", value: String(data.abiertas), detail: data.otras > 0 ? `${data.otras} canceladas o anuladas` : "Pendientes de cierre", icon: Clock3 },
    { label: "Sin responsable", value: String(data.sinResponsable), detail: "OS que requieren asignación", icon: Users },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="relative min-h-[92px] rounded-md border bg-card p-3">
              <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className={cn("pr-10", cardLabel)}>{kpi.label}</div>
              <div className="mt-2 text-[18px] font-extrabold leading-tight tabular-nums">{kpi.value}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">{kpi.detail}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-card px-3 py-2.5">
          <div className={cardLabel}>Horas registradas</div>
          <div className="mt-1 font-semibold tabular-nums">{data.horas.toFixed(1).replace(".0", "")} hs</div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2.5">
          <div className={cardLabel}>Kilómetros registrados</div>
          <div className="mt-1 font-semibold tabular-nums">{Math.round(data.km).toLocaleString("es-PY")} km</div>
        </div>
        <div className="rounded-md border bg-card px-3 py-2.5">
          <div className={cardLabel}>Valor registrado en OS</div>
          <div className="mt-1 font-semibold tabular-nums">{servicioMoney(data.valorOS)}</div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-md border bg-card p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[13px] font-semibold">Órdenes por responsable</h2>
              <p className="text-[12px] text-muted-foreground">Carga y estado de las OS asignadas</p>
            </div>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-2.5">
            {data.tecnicos.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-muted-foreground">Sin órdenes de servicio para los filtros actuales.</div>
            ) : data.tecnicos.slice(0, 12).map((row) => {
              const active = selectedTecnicos.includes(row.tecnico);
              return (
                <button
                  type="button"
                  key={row.tecnico}
                  onClick={() => onSelectTecnico(row.tecnico)}
                  className={cn("w-full rounded-md px-2 py-1.5 text-left hover:bg-accent", active && "bg-primary/5 ring-1 ring-primary/30")}
                >
                  <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                    <span className="min-w-0 truncate font-medium">{row.tecnico}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{row.totalOS} OS</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((row.totalOS / maxTecnico) * 100, 1)}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {row.cerradas} cerradas · {row.abiertas} abiertas · {row.horas.toFixed(1).replace(".0", "")} hs · {Math.round(row.km)} km
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border bg-card p-3">
            <h2 className="text-[13px] font-semibold">Tipo de tiempo</h2>
            <p className="mb-3 text-[12px] text-muted-foreground">Cantidad de OS por clasificación</p>
            <div className="space-y-2">
              {data.mixTiempo.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between gap-3 text-[12px]">
                    <span>{row.label}</span>
                    <span className="font-medium tabular-nums">{row.total} OS</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-sky-500" style={{ width: `${totalMixTiempo > 0 ? (row.total / totalMixTiempo) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-card p-3">
            <h2 className="text-[13px] font-semibold">Estados de las OS</h2>
            <p className="mb-3 text-[12px] text-muted-foreground">Situación informada en el sistema de origen</p>
            <div className="space-y-2">
              {data.estados.map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between gap-3 text-[12px]">
                    <span>{row.label}</span>
                    <span className="font-medium tabular-nums">{row.total} OS</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${data.totalOS > 0 ? (row.total / data.totalOS) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold">Detalle por orden de servicio</h2>
            <p className="text-[12px] text-muted-foreground">Todas las OS abiertas en el periodo y su estado actual</p>
          </div>
          <Badge variant="secondary">{data.ordenes.length} OS</Badge>
        </div>

        <div className="space-y-2 md:hidden">
          {data.ordenes.slice(0, 30).map((row) => (
            <div key={row.key} className="rounded-md border p-3 text-[12px]">
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono font-semibold">{row.os}</div>
                <Badge variant="outline">{row.estadoOS}</Badge>
              </div>
              <div className="mt-1 font-medium">{row.cliente}</div>
              <div className="mt-1 text-muted-foreground">{row.tecnico} · {row.sucursal ?? "Sin sucursal"}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline">{row.tipoTiempo || "Sin tipo"}</Badge>
                <Badge variant="outline">{row.fechaApertura || "Sin fecha"}</Badge>
                <Badge variant="outline">{row.horas.toFixed(1).replace(".0", "")} hs</Badge>
                <Badge variant="outline">{Math.round(row.km)} km</Badge>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden max-h-[430px] overflow-auto rounded-md border md:block">
          <table className="w-full min-w-[920px] text-[12px]">
            <thead className={cn("sticky top-0 bg-muted/90 text-left", tableHeadText)}>
              <tr>
                <th className="px-3 py-2">OS</th>
                <th className="px-3 py-2">Técnico</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Sucursal</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Apertura</th>
                <th className="px-3 py-2">Estado OS</th>
                <th className="px-3 py-2">Factura</th>
                <th className="px-3 py-2 text-right">Hs</th>
                <th className="px-3 py-2 text-right">Km</th>
                <th className="px-3 py-2 text-right">Valor OS</th>
              </tr>
            </thead>
            <tbody>
              {data.ordenes.map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="px-3 py-2 font-mono font-semibold">{row.os}</td>
                  <td className="max-w-[190px] truncate px-3 py-2" title={row.tecnico}>{row.tecnico}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={row.cliente}>{row.cliente}</td>
                  <td className="px-3 py-2">{row.sucursal ?? "-"}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{row.tipoTiempo || "Sin tipo"}</Badge></td>
                  <td className="px-3 py-2 tabular-nums">{row.fechaApertura || "-"}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{row.estadoOS}</Badge></td>
                  <td className="max-w-[180px] truncate px-3 py-2" title={row.factura}>{row.factura || "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.horas.toFixed(1).replace(".0", "")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(row.km)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{servicioMoney(row.valorOS)}</td>
                </tr>
              ))}
              {data.ordenes.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">Sin órdenes de servicio para los filtros actuales.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}








