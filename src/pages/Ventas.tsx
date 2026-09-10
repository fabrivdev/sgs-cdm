/* eslint-disable @typescript-eslint/no-explicit-any -- La RPC queda tipada al regenerar los tipos después de aplicar su migración. */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Receipt, Users } from "lucide-react";
import { differenceInCalendarDays, endOfDay, endOfISOWeek, endOfMonth, endOfYear, format, startOfMonth, startOfWeek, startOfYear, subMonths, subWeeks } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel } from "@/components/layout/AppPrimitives";
import { FilterCustom, FilterDate, FilterSelect, FiltersBar } from "@/components/filters/FiltersBar";
import { PeriodSelector } from "@/components/dashboard/DashboardPanels";
import type { PeriodMode } from "@/components/dashboard/types";
import { ErrorState } from "@/components/ErrorState";
import { cn } from "@/lib/utils";
import { SUCURSALES } from "@/lib/constants";
import { ServiciosPanorama, type ServiciosSummary } from "@/components/ventas/ServiciosPanorama";
import { ServiciosDetalleOS } from "@/components/ventas/ServiciosDetalleOS";
import { ServiciosAnalisis } from "@/components/ventas/ServiciosAnalisis";
import { ServiciosClientes } from "@/components/ventas/ServiciosClientes";
import { money as formatMoney } from "@/components/dashboard/utils";

export type VentasArea = "servicios" | "repuestos" | "maquinas";
type ExplorerView = "facturas" | "clientes" | "analisis";
type PivotColumn = "none" | "mes" | "sucursal";
type PivotMetric = "usd" | "facturas" | "cantidad";
type PivotRow = "concepto" | "cliente" | "sucursal" | "repuesto" | "subgrupo" | "modelo";
type SalesLine = {
  id: string; fecha: string; factura: string; cliente: string; sucursal: string | null;
  concepto: string; metodologia: "historico" | "actual"; total_venta: number; cantidad: number;
  os_numero: string | null; codigo: string | null; codigo_fabricante: string | null;
  descripcion: string | null; marca: string | null; modelo: string | null; chasis: string | null; es_nota_credito: boolean;
};
type SalesResponse = {
  total: number; facturas: number; clientes: number; promedio: number;
  historico: number; actual: number; cruza_corte: boolean; lineas: SalesLine[];
  clientes_detalle: Array<{ nombre: string; importe: number; facturas: number }>;
  pendientes_vinculacion: { facturas: number; importe: number };
};
type AnalysisResponse = {
  columns: Array<{ key: string; label: string }>;
  rows: Array<{ key: string; values: Record<string, number>; total: number }>;
  total: number; pagina: number; por_pagina: number; paginas: number;
};
type SalesDocument = {
  id: string; fecha: string; factura: string; cliente: string; sucursal: string | null;
  metodologia: "historico" | "actual"; total_venta: number; cantidad_lineas: number; lineas: SalesLine[];
  os_numero?: string; tipo?: string; facturas?: number; mano_obra?: number; kilometraje?: number; repuestos?: number; otros?: number;
};
type DocumentsResponse = { total: number; pagina: number; por_pagina: number; paginas: number; documentos: SalesDocument[] };

type ClientComparison = {
  nombre: string; importe: number; importe_anterior: number | null; facturas: number;
  ordenes: number; ultima: string | null; sucursales: string | null;
};
type ClientResponse = { clientes: ClientComparison[]; comparable: boolean; desde_anterior: string; hasta_anterior: string };

const AREA_COPY = {
  servicios: { title: "Ventas de Servicios", search: "OS, factura o cliente…", primary: "OS", primaryValue: "concepto" as const, empty: "No hay ventas de Servicios en el período." },
  repuestos: { title: "Ventas de Repuestos", search: "Código, repuesto, factura o cliente…", primary: "Repuesto", primaryValue: "repuesto" as const, empty: "No hay ventas de Repuestos en el período." },
  maquinas: { title: "Ventas de Máquinas", search: "Modelo, chasis, factura o cliente…", primary: "Máquina", primaryValue: "subgrupo" as const, empty: "No hay ventas de Máquinas en el período." },
};

