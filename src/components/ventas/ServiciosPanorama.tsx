/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { endOfDay, endOfISOWeek, endOfMonth, endOfYear, format, subDays, subMonths, subWeeks, subYears } from "date-fns";
import { serviceSalesError } from "@/lib/serviceSalesError";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/layout/AppPrimitives";
import { money, pct } from "@/components/dashboard/utils";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";

export type ServiciosSummary = { total: number; facturas: number; clientes: number; ordenes: number; promedio: number };
type PeriodoPanorama = {
  periodo: string; total: number; mo: number; km: number; repuestos: number; terceros: number;
  facturas: number; clientes: number; metodologia: "historico" | "actual" | "mixto";
};
type PanoramaResponse = { desde: string; hasta: string; agrupacion: PeriodMode; resumen: ServiciosSummary; periodos: PeriodoPanorama[] };
const PANORAMA_GRID = "grid-cols-[minmax(120px,1.25fr)_minmax(105px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(95px,1fr)_minmax(85px,1fr)_minmax(75px,0.85fr)_minmax(75px,0.85fr)_minmax(95px,0.95fr)_minmax(95px,0.95fr)_minmax(85px,0.9fr)]";
const iso = (date: Date) => format(date, "yyyy-MM-dd");
const shift = (value: string, mode: PeriodMode, amount: number) => {
  const date = new Date(`${value}T00:00:00`);
  const shifted = mode === "dia" ? subDays(date, amount) : mode === "semana" ? subWeeks(date, amount) : mode === "anio" ? subYears(date, amount) : subMonths(date, amount);
  return iso(shifted);
};

function periodEnd(iso: string, mode: PeriodMode) {
  const date = new Date(`${iso}T00:00:00`);
  if (mode === "dia") return endOfDay(date);
  if (mode === "semana") return endOfISOWeek(date);
  if (mode === "anio") return endOfYear(date);
  return endOfMonth(date);
}
function periodLabel(iso: string, mode: PeriodMode) {
  const date = new Date(`${iso}T00:00:00`);
  if (mode === "dia") return new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short" }).format(date);
  if (mode === "semana") return `Sem. ${new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "short" }).format(date)}`;
  if (mode === "anio") return String(date.getFullYear());
  return new Intl.DateTimeFormat("es-PY", { month: "short", year: "numeric" }).format(date);
}

export function ServiciosPanorama({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", periodMode, selectedPeriod, onSelectPeriod, onSummary }: {
  desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string; periodMode: PeriodMode;
  selectedPeriod: string | null; onSelectPeriod: (periodo: string | null) => void;
  onSummary?: (summary: ServiciosSummary | null) => void;
}) {
  const [data, setData] = useState<PanoramaResponse | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState<PanoramaResponse | null>(null);
  const [previousYear, setPreviousYear] = useState<PanoramaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null); onSummary?.(null);
    const params = (from: string, to: string) => ({
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo, p_agrupacion: periodMode, p_buscar: buscar.trim() || null,
      p_desde: from, p_hasta: to,
    });
    const priorFrom = shift(desde, periodMode, 1);
    const priorTo = shift(hasta, periodMode, 1);
    Promise.all([
      (supabase as any).rpc("ventas_servicios_panorama_v2", params(desde, hasta)),
      (supabase as any).rpc("ventas_servicios_panorama_v2", params(priorFrom, priorTo)),
      (supabase as any).rpc("ventas_servicios_panorama_v2", params(iso(subYears(new Date(`${desde}T00:00:00`), 1)), iso(subYears(new Date(`${hasta}T00:00:00`), 1)))),
    ]).then(([currentResult, priorResult, yearResult]: any[]) => {
      if (!alive) return;
      const rpcError = currentResult.error || priorResult.error || yearResult.error;
      if (rpcError) { setError(serviceSalesError(rpcError)); setData(null); setPreviousPeriod(null); setPreviousYear(null); onSummary?.(null); }
      else { const next = currentResult.data as PanoramaResponse; setData(next); setPreviousPeriod(priorResult.data as PanoramaResponse); setPreviousYear(yearResult.data as PanoramaResponse); onSummary?.(next.resumen); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [buscar, desde, hasta, onSummary, periodMode, sucursal, tipoTiempo, marca, tipoMaquina]);

  const rows = useMemo(() => (data?.periodos ?? []).map((row, index, all) => {
    const previousKey = shift(row.periodo, periodMode, 1);
    const previous = index > 0 ? all[index - 1] : previousPeriod?.periodos.find((item) => item.periodo === previousKey) ?? null;
    const lastYearKey = shift(row.periodo, "anio", 1);
    const lastYear = previousYear?.periodos.find((item) => item.periodo === lastYearKey) ?? null;
    const complete = periodEnd(row.periodo, periodMode) < new Date();
    const variationLm = previous && complete && previous.metodologia === row.metodologia
      ? pct(row.total, previous.total)
      : null;
    const variationLy = lastYear && complete && lastYear.metodologia === row.metodologia
      ? pct(row.total, lastYear.total)
      : null;
    return { ...row, variationLm, variationLy, complete };
  }), [data, periodMode, previousPeriod, previousYear]);

  return <Panel className="p-3">
    <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex w-full items-start justify-between gap-2 text-left">
      <h2 className="text-[13px] font-semibold">Facturación por período</h2>
      <div className="flex items-center gap-2">{selectedPeriod && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelectPeriod(null); }} className="rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</span>}{collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}</div>
    </button>
    {!collapsed && (loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando panorama…</div>
      : error ? <div className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : !rows.length ? <div className="py-8 text-center text-[12px] text-muted-foreground">No hay datos para este rango.</div>
      : <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[1060px]">
        <div className={`grid ${PANORAMA_GRID} bg-muted/60 px-2 py-2 text-[11px] font-medium text-muted-foreground`}>
          <div>Período</div>{["Facturado", "Mano de obra", "Kilometraje", "Repuestos", "Terceros", "Clientes", "Facturas", "Variación LM", "Variación LY", "Participación"].map((label) => <div key={label} className="whitespace-nowrap text-right">{label}</div>)}
        </div>
        {rows.map((row) => <button key={row.periodo} type="button" onClick={() => onSelectPeriod(row.periodo === selectedPeriod ? null : row.periodo)} className={cn(`grid w-full ${PANORAMA_GRID} items-center border-t px-2 py-1.5 text-left text-[12px] hover:bg-accent`, row.periodo === selectedPeriod && "bg-primary/5 outline outline-1 outline-primary/20")}>
          <div className="truncate font-medium capitalize">{periodLabel(row.periodo, periodMode)}</div>
          <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.mo)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.km)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.repuestos)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.terceros)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{row.clientes}</div>
          <div className="text-right tabular-nums text-muted-foreground">{row.facturas}</div>
          <div className={cn("text-right tabular-nums", row.variationLm != null && row.variationLm < 0 && "text-destructive")}>{row.variationLm == null ? "—" : `${row.variationLm > 0 ? "+" : ""}${row.variationLm}%`}</div>
          <div className={cn("text-right tabular-nums", row.variationLy != null && row.variationLy < 0 && "text-destructive")}>{row.variationLy == null ? "—" : `${row.variationLy > 0 ? "+" : ""}${row.variationLy}%`}</div>
          <div className="text-right tabular-nums text-muted-foreground">{data?.resumen.total ? `${Math.round((row.total / data.resumen.total) * 100)}%` : "—"}</div>
        </button>)}
      </div></div>)}
  </Panel>;
}
