/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { endOfDay, endOfISOWeek, endOfMonth, endOfYear } from "date-fns";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) return;
    setLoading(true); setError(null); onSummary?.(null);
    (supabase as any).rpc("ventas_servicios_panorama_v2", {
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo, p_agrupacion: periodMode, p_buscar: buscar.trim() || null,
    }).then(({ data: response, error: rpcError }: any) => {
      if (!alive) return;
      if (rpcError) { setError(serviceSalesError(rpcError)); setData(null); onSummary?.(null); }
      else { const next = response as PanoramaResponse; setData(next); onSummary?.(next.resumen); }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [buscar, desde, hasta, onSummary, periodMode, sucursal, tipoTiempo, marca, tipoMaquina]);

  const rows = useMemo(() => (data?.periodos ?? []).map((row, index, all) => {
    const previous = index > 0 ? all[index - 1] : null;
    const complete = periodEnd(row.periodo, periodMode) < new Date();
    const variation = previous && complete && previous.metodologia === row.metodologia
      ? pct(row.total, previous.total)
      : null;
    return { ...row, variation, complete };
  }), [data, periodMode]);

  return <Panel className="p-3">
    <button type="button" onClick={() => setCollapsed((value) => !value)} className="flex w-full items-center justify-between gap-2 text-left">
      <h2 className="text-[13px] font-semibold">Evolución de la facturación</h2>
      <div className="flex items-center gap-2">{selectedPeriod && <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onSelectPeriod(null); }} className="rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</span>}{collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}</div>
    </button>
    {!collapsed && (loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando panorama…</div>
      : error ? <div className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : !rows.length ? <div className="py-8 text-center text-[12px] text-muted-foreground">No hay datos para este rango.</div>
      : <div className="mt-3 overflow-x-auto rounded-md border"><div className="min-w-[980px]">
        <div className="grid grid-cols-[105px_repeat(5,minmax(95px,1fr))_75px_75px_120px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>Período</div><div className="text-right">Facturado</div><div className="text-right">Mano de obra</div><div className="text-right">Kilometraje</div><div className="text-right">Repuestos</div><div className="text-right">Terceros</div><div className="text-right">Clientes</div><div className="text-right">Facturas</div><div className="text-right">vs. anterior</div>
        </div>
        {rows.map((row) => <button key={row.periodo} type="button" onClick={() => onSelectPeriod(row.periodo === selectedPeriod ? null : row.periodo)} className={cn("grid w-full grid-cols-[105px_repeat(5,minmax(95px,1fr))_75px_75px_120px] items-center border-t px-3 py-2 text-left text-[12px] hover:bg-accent", row.periodo === selectedPeriod && "bg-primary/5 outline outline-1 outline-primary/20")}>
          <div className="font-medium capitalize">{periodLabel(row.periodo, periodMode)}</div>
          <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.mo)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.km)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.repuestos)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{money(row.terceros)}</div>
          <div className="text-right tabular-nums text-muted-foreground">{row.clientes}</div>
          <div className="text-right tabular-nums text-muted-foreground">{row.facturas}</div>
          <div className={cn("text-right tabular-nums", row.variation != null && row.variation < 0 && "text-destructive")}>{row.variation == null ? "—" : `${row.variation > 0 ? "+" : ""}${row.variation}%`}</div>
        </button>)}
      </div></div>)}
  </Panel>;
}
