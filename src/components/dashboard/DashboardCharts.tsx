import { useEffect, useRef, useState } from "react";
import { format, getDay, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Activity, Building2, CalendarDays, FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Marca, Sucursal } from "@/lib/constants";
import type { WeekRow, OSImpactRow, OSRubro, FactMetric, OSMetric, PeriodMode } from "./types";
import {
  money,
  pct,
  formatWeekMetric,
  formatFactMetric,
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Cargando detalle OS...</div>;
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
            <div className="text-xs font-semibold">OS por sucursal</div>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <OSSucursalBars rows={sucursalRows} totalValue={selectedSummary.total} metric={metric} comparisonLabel={comparisonLabel} onSelect={onSelectSucursal} />
        </div>
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">{detailMode === "os" ? "Detalle por OS" : "Detalle por cliente"}</div>
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
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Impacto OS</div>
          <div className="mt-1 text-xl font-bold tabular-nums">{formatOSMetric(selectedValue, metric)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{summary.osCount} OS cerradas</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Servicio</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{money(summary.servicios)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formatOSMetric(summary.horas, "horas")}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Kilometraje</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{money(summary.kilometraje)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formatOSMetric(summary.km, "km")}</div>
        </div>
        <div className="rounded-md border px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Repuestos</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{money(summary.repuestos)}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">incluido en impacto OS</div>
        </div>
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Acumulado visible</div>
            <div className="text-[11px] text-muted-foreground">{accumulatedRange}</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-lg font-bold tabular-nums">{formatOSMetric(accumulatedValue, metric)}</div>
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin OS absorbidas.</div>;
  }
  return (
    <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-1">
      <div
        className="grid min-h-[170px] shrink-0 items-end gap-1 border-b px-0.5 pt-3 sm:min-h-[210px] sm:gap-3 sm:px-2 sm:pt-4"
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
              <span className="flex h-[130px] w-full items-end justify-center sm:h-[150px]">
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
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase text-muted-foreground">
        <button type="button" onClick={onClear} className="hover:text-primary">
          Mix OS absorbido
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin OS absorbidas por sucursal.</div>;
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
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
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
        <div className="rounded-md border px-3 py-2 text-center text-xs text-muted-foreground md:hidden">
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin OS absorbidas en el periodo.</div>;
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
              <div className="truncate text-xs font-semibold">{row.cliente}</div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.os.size} OS - {Array.from(row.sucursales).join(", ") || "Sin sucursal"}</div>
            </div>
            <div className="mt-1 text-sm font-bold tabular-nums">{formatOSMetric(osMetricValue(row, metric), metric)}</div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>Serv. {money(row.servicios)}</span>
              <span>Rep. {money(row.repuestos)}</span>
              <span>Km {money(row.kilometraje)}</span>
            </div>
          </button>
        ))}
        {grouped.length > 5 && <div className="col-span-2 rounded-md border px-3 py-2 text-center text-xs text-muted-foreground">Mostrando 5 de {grouped.length} clientes</div>}
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
            className="grid w-full grid-cols-[minmax(0,1fr)_72px_82px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent sm:grid-cols-[minmax(0,1fr)_72px_86px_86px]"
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
              <div className="truncate text-xs font-semibold">{row.cliente}</div>
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
      {rows.length > 5 && <div className="rounded-md border px-3 py-2 text-center text-xs text-muted-foreground">Mostrando 5 de {rows.length} OS</div>}
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
          className="grid w-full grid-cols-[72px_minmax(0,1fr)_82px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent sm:grid-cols-[72px_minmax(0,1fr)_86px_86px]"
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
    <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-1">
      <div
        className="relative grid min-h-[218px] shrink-0 items-end gap-1 border-b px-0.5 pt-3 sm:min-h-[260px] sm:gap-3 sm:px-2 sm:pt-4"
        style={barGridStyle(rows.length, 62)}
      >
        {rows.map((row, index) => {
          const value = weekMetric(row, metric);
          const comparison = comparisonWeekMetric(row, metric);
          const unavailable = metricUnavailable(row, metric);
          const height = unavailable || value <= 0 ? 0 : Math.max(6, Math.round((value / max) * 150));
          const comparisonBottom = comparison > 0 ? Math.max(4, Math.round((comparison / max) * 150)) : 0;
          const active = row.key === activeKey;
          const showLabel = index === 0 || index === rows.length - 1 || index % labelEvery === 0;
          return (
            <button key={row.key} onClick={() => onSelect(row.key)} className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:gap-2">
              <span className="max-w-full truncate text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">{formatWeekMetric(row, metric)}</span>
              <span className="relative flex h-[150px] w-full items-end justify-center sm:h-[180px]">
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
        {metric === "usd" ? "Facturacion ($)" : metric === "horasServicio" ? "Horas servicio facturadas" : "Km facturados"}
        <span className="ml-3 h-0 w-8 max-w-[42px] border-t-2 border-red-500" />
        {hasAnyComparisonData ? "Año anterior equivalente" : "Año anterior: sin datos disponibles"}
      </div>
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin movimiento por sucursal.</div>;
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
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin clientes en el periodo.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row, index) => {
        const width = Math.max(4, Math.round((row.total / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.nombre} onClick={() => onSelect(row.nombre)} className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent">
            <div className="flex items-center justify-between gap-3 text-xs">
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
          <button key={row.estado} onClick={() => onSelect(row.estado)} className="grid w-full grid-cols-[96px_1fr_72px_52px] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin trabajos por sucursal.</div>;
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const totalRow = row.activos + row.cerrados;
        const width = Math.max(4, Math.round((totalRow / max) * 100));
        return (
          <button key={row.sucursal} onClick={() => onSelect(row.sucursal)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
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
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin actividad tecnica en el periodo seleccionado.</div>;
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
        <div key={row.id} className="grid grid-cols-[1fr_74px_74px_74px] items-center border-t px-3 py-2 text-xs">
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
  if (!row) return <div className="text-xs text-muted-foreground">Sin datos.</div>;
  if (rubroFiltro !== "all") {
    const valor = rubroFiltro === "Repuestos" ? row.repuestos
      : rubroFiltro === "Servicio" ? row.servicio
      : rubroFiltro === "Kilometraje" ? row.kilometraje
      : row.otros;
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Rubro</div>
            <div className="text-sm font-semibold">{rubroFiltro}</div>
          </div>
          <div className="text-base font-bold tabular-nums">{money(valor)}</div>
        </div>
      </div>
    );
  }
  const items: Array<{ label: string; value: number; bar: string; dot: string }> = [
    { label: "Repuestos", value: row.repuestos, bar: "bg-primary", dot: "bg-primary" },
    { label: "Servicios", value: row.servicio, bar: "bg-sky-500/80", dot: "bg-sky-500" },
    { label: "Kilometraje", value: row.kilometraje, bar: "bg-amber-500/80", dot: "bg-amber-500" },
    { label: "Otros", value: row.otros, bar: "bg-slate-400/80", dot: "bg-slate-400" },
  ];
  const total = row.total || 1;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
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
  tecnicosAsignados,
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
  tecnicosAsignados?: number;
  jornadasPlanificadas?: number;
  planificacionRango?: string;
  jornadasPrev?: number;
  horasPrev?: number;
  tecnicosCierreAnterior?: number;
  cierreAnteriorRango?: string;
}) {
  if (flujo.total === 0) {
    return (
      <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">
        Sin trabajos en el periodo seleccionado.
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
            <span className="text-2xl font-bold tabular-nums leading-none">{flujo.total}</span>
            <span className="mt-0.5 text-[10px] uppercase text-muted-foreground">gestionados</span>
          </button>
        </div>

        <div className="min-w-0 rounded-md border">
          {segs.map((s) => (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className="grid w-full grid-cols-[1fr_54px_48px] items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0 hover:bg-muted/50"
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
            title="ABIERTOS"
            titleClassName="text-sky-700"
            iconClassName="bg-sky-500/10 text-sky-700"
            value={`${flujo.abiertos} trabajos`}
            detail={`${flujo.pendiente} pendientes · ${flujo.programado} programados · ${flujo.iniciado} iniciados`}
            onClick={() => onSelect("iniciado")}
          />
          <EstadoMiniCard
            icon={CalendarDays}
            title="PRÓXIMO PERIODO"
            subtitle={planificacionRango}
            value={`${jornadasPlanificadas ?? 0} jornadas`}
          />
          <EstadoMiniCard
            icon={Activity}
            title="CIERRE ANTERIOR"
            subtitle={jornadasPrev ? cierreAnteriorRango : undefined}
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
    <div className="flex h-full flex-col rounded-md border bg-background p-3 text-left shadow-sm">
      <div className="mb-3 flex items-start gap-2">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary", iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className={cn("text-[10px] font-bold uppercase tracking-wide text-primary", titleClassName)}>{title}</div>
          {subtitle ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
      </div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      {detail ? <div className="mt-2 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className="h-full hover:opacity-90">
      {content}
    </button>
  ) : content;
}

export function CargaSucursalTabla({
  rows, onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; cerrados: number; abiertos: number; pausados: number; total: number; pct: number }>;
  onSelect: (sucursal: Sucursal) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin trabajos por sucursal.</div>;
  }
  return (
    <>
    <div className="grid grid-cols-2 gap-2 md:hidden">
      {rows.slice(0, 5).map((r) => (
        <button
          key={r.sucursal}
          type="button"
          onClick={() => onSelect(r.sucursal)}
          className="w-full rounded-md border bg-background px-2.5 py-2 text-left shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-xs font-semibold">{r.sucursal}</div>
            <div className="shrink-0 text-sm font-bold tabular-nums">{r.total}</div>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>Cerr. {r.cerrados}</span>
            <span>Ab. {r.abiertos}</span>
            <span>Paus. {r.pausados}</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, r.pct)}%` }} />
          </div>
        </button>
      ))}
      {rows.length > 5 && (
        <div className="col-span-2 rounded-md border px-3 py-2 text-center text-xs text-muted-foreground">
          Mostrando 5 de {rows.length} sucursales
        </div>
      )}
    </div>
    <div className="hidden rounded-md border md:block">
      <div className="grid grid-cols-[1fr_70px_70px_70px_60px_56px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <div>Sucursal</div>
        <div className="text-right">Cerrados</div>
        <div className="text-right">Abiertos</div>
        <div className="text-right">Pausados</div>
        <div className="text-right">Total</div>
        <div className="text-right">%</div>
      </div>
      {rows.map((r) => (
        <button
          key={r.sucursal}
          onClick={() => onSelect(r.sucursal)}
          className="grid w-full grid-cols-[1fr_70px_70px_70px_60px_56px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
        >
          <div className="truncate font-medium">{r.sucursal}</div>
          <div className="text-right tabular-nums">{r.cerrados}</div>
          <div className="text-right tabular-nums">{r.abiertos}</div>
          <div className="text-right tabular-nums">{r.pausados}</div>
          <div className="text-right font-semibold tabular-nums">{r.total}</div>
          <div className="text-right tabular-nums text-muted-foreground">{r.pct}%</div>
        </button>
      ))}
    </div>
    </>
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
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin actividad por marca en el periodo.</div>;
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
              <div className="flex items-center justify-between text-xs">
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

export function CargaEquipoChart({
  data,
}: {
  data: {
    buckets: string[];
    allRows: Array<{ porBucket: Record<string, { jornadas: number; horas: number }> }>;
    trabajosPorBucket: Record<string, number>;
    bucketLabel: (k: string) => string;
    bucketMode: PeriodMode;
  };
}) {
  const { buckets, allRows, trabajosPorBucket, bucketLabel, bucketMode } = data;
  const n = buckets.length;

  const isSunday = (k: string) => bucketMode === "dia" && getDay(parseISO(k)) === 0;

  const trabajos = buckets.map((k) => trabajosPorBucket[k] ?? 0);
  const techs = buckets.map((k) =>
    allRows.filter((r) => (r.porBucket[k]?.jornadas ?? 0) > 0).length
  );

  // Stepped scale: round up to next multiple of 5 (min 5)
  const rawMax = Math.max(0, ...trabajos, ...techs);
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
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground sm:text-[11px]">
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/75" />
          Trabajos
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400/90" />
          Técnicos activos
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
        <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin datos para los filtros seleccionados.</div>
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
                    <div className="shrink-0 text-sm font-bold tabular-nums">
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
                className="grid w-full items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
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
            Agrupado por {bucketMode === "mes" ? "mes" : bucketMode === "dia" ? "día" : "semana ISO"} · servicios = jornadas asignadas (pendientes + completadas); horas = solo completadas
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
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin clientes en el periodo.</div>;
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
                <div className="truncate text-xs font-semibold">{r.nombre}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{r.facturas} facturas - {rowPct}%</div>
              </div>
              <div className="mt-1 truncate text-sm font-bold tabular-nums">{money(r.total)}</div>
            </button>
          );
        })}
      </div>
      <div className={cn("hidden overflow-y-auto rounded-md border md:block", expanded ? "max-h-[440px]" : "max-h-[260px]")}>
        <div className="sticky top-0 grid grid-cols-[1fr_60px_96px_48px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>Cliente</div>
          <div className="text-right">Fact.</div>
          <div className="text-right">Facturacion</div>
          <div className="text-right">%</div>
        </div>
        {visible.map((r) => {
          const rowPct = totalValue > 0 ? Math.round((r.total / totalValue) * 100) : 0;
          return (
            <button
              key={r.nombre}
              onClick={() => onSelect(r.nombre)}
              className="grid w-full grid-cols-[1fr_60px_96px_48px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
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

