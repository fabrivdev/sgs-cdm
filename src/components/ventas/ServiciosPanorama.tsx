/* eslint-disable @typescript-eslint/no-explicit-any -- RPC tipada al regenerar tipos. */
import { useEffect, useMemo, useState } from "react";
import { SalesDataTable, type SalesDisplayColumn } from "./SalesDataTable";
import { serviceNumberColumn, serviceShareColumn } from "./serviceSalesColumns";
import { serviceFiltersKey, serviceFilteredRequest, type ServiceSalesFilters } from "./serviceSalesFilters";

import { serviceFilteredError as serviceSalesError } from "./serviceSalesFilters";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/layout/AppPrimitives";
import { loadPeriodComparisons, type PeriodComparisons } from "./salesPeriodComparison";
import { periodMoneyColumn, comparisonColumn, comparisonExports } from "./salesPeriodColumns";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";
import { useSalesMobile } from "./salesMobileContext";

export type ServiciosSummary = { total: number; facturas: number; clientes: number; ordenes: number; promedio: number };
type PeriodoPanorama = {
  periodo: string; total: number; mo: number; km: number; repuestos: number; terceros: number;
  facturas: number; clientes: number; metodologia: "historico" | "actual" | "mixto";
};
type PanoramaResponse = { desde: string; hasta: string; agrupacion: PeriodMode; resumen: ServiciosSummary; periodos: PeriodoPanorama[] };
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
  const mobile = useSalesMobile();
  const [data, setData] = useState<PanoramaResponse | null>(null);
  const [comparisons, setComparisons] = useState<PeriodComparisons | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setComparisons(null);
    void (async () => {
      try {
        const current = await (supabase as any).rpc(request.name, params(desde, hasta));
        if (current.error) throw current.error;
        if (!alive) return;
        const next = current.data as PanoramaResponse;
        setData(next); onSummary?.(next.resumen); setLoading(false);
        const compared = await loadPeriodComparisons(desde, hasta, periodMode, async window => {
          const result = await (supabase as any).rpc(request.name, { ...params(window.from, window.to), p_agrupacion: "dia" });
          if (result.error) throw result.error;
          return result.data?.periodos;
        });
        if (alive) setComparisons(compared);
      } catch (failure) {
        if (!alive) return;
        setError(serviceSalesError(failure as { message?: string }, filterKey)); setData(null); onSummary?.(null); setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [buscar, desde, hasta, onSummary, periodMode, sucursal, tipoTiempo, marca, tipoMaquina, filterKey]);

  const rows = useMemo(() => (data?.periodos ?? []).map(row => ({ ...row,
    previous: comparisons?.periods[row.periodo]?.previous ?? null, ly: comparisons?.periods[row.periodo]?.ly ?? null,
  })), [data, comparisons]);
  const components = useMemo(() => (data?.periodos ?? []).reduce((total, row) => ({
    mo: total.mo + Number(row.mo), km: total.km + Number(row.km),
    repuestos: total.repuestos + Number(row.repuestos), terceros: total.terceros + Number(row.terceros),
  }), { mo: 0, km: 0, repuestos: 0, terceros: 0 }), [data]);
  type Row = (typeof rows)[number];
  const columns: SalesDisplayColumn<Row>[] = [
    {key:"periodo",label:"Período",kind:"text",value:row=>row.periodo,weight:1.3,
      exportValue:row=>row.periodo === "Total del período" ? row.periodo : periodLabel(row.periodo,periodMode),
      render:row=>row.periodo === "Total del período" ? row.periodo : periodLabel(row.periodo,periodMode),className:"font-medium"},
    ...([ ["total","Facturación neta"], ["mo","Mano de obra"], ["km","Kilometraje"], ["repuestos","Repuestos"], ["terceros","Terceros"] ] as const)
      .map(([key,label])=>periodMoneyColumn<Row>(key,label,row=>row[key])),
    serviceNumberColumn<Row>("clientes","Clientes",row=>row.clientes),
    serviceNumberColumn<Row>("facturas","Documentos",row=>row.facturas),
    comparisonColumn<Row>("previous", "Período anterior", row => row.previous, row => row.total),
    comparisonColumn<Row>("ly", "LY", row => row.ly, row => row.total),
    serviceShareColumn<Row>(row=>data?.resumen.total ? row.total/data.resumen.total : null),
  ];
  const footer: Row | undefined = data ? {
    periodo:"Total del período",total:data.resumen.total,...components,clientes:data.resumen.clientes,
    facturas:data.resumen.facturas,metodologia:"mixto",previous:comparisons?.total.previous ?? null,ly:comparisons?.total.ly ?? null,
  } : undefined;
  return <Panel className={cn("sales-periods min-w-0 p-0 lg:p-3", mobile.active && mobile.view !== "periodos" && !error && "hidden")}>
    {!mobile.active && <div className="flex min-h-11 min-w-0 items-center justify-between gap-2 px-3 lg:min-h-0 lg:px-0">
      <div className="flex min-w-0 items-center">
        <h2 className="truncate text-[13px] font-semibold">Facturación por período</h2>
      </div>
      {selectedPeriod && <button type="button" onClick={()=>onSelectPeriod(null)} className="shrink-0 rounded-full border bg-accent px-2.5 py-1 text-[10px] font-medium hover:bg-accent/70">Ver período completo ×</button>}
    </div>}
    <div>{loading ? <div className="py-8 text-center text-[12px] text-muted-foreground">Cargando panorama…</div>
      : error ? <div role="alert" className="py-8 text-center text-[12px] text-destructive">{error}</div>
      : <div className="min-w-0 lg:mt-3"><SalesDataTable mobileEmbedded hideDesktopTitle mobileCountKey={mobile.active ? "facturas" : undefined} mobileCountLabel="Doc." mobilePrimaryLabel={mobile.active && periodMode === "mes" ? "Mes" : undefined} mobileMetricLabel={mobile.active ? "Facturación neta" : undefined} title="Períodos" rows={rows} columns={columns}
        exportColumns={columns.flatMap(c => c.key === "previous" || c.key === "ly" ? comparisonExports<Row>(c.key,c.label,row=>row[c.key as "previous" | "ly"],row=>row.total) : [c])} initialSort={{key:"periodo",direction:"asc"}} rowKey={row=>row.periodo} footer={footer}
        fileName={`ventas-servicios-periodos-${desde}-${hasta}.xlsx`}
        onRowClick={row=>{ onSelectPeriod(row.periodo === selectedPeriod ? null : row.periodo); if (mobile.active) mobile.setView("detalle"); }}
        selected={row=>row.periodo === selectedPeriod} countLabel="períodos" empty="No hay datos para este rango." /></div>}</div>
  </Panel>;
}
