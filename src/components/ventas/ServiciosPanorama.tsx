/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceMoneyColumn, serviceNumberColumn, serviceShareColumn } from "./serviceSalesColumns";
import { serviceFiltersKey, serviceFilteredRequest, type ServiceSalesFilters } from "./serviceSalesFilters";
import { ChevronDown, ChevronUp } from "lucide-react";
import { endOfDay, endOfISOWeek, endOfMonth, endOfYear, format, subDays, subMonths, subWeeks, subYears } from "date-fns";
import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/layout/AppPrimitives";
import { pct } from "@/components/dashboard/utils";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";

export type ServiciosSummary = { total: number; facturas: number; clientes: number; ordenes: number; promedio: number };
type PeriodoPanorama = {
  periodo: string; total: number; mo: number; km: number; repuestos: number; terceros: number;
  facturas: number; clientes: number; metodologia: "historico" | "actual" | "mixto";
};
type PanoramaResponse = { desde: string; hasta: string; agrupacion: PeriodMode; resumen: ServiciosSummary; periodos: PeriodoPanorama[] };
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

export function ServiciosPanorama({ desde, hasta, sucursal, buscar, tipoTiempo, marca = "", tipoMaquina = "", filtros, periodMode, selectedPeriod, onSelectPeriod, onSummary }: {
  desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string; marca?: string; tipoMaquina?: string; periodMode: PeriodMode;
  selectedPeriod: string | null; onSelectPeriod: (periodo: string | null) => void;
  onSummary?: (summary: ServiciosSummary | null) => void; filtros?: ServiceSalesFilters;
}) {
  const filterKey = serviceFiltersKey(filtros);
  const [data, setData] = useState<PanoramaResponse | null>(null);
  const [previousPeriod, setPreviousPeriod] = useState<PanoramaResponse | null>(null);
  const [previousYear, setPreviousYear] = useState<PanoramaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!desde || !hasta || desde > hasta) {
      setData(null);
      setError("Seleccioná un rango de fechas válido.");
      setLoading(false);
      onSummary?.(null);
      return;
    }
    setLoading(true); setError(null); onSummary?.(null);
    const request = serviceFilteredRequest("ventas_servicios_panorama_v2", filterKey);
    const params = (from: string, to: string) => ({
      ...request.params,
      p_marca: marca || null, p_tipo_maquina: tipoMaquina || null, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_tipo_tiempo: tipoTiempo === "TODOS" ? null : tipoTiempo, p_agrupacion: periodMode, p_buscar: buscar.trim() || null,
      p_desde: from, p_hasta: to,
    });
    const priorFrom = shift(desde, periodMode, 1);
    const priorTo = shift(hasta, periodMode, 1);
    Promise.all([
      (supabase as any).rpc(request.name, params(desde, hasta)),
      (supabase as any).rpc(request.name, params(priorFrom, priorTo)),
      (supabase as any).rpc(request.name, params(iso(subYears(new Date(`${desde}T00:00:00`), 1)), iso(subYears(new Date(`${hasta}T00:00:00`), 1)))),
    ]).then(([currentResult, priorResult, yearResult]: any[]) => {
      if (!alive) return;
      const rpcError = currentResult.error || priorResult.error || yearResult.error;
      if (rpcError) { setError(serviceSalesError(rpcError, filterKey)); setData(null); setPreviousPeriod(null); setPreviousYear(null); onSummary?.(null); }
      else { const next = currentResult.data as PanoramaResponse; setData(next); setPreviousPeriod(priorResult.data as PanoramaResponse); setPreviousYear(yearResult.data as PanoramaResponse); onSummary?.(next.resumen); }
      setLoading(false);
    }).catch((failure: { message?: string }) => {
      if (!alive) return;
      setError(serviceSalesError(failure, filterKey)); setData(null); setPreviousPeriod(null); setPreviousYear(null); onSummary?.(null); setLoading(false);
    });
    return () => { alive = false; };
  }, [buscar, desde, hasta, onSummary, periodMode, sucursal, tipoTiempo, marca, tipoMaquina, filterKey]);

  const rows = useMemo(() => (data?.periodos ?? []).map((row, index, all) => {
    const previousKey = shift(row.periodo, periodMode, 1);
    const partialPeriod = iso(periodEnd(row.periodo, periodMode)) > hasta;
    const previous = partialPeriod
      ? previousPeriod?.periodos.find((item) => item.periodo === previousKey) ?? null
      : index > 0 ? all[index - 1] : previousPeriod?.periodos.find((item) => item.periodo === previousKey) ?? null;
    const lastYearKey = shift(row.periodo, "anio", 1);
    const lastYear = previousYear?.periodos.find((item) => item.periodo === lastYearKey) ?? null;
    const variationLm = previous ? pct(row.total, previous.total) : null;
    const variationLy = lastYear ? pct(row.total, lastYear.total) : null;
    return { ...row, variationLm, variationLy };
  }), [data, hasta, periodMode, previousPeriod, previousYear]);

  const components = useMemo(() => (data?.periodos ?? []).reduce((total, row) => ({
    mo: total.mo + Number(row.mo), km: total.km + Number(row.km),
    repuestos: total.repuestos + Number(row.repuestos), terceros: total.terceros + Number(row.terceros),
  }), { mo: 0, km: 0, repuestos: 0, terceros: 0 }), [data]);
  const totalLm = data && previousPeriod ? pct(data.resumen.total, previousPeriod.resumen.total) : null;
  const totalLy = data && previousYear ? pct(data.resumen.total, previousYear.resumen.total) : null;

  type Row = (typeof rows)[number];
  const columns: SalesDisplayColumn<Row>[] = [
    {key:"periodo",label:"Período",kind:"text",value:row=>row.periodo,weight:1.3,
      exportValue:row=>row.periodo === "Total del período" ? row.periodo : periodLabel(row.periodo,periodMode),
      render:row=>row.periodo === "Total del período" ? row.periodo : periodLabel(row.periodo,periodMode),className:"font-medium"},
    ...([ ["total","Facturado"], ["mo","Mano de obra"], ["km","Kilometraje"], ["repuestos","Repuestos"], ["terceros","Terceros"] ] as const)
      .map(([key,label])=>serviceMoneyColumn<Row>(key,label,row=>row[key])),
    serviceNumberColumn<Row>("clientes","Clientes",row=>row.clientes),
    serviceNumberColumn<Row>("facturas","Facturas",row=>row.facturas),
    ...([ ["variationLm","Variación LM"], ["variationLy","Variación LY"] ] as const).map(([key,label]): SalesDisplayColumn<Row> => ({
      key,label,kind:"number",align:"right",value:row=>row[key] == null ? null : row[key]!/100,excelFormat:'+0%;-0%;0%',
      render:row=>row[key] == null ? "—" : <span className={cn(row[key]!<0 && "text-destructive")}>{row[key]!>0?"+":""}{row[key]}%</span>,
    })),
    serviceShareColumn<Row>(row=>data?.resumen.total ? row.total/data.resumen.total : null),
  ];
  const footer: Row | undefined = data ? {
    periodo:"Total del período",total:data.resumen.total,...components,clientes:data.resumen.clientes,
    facturas:data.resumen.facturas,metodologia:"mixto",variationLm:totalLm,variationLy:totalLy,
  } : undefined;
  return <Panel className="min-w-0 p-0 lg:p-3">
    <div className="flex min-h-11 min-w-0 items-center justify-between gap-2 px-3 lg:min-h-0 lg:px-0">
      <button type="button" onClick={()=>setCollapsed(value=>!value)} className="flex min-w-0 items-center gap-2 text-left">
        <h2 className="truncate text-[13px] font-semibold">Facturación por período</h2>
        {collapsed ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {selectedPeriod && <button type="button" onClick={()=>onSelectPeriod(null)} className="shrink-0 rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</button>}
    </div>
    {!collapsed && (loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando panorama…</div>
      : error ? <div role="alert" className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : <div className="min-w-0 lg:mt-3"><SalesDataTable mobileEmbedded title="Períodos" rows={rows} columns={columns}
        initialSort={{key:"periodo",direction:"asc"}} rowKey={row=>row.periodo} footer={footer}
        fileName={`ventas-servicios-periodos-${desde}-${hasta}.xlsx`}
        onRowClick={row=>onSelectPeriod(row.periodo === selectedPeriod ? null : row.periodo)}
        selected={row=>row.periodo === selectedPeriod} countLabel="períodos" empty="No hay datos para este rango." /></div>)}
  </Panel>;
}