const usd = { format: (value: number) => formatMoney(value) };
const money = new Intl.NumberFormat("es-PY", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const quantity = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function cleanModel(value: string | null) {
  return (value ?? "").replace(/\s*[-·]?\s*(?:chasis|casis)\s*:?\s*[\w-]+.*$/i, "").trim() || "Modelo no informado";
}
function formatMetric(value: number, metric: PivotMetric) {
  if (metric === "usd") return usd.format(value);
  return metric === "facturas" ? Math.round(value).toLocaleString("es-PY") : quantity.format(value);
}

function SalesLines({area,lines}:{area:VentasArea;lines:SalesLine[]}) {
  return <div className="border-b bg-muted/15 px-5 py-2">
    <table className="w-full table-fixed text-[11px] [&_th]:py-2 [&_th]:pr-3 [&_th]:font-medium [&_td]:py-2 [&_td]:pr-3 [&_td]:align-top">
      <thead className="text-left text-muted-foreground"><tr>
        {area === "servicios" && <><th className="w-[150px]">Factura</th><th className="w-[90px]">Fecha</th><th className="w-[110px]">Componente</th></>}
        <th className="w-[135px]">{area === "maquinas" ? "Modelo" : "Cód. repuesto"}</th><th className="w-[145px]">{area === "maquinas" ? "Chasis" : "Cód. fabricante"}</th><th>Descripción</th><th className="w-[80px] text-right">Cantidad</th><th className="w-[120px] text-right">Importe</th>
      </tr></thead>
      <tbody>{lines.map(line=><tr key={line.id} className="border-t border-border/50">
        {area === "servicios" && <><td className="font-mono">{line.factura}</td><td>{shortDate.format(new Date(line.fecha+"T00:00:00"))}</td><td>{line.concepto==="Servicio"?"Mano de obra":line.concepto}</td></>}
        <td className="break-all font-mono text-foreground">{area === "maquinas" ? cleanModel(line.modelo) : line.codigo || "—"}</td><td className="break-all font-mono text-foreground">{area === "maquinas" ? line.chasis || "—" : line.codigo_fabricante || "—"}</td><td className="break-words">{line.descripcion || (line.metodologia==="historico"?"Histórico sin detalle de artículo":"—")}{line.es_nota_credito && <span className="ml-2 text-muted-foreground">Nota de crédito</span>}</td><td className="text-right tabular-nums">{quantity.format(Number(line.cantidad))}</td><td className="text-right tabular-nums">{money.format(Number(line.total_venta))}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (total <= 0) return null;
  return <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground"><span>{total.toLocaleString("es-PY")} registros</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded border px-2 py-1 text-foreground disabled:opacity-40">Anterior</button><span>{page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded border px-2 py-1 text-foreground disabled:opacity-40">Siguiente</button></div></div>;
}

export function SalesExplorer({ area, data, loading, desde, hasta, sucursal, buscar, tipoTiempo }: { area: VentasArea; data: SalesResponse | null; loading: boolean; desde: string; hasta: string; sucursal: string; buscar: string; tipoTiempo: string }) {
  const copy = AREA_COPY[area];
  const [view, setView] = useState<ExplorerView>("facturas");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [documentPage, setDocumentPage] = useState(1);
  const [documents, setDocuments] = useState<DocumentsResponse>({ total: 0, pagina: 1, por_pagina: 50, paginas: 1, documentos: [] });
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [pivotRows, setPivotRows] = useState<PivotRow>(copy.primaryValue);
  const [pivotColumns, setPivotColumns] = useState<PivotColumn>("mes");
  const [pivotMetric, setPivotMetric] = useState<PivotMetric>("usd");
  const [analysisPage, setAnalysisPage] = useState(1);
  const [analysis, setAnalysis] = useState<AnalysisResponse>({ columns: [], rows: [], total: 0, pagina: 1, por_pagina: 50, paginas: 1 });
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [clientData, setClientData] = useState<ClientResponse | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientPage, setClientPage] = useState(1);
  const [clientSort, setClientSort] = useState<"importe" | "nombre" | "facturas">("importe");
  const clients = useMemo(() => [...(clientData?.clientes ?? [])].sort((a,b) => clientSort === "nombre" ? a.nombre.localeCompare(b.nombre) : Number(b[clientSort])-Number(a[clientSort])), [clientData,clientSort]);
  useEffect(() => { setClientPage(1); }, [area,buscar,desde,hasta,sucursal,clientSort]);
  useEffect(() => {
    if(view !== "clientes") return;
    let alive = true;
    setClientLoading(true); setClientError(null);
    void (supabase as any).rpc("ventas_clientes_comparacion", {
      p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null
    }).then(({data: response,error}: {data: ClientResponse; error: {message:string} | null}) => {
      if(!alive) return;
      setClientData(error ? null : response); setClientError(error?.message ?? null); setClientLoading(false);
    });
    return () => { alive = false; };
  }, [area,buscar,desde,hasta,sucursal,view]);

  useEffect(() => { setView("facturas"); setExpanded(null); setDocumentPage(1); setAnalysisPage(1); setPivotRows(copy.primaryValue); setPivotMetric("usd"); }, [area, copy.primaryValue]);
  useEffect(() => { setDocumentPage(1); setAnalysisPage(1); }, [buscar, desde, hasta, sucursal]);

  useEffect(() => {
    if (view !== "facturas") return;
    let alive = true;
    setDocumentsLoading(true); setDocumentsError(null);
    void (supabase as any).rpc(area === "servicios" ? "ventas_servicios_os" : "ventas_area_documentos", {
      p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_pagina: documentPage, p_por_pagina: 20,
    }).then(({ data: response, error }: { data: unknown; error: { message?: string } | null }) => {
      if (!alive) return;
      if (error) { setDocumentsError(error.message ?? "No se pudieron cargar las facturas."); setDocuments({ total: 0, pagina: 1, por_pagina: 50, paginas: 1, documentos: [] }); }
      else setDocuments(response as DocumentsResponse);
      setDocumentsLoading(false);
    });
    return () => { alive = false; };
  }, [area, buscar, desde, documentPage, hasta, sucursal, view]);

  useEffect(() => {
    if (view !== "analisis") return;
    let alive = true;
    setAnalysisLoading(true); setAnalysisError(null);
    void (supabase as any).rpc("ventas_area_analisis_negocio", {
      p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_filas: pivotRows, p_columnas: pivotColumns, p_medida: pivotMetric,
      p_pagina: analysisPage, p_por_pagina: 50,
    }).then(({ data: response, error }: { data: unknown; error: { message?: string } | null }) => {
      if (!alive) return;
      if (error) { setAnalysisError(error.message ?? "No se pudo calcular el análisis."); setAnalysis({ columns: [], rows: [], total: 0, pagina: 1, por_pagina: 50, paginas: 1 }); }
      else setAnalysis(response as AnalysisResponse);
      setAnalysisLoading(false);
    });
    return () => { alive = false; };
  }, [analysisPage, area, buscar, desde, hasta, pivotColumns, pivotMetric, pivotRows, sucursal, view]);

  const rowOptions = area === "servicios"
    ? [{ value: "concepto" as const, label: "Componente" }, { value: "cliente" as const, label: "Cliente" }, { value: "sucursal" as const, label: "Sucursal" }]
    : area === "maquinas"
      ? [{ value: "subgrupo" as const, label: "Tipo de máquina" }, { value: "modelo" as const, label: "Modelo normalizado" }, { value: "cliente" as const, label: "Cliente" }, { value: "sucursal" as const, label: "Sucursal" }]
      : [{ value: "repuesto" as const, label: "Código y repuesto" }, { value: "cliente" as const, label: "Cliente" }, { value: "sucursal" as const, label: "Sucursal" }];


  return (
    <Panel className="p-3">
      <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[13px] font-semibold">{area === "servicios" ? "Órdenes de servicio facturadas" : "Ventas"}</h2>
        <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border text-[11px]">
          {([['facturas', area === "servicios" ? 'Detalle' : 'Facturas'], ['clientes', 'Clientes'], ['analisis', 'Análisis']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setView(value); setExpanded(null); }} className={cn("px-3 hover:bg-accent", view === value && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
        </div>
      </div>

      {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando facturación…</div>
      : area === "servicios" && view === "facturas" ? (
        <ServiciosDetalleOS desde={desde} hasta={hasta} sucursal={sucursal} buscar={buscar} tipoTiempo={tipoTiempo} />
      ) : area === "servicios" && view === "analisis" ? (
        <ServiciosAnalisis desde={desde} hasta={hasta} sucursal={sucursal} buscar={buscar} tipoTiempo={tipoTiempo} />
      ) : area === "servicios" && view === "clientes" ? (
        <ServiciosClientes desde={desde} hasta={hasta} sucursal={sucursal} buscar={buscar} tipoTiempo={tipoTiempo} />
      ) : view === "facturas" ? (
        <div className="mt-3">
          {documentsLoading ? <div className="py-12 text-center text-sm text-muted-foreground">Cargando…</div> : documentsError ? <div role="alert" className="py-8 text-destructive">{documentsError}</div> : !documents.documentos.length ? <div className="py-12 text-center text-sm text-muted-foreground">{copy.empty}</div> : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[1000px] text-xs [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-3 [&_th]:font-medium [&_td]:px-3 [&_td]:py-3 [&_td]:align-top">
                <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                  <tr><th>{area === "servicios" ? "OS / documento" : "Factura"}</th><th className="w-[24%]">Cliente</th><th>Sucursal</th>
                    {area === "servicios" ? <><th className="text-right">Facturas</th><th className="text-right">Mano de obra</th><th className="text-right">Km</th><th className="text-right">Repuestos</th><th className="text-right">Otros</th></> :
                      area === "maquinas" ? <><th>Modelo</th><th>Chasis</th></> : <th className="text-right">Líneas</th>}
                    <th>{area === "servicios" ? "Última factura" : "Fecha"}</th><th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>{documents.documentos.map(document => {
                  const isOpen = expanded === document.id;
                  const count = area === "servicios" ? 10 : area === "maquinas" ? 7 : 6;
                  return <Fragment key={document.id}>
                    <tr className={cn("border-b",isOpen && "bg-primary/5")}>
                      <td>{area === "repuestos" ? <span className="font-mono font-semibold">{document.factura}</span> : <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : document.id)} className="flex items-center gap-2 text-left font-mono font-semibold text-primary">
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform",!isOpen && "-rotate-90")}/>
                        {area === "servicios" ? document.os_numero || document.factura : document.factura}
                      </button>}{area === "servicios" && !document.os_numero && <span className="mt-1 block text-[11px] text-muted-foreground">{document.tipo}</span>}</td>
                      <td className="font-medium break-words">{document.cliente}</td><td className="text-muted-foreground">{document.sucursal || "—"}</td>
                      {area === "servicios" ? <>
                        <td className="text-right tabular-nums">{document.facturas}</td>
                        {[document.mano_obra,document.kilometraje,document.repuestos,document.otros].map((amount,i) => <td key={i} className="text-right tabular-nums">{amount == null ? "—" : money.format(Number(amount))}</td>)}
                      </> : area === "maquinas" ? <>
                        <td className="max-w-[250px]">{document.lineas.map(l => <div key={l.id}>{cleanModel(l.modelo || l.descripcion)}</div>)}</td>
                        <td className="font-mono">{document.lineas.map(l => <div key={l.id}>{l.chasis || "—"}</div>)}</td>
                      </> : <td className="text-right tabular-nums">{document.cantidad_lineas}</td>}
                      <td className="whitespace-nowrap text-muted-foreground">{shortDate.format(new Date(document.fecha+"T00:00:00"))}</td>
                      <td className="text-right font-semibold tabular-nums whitespace-nowrap">{money.format(Number(document.total_venta))}</td>
                    </tr>
                    {(isOpen || area === "repuestos") && <tr><td colSpan={count} className="!p-0"><SalesLines area={area} lines={document.lineas}/></td></tr>}
                  </Fragment>;
                })}</tbody>
              </table>
            </div>
          )}
          {!documentsLoading && !documentsError && <Pager page={documents.pagina} pages={documents.paginas} total={documents.total} onChange={(page) => { setDocumentPage(page); setExpanded(null); }}/>}
        </div>
      ) : view === "clientes" ? (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">Comparación: mismo período del año anterior{clientData && !clientData.comparable ? " · Histórico con distinto alcance" : ""}</span>
            <label className="flex items-center gap-2">Ordenar por <select className="rounded-md border bg-background px-2 py-1.5" value={clientSort} onChange={e=>setClientSort(e.target.value as typeof clientSort)}><option value="importe">Facturación</option><option value="facturas">Facturas</option><option value="nombre">Cliente</option></select></label>
          </div>
          {clientLoading ? <div className="py-10 text-center text-muted-foreground">Cargando clientes…</div> : clientError ? <div role="alert" className="py-8 text-destructive">{clientError}</div> : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1050px] text-xs [&_th]:px-3 [&_th]:py-3 [&_th]:font-medium [&_td]:px-3 [&_td]:py-3">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground"><tr><th>#</th><th className="w-[24%]">Cliente</th><th>Sucursal</th><th>Última compra</th>{area === "servicios" && <th className="text-right">OS identificadas</th>}<th className="text-right">Facturas</th><th className="text-right">Promedio / factura</th><th className="text-right">Año anterior</th><th className="text-right">Variación</th><th className="text-right">Actual</th><th className="w-[130px]">Participación</th></tr></thead>
              <tbody>{clients.slice((clientPage-1)*25,clientPage*25).map((client,i)=>{
                const share = (data?.total ?? 0)>0 ? Number(client.importe)/Number(data!.total)*100 : null;
                const change = clientData?.comparable && client.importe_anterior != null && Number(client.importe_anterior)>0 ? (Number(client.importe)/Number(client.importe_anterior)-1)*100 : null;
                return <tr key={client.nombre} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="text-muted-foreground">{(clientPage-1)*25+i+1}</td><td className="font-medium">{client.nombre}</td><td className="text-muted-foreground">{client.sucursales || "—"}</td><td className="whitespace-nowrap">{client.ultima ? shortDate.format(new Date(client.ultima+"T00:00:00")) : "—"}</td>
                  {area === "servicios" && <td className="text-right tabular-nums">{client.ordenes}</td>}<td className="text-right tabular-nums">{client.facturas}</td><td className="text-right tabular-nums">{client.facturas ? money.format(Number(client.importe)/client.facturas) : "—"}</td>
                  <td className="text-right tabular-nums">{client.importe_anterior == null ? "—" : money.format(Number(client.importe_anterior))}</td>
                  <td className={cn("text-right tabular-nums whitespace-nowrap",change != null && (change<0 ? "text-red-700" : "text-green-700"))} title={!clientData?.comparable ? "La clasificación histórica no permite comparar el porcentaje de forma homogénea." : undefined}>{change == null ? "—" : (change>0 ? "+" : "")+change.toFixed(1)+"%"}</td>
                  <td className="text-right font-semibold tabular-nums">{money.format(Number(client.importe))}</td><td><span className="block text-right tabular-nums">{share == null ? "—" : share.toFixed(1)+"%"}</span><div className="mt-1 h-1 rounded bg-muted"><div className="h-1 rounded bg-primary/60" style={{width:Math.min(100,Math.max(0,share??0))+"%"}}/></div></td>
                </tr>;
              })}</tbody>
            </table>{!clients.length && <div className="py-10 text-center text-muted-foreground">{copy.empty}</div>}
            <Pager page={clientPage} pages={Math.max(1,Math.ceil(clients.length/25))} total={clients.length} onChange={setClientPage}/>
          </div>)}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Analizar por</span><select value={pivotRows} onChange={(event) => { const next = event.target.value as PivotRow; setPivotRows(next); if (next === "concepto" && pivotMetric === "facturas") setPivotMetric("usd"); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">{rowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Desagregar en</span><select value={pivotColumns} onChange={(event) => { setPivotColumns(event.target.value as PivotColumn); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="mes">Mes</option><option value="sucursal">Sucursal</option><option value="none">Sin desglose</option></select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Mostrar</span><select value={pivotMetric} onChange={(event) => { setPivotMetric(event.target.value as PivotMetric); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="usd">Facturación ($)</option><option value="cantidad">{area === "maquinas" ? "Unidades" : "Cantidad"}</option>{pivotRows !== "concepto" && <option value="facturas">Facturas</option>}</select></label>
          </div>
          {area === "repuestos" && data?.historico !== 0 && <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Antes del 01/07/2026 no existe detalle por código; ese importe aparece agrupado como histórico sin detalle.</div>}
          <div className="overflow-x-auto rounded-md border">{analysisLoading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Calculando todo el período…</div> : analysisError ? <div className="py-12 text-center text-[12px] text-destructive">{analysisError}</div> : <div className="min-w-max"><div className="grid items-center border-b bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground" style={{ gridTemplateColumns: `minmax(280px,1fr) ${analysis.columns.length ? `repeat(${analysis.columns.length}, minmax(130px, 1fr))` : ""} 140px` }}><div>{rowOptions.find((option) => option.value === pivotRows)?.label}</div>{analysis.columns.map((column) => <div key={column.key} className="text-right">{column.label}</div>)}<div className="text-right">Total</div></div><div className="max-h-[440px] overflow-y-auto">{!analysis.rows.length ? <div className="w-[700px] py-12 text-center text-[12px] text-muted-foreground">No hay datos para esta combinación.</div> : analysis.rows.map((row) => <div key={row.key} className="grid items-center border-b px-3 py-2 text-[12px] last:border-0" style={{ gridTemplateColumns: `minmax(280px,1fr) ${analysis.columns.length ? `repeat(${analysis.columns.length}, minmax(130px, 1fr))` : ""} 140px` }}><div className="truncate font-medium" title={row.key}>{row.key}</div>{analysis.columns.map((column) => <div key={column.key} className="text-right tabular-nums text-muted-foreground">{row.values[column.key] == null ? "—" : formatMetric(Number(row.values[column.key]), pivotMetric)}</div>)}<div className="text-right font-semibold tabular-nums">{formatMetric(Number(row.total), pivotMetric)}</div></div>)}</div><Pager page={analysis.pagina} pages={analysis.paginas} total={analysis.total} onChange={setAnalysisPage} /></div>}</div>
        </div>
      )}
    </Panel>
  );
}

export default function Ventas({ area }: { area: VentasArea }) {
  const now = useMemo(() => new Date(), []);
  const [desde, setDesde] = useState(`${now.getFullYear()}-01-01`); const [hasta, setHasta] = useState(isoDate(now));
  const [sucursal, setSucursal] = useState("TODAS"); const [buscar, setBuscar] = useState("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("mes");
  const [tipoTiempo, setTipoTiempo] = useState("TODOS");
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [serviciosSummary, setServiciosSummary] = useState<ServiciosSummary | null>(null);
  const [data, setData] = useState<SalesResponse | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    if (!desde || !hasta || desde > hasta) { setError("Seleccioná un rango de fechas válido."); setData(null); setLoading(false); return; }
    const { data: response, error: rpcError } = await (supabase as any).rpc("ventas_area_resumen", { p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_buscar: buscar.trim() || null, p_limite: 500 });
    if (rpcError) { setError(rpcError.message ?? "No se pudo cargar Ventas."); setData(null); } else setData(response as SalesResponse);
    setLoading(false);
  }, [area, buscar, desde, hasta, sucursal]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelectedPeriod(null); setServiciosSummary(null); }, [area, desde, hasta, periodMode, sucursal, tipoTiempo]);

  const weekStart = useMemo(() => startOfWeek(now, { weekStartsOn: 1 }), [now]);
  const previousWeekStart = useMemo(() => subWeeks(weekStart, 1), [weekStart]);
  const datePresets = useMemo(() => [
    { key: "current-week", label: "Semana actual", from: weekStart, to: endOfISOWeek(weekStart), mode: "dia" as PeriodMode },
    { key: "previous-week", label: "Semana anterior", from: previousWeekStart, to: endOfISOWeek(previousWeekStart), mode: "dia" as PeriodMode },
    { key: "previous-current-week", label: "Semana anterior + actual", from: previousWeekStart, to: endOfISOWeek(weekStart), mode: "dia" as PeriodMode },
    { key: "current-month", label: "Este mes", from: startOfMonth(now), to: endOfMonth(now), mode: "semana" as PeriodMode },
    { key: "last-6-months", label: "Últimos 6 meses", from: startOfMonth(subMonths(now, 5)), to: now, mode: "mes" as PeriodMode },
    { key: "last-12-months", label: "Últimos 12 meses", from: startOfMonth(subMonths(now, 11)), to: now, mode: "mes" as PeriodMode },
    { key: "current-year", label: "Este año", from: startOfYear(now), to: endOfYear(now), mode: "mes" as PeriodMode },
  ], [now, previousWeekStart, weekStart]);
  const activeDatePreset = useMemo(() => datePresets.find((preset) => desde === format(preset.from, "yyyy-MM-dd") && hasta === format(preset.to, "yyyy-MM-dd") && periodMode === preset.mode)?.key ?? "", [datePresets, desde, hasta, periodMode]);
  const applyDatePreset = (key: string) => {
    const preset = datePresets.find((item) => item.key === key); if (!preset) return;
    setDesde(format(preset.from, "yyyy-MM-dd")); setHasta(format(preset.to, "yyyy-MM-dd")); setPeriodMode(preset.mode);
  };
  const rangeDays = useMemo(() => differenceInCalendarDays(new Date(`${hasta}T00:00:00`), new Date(`${desde}T00:00:00`)), [desde, hasta]);
  const disabledGranularities = useMemo(() => { const disabled = new Set<PeriodMode>(); if (rangeDays > 31) disabled.add("dia"); if (rangeDays > 364) disabled.add("semana"); return disabled; }, [rangeDays]);
  useEffect(() => {
    if (periodMode === "dia" && rangeDays > 31) setPeriodMode(rangeDays <= 364 ? "semana" : "mes");
    else if (periodMode === "semana" && rangeDays > 364) setPeriodMode("mes");
  }, [periodMode, rangeDays]);

  const explorerRange = useMemo(() => {
    if (!selectedPeriod) return { desde, hasta };
    const start = new Date(`${selectedPeriod}T00:00:00`);
    const end = periodMode === "dia" ? endOfDay(start) : periodMode === "semana" ? endOfISOWeek(start) : periodMode === "anio" ? endOfYear(start) : endOfMonth(start);
    const periodEndIso = isoDate(end);
    return { desde: selectedPeriod > desde ? selectedPeriod : desde, hasta: periodEndIso < hasta ? periodEndIso : hasta };
  }, [selectedPeriod, desde, hasta, periodMode]);
  const copy = AREA_COPY[area];
  const activeFilters = Number(sucursal !== "TODAS") + Number(Boolean(buscar)) + Number(area === "servicios" && tipoTiempo !== "TODOS");
  const showHistoricalLimit = Boolean(data?.historico && area !== "maquinas");
  const summary = area === "servicios" && serviciosSummary ? serviciosSummary : data;
  const summaryCount = area === "servicios" ? serviciosSummary?.ordenes ?? data?.facturas : data?.facturas;
  return (
    <PageShell>
      <PageHeader title={copy.title} />
      <FiltersBar search={{ value: buscar, onChange: setBuscar, placeholder: copy.search }} activeCount={activeFilters} onClear={() => { setBuscar(""); setSucursal("TODAS"); setTipoTiempo("TODOS"); }} meta={summaryCount != null ? `${summaryCount.toLocaleString("es-PY")} ${area === "servicios" ? "OS" : "facturas"}` : undefined}>
        <FilterCustom label="Período rápido" width="w-[190px]"><select value={activeDatePreset} onChange={(event) => applyDatePreset(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]"><option value="">Personalizado</option>{datePresets.map((preset) => <option key={preset.key} value={preset.key}>{preset.label}</option>)}</select></FilterCustom>
        <FilterDate label="Desde" value={desde} onChange={setDesde} max={hasta} /><FilterDate label="Hasta" value={hasta} onChange={setHasta} min={desde} />
        <PeriodSelector value={periodMode} onChange={setPeriodMode} disabledModes={disabledGranularities} />
        <FilterSelect label="Sucursal" value={sucursal} onChange={setSucursal} placeholder="Todas" options={[{ value: "TODAS", label: "Todas" }, ...SUCURSALES.map((value) => ({ value, label: value }))]} />
        {area === "servicios" && <FilterSelect label="Tipo de tiempo" value={tipoTiempo} onChange={setTipoTiempo} placeholder="Todos" options={[{ value: "TODOS", label: "Todos" }, { value: "Cliente", label: "Cliente" }, { value: "Garantia", label: "Garantía" }, { value: "Interno", label: "Interno" }, { value: "No informado", label: "No informado" }]} />}
      </FiltersBar>
      {error ? <ErrorState description={error} onRetry={() => void load()} /> : <>
        <KpiStrip><KpiItem label="Facturado" value={loading ? "—" : usd.format(summary?.total ?? 0)} icon={<Receipt />} /><KpiItem label={area === "servicios" ? "Órdenes de servicio" : "Facturas"} value={loading ? "—" : (area === "servicios" ? serviciosSummary?.ordenes ?? data?.facturas ?? 0 : data?.facturas ?? 0).toLocaleString("es-PY")} icon={<FileText />} /><KpiItem label="Clientes" value={loading ? "—" : (summary?.clientes ?? 0).toLocaleString("es-PY")} icon={<Users />} /><KpiItem label={area === "servicios" ? "Promedio por OS" : "Promedio por factura"} value={loading ? "—" : usd.format(summary?.promedio ?? 0)} /></KpiStrip>
        {showHistoricalLimit && <details className="rounded-md border bg-background px-3 py-2 text-[10px] text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /><span>Alcance del histórico</span><ChevronDown className="ml-auto h-3.5 w-3.5" /></summary><p className="mt-2 pl-5">Antes del 01/07/2026 no existe una vinculación confiable entre factura y OS ni detalle por código de repuesto. Los totales se conservan por rubro contable.</p></details>}
        {area === "servicios" && (
          <ServiciosPanorama desde={desde} hasta={hasta} sucursal={sucursal} buscar={buscar} tipoTiempo={tipoTiempo} periodMode={periodMode} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} onSummary={setServiciosSummary} />
        )}
        <SalesExplorer area={area} data={data} loading={loading} desde={explorerRange.desde} hasta={explorerRange.hasta} sucursal={sucursal} buscar={buscar} tipoTiempo={tipoTiempo} />
      </>}
    </PageShell>
  );
}
