/* eslint-disable @typescript-eslint/no-explicit-any -- La RPC queda tipada al regenerar los tipos después de aplicar su migración. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Receipt, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageShell, KpiItem, KpiStrip, Panel } from "@/components/layout/AppPrimitives";
import { FilterDate, FilterSelect, FiltersBar } from "@/components/filters/FiltersBar";
import { ErrorState } from "@/components/ErrorState";
import { cn } from "@/lib/utils";
import { SUCURSALES } from "@/lib/constants";

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
};
type DocumentsResponse = { total: number; pagina: number; por_pagina: number; paginas: number; documentos: SalesDocument[] };

const AREA_COPY = {
  servicios: { title: "Ventas de Servicios", search: "OS, factura o cliente…", primary: "OS", primaryValue: "concepto" as const, empty: "No hay ventas de Servicios en el período." },
  repuestos: { title: "Ventas de Repuestos", search: "Código, repuesto, factura o cliente…", primary: "Repuesto", primaryValue: "repuesto" as const, empty: "No hay ventas de Repuestos en el período." },
  maquinas: { title: "Ventas de Máquinas", search: "Modelo, chasis, factura o cliente…", primary: "Máquina", primaryValue: "subgrupo" as const, empty: "No hay ventas de Máquinas en el período." },
};

const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function cleanModel(value: string | null) {
  return (value ?? "").replace(/\s*[-·]?\s*(?:chasis|casis)\s*:?\s*[\w-]+.*$/i, "").trim() || "Modelo no informado";
}
function lineIdentity(area: VentasArea, row: SalesLine) {
  if (area === "servicios") return row.os_numero || (row.es_nota_credito ? "Nota de crédito" : "OS no disponible");
  if (area === "repuestos") {
    const code = row.codigo_fabricante || row.codigo;
    const description = row.descripcion && row.descripcion.toUpperCase() !== "REPUESTOS" ? row.descripcion : null;
    if (code && description) return `${code} · ${description}`;
    return code || description || (row.metodologia === "historico" ? "Detalle no disponible en histórico" : "Repuesto sin identificar");
  }
  const model = cleanModel(row.modelo || row.descripcion);
  return row.chasis ? `${model} · ${row.chasis}` : model;
}
function formatMetric(value: number, metric: PivotMetric) {
  if (metric === "usd") return usd.format(value);
  return metric === "facturas" ? Math.round(value).toLocaleString("es-PY") : quantity.format(value);
}

function Pager({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (page: number) => void }) {
  if (total <= 0) return null;
  return <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground"><span>{total.toLocaleString("es-PY")} registros</span><div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded border px-2 py-1 text-foreground disabled:opacity-40">Anterior</button><span>{page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded border px-2 py-1 text-foreground disabled:opacity-40">Siguiente</button></div></div>;
}

function SalesExplorer({ area, data, loading, desde, hasta, sucursal, buscar }: { area: VentasArea; data: SalesResponse | null; loading: boolean; desde: string; hasta: string; sucursal: string; buscar: string }) {
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
  const clients = useMemo(() => data?.clientes_detalle ?? [], [data?.clientes_detalle]);

  useEffect(() => { setView("facturas"); setExpanded(null); setDocumentPage(1); setAnalysisPage(1); setPivotRows(copy.primaryValue); setPivotMetric("usd"); }, [area, copy.primaryValue]);
  useEffect(() => { setDocumentPage(1); setAnalysisPage(1); }, [buscar, desde, hasta, sucursal]);

  useEffect(() => {
    if (view !== "facturas") return;
    let alive = true;
    setDocumentsLoading(true); setDocumentsError(null);
    void (supabase as any).rpc("ventas_area_documentos", {
      p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal,
      p_buscar: buscar.trim() || null, p_pagina: documentPage, p_por_pagina: 50,
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

  function documentIdentity(document: SalesDocument) {
    const first = document.lineas[0];
    if (area === "servicios") return first?.os_numero || (first?.es_nota_credito ? "Nota de crédito" : "OS no disponible");
    return first ? lineIdentity(area, first) : "—";
  }
  function serviceComposition(document: SalesDocument) {
    return [...new Set(document.lineas.map((line) => line.concepto === "Servicio" ? "Mano de obra" : line.concepto))].join(" · ");
  }

  return (
    <Panel className="p-3">
      <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[13px] font-semibold">Detalle de facturación</h2>
        <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border text-[11px]">
          {([['facturas', 'Facturas'], ['clientes', 'Clientes'], ['analisis', 'Análisis']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setView(value); setExpanded(null); }} className={cn("px-3 hover:bg-accent", view === value && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
        </div>
      </div>

      {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando facturación…</div> : view === "facturas" ? (
        <div className="mt-3 overflow-hidden rounded-md border">
          <div className={cn("grid bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground", area === "servicios" ? "grid-cols-[130px_minmax(210px,1fr)_150px_220px_100px_125px]" : area === "maquinas" ? "grid-cols-[130px_minmax(210px,1fr)_210px_130px_100px_125px]" : "grid-cols-[130px_minmax(210px,1fr)_minmax(260px,1fr)_100px_70px_125px]")}><div>Factura</div><div>Cliente</div><div>{area === "maquinas" ? "Modelo" : copy.primary}</div>{area === "servicios" ? <div>Composición</div> : area === "maquinas" ? <div>Chasis</div> : <div>Fecha</div>}<div>{area === "repuestos" ? "Líneas" : "Fecha"}</div><div className="text-right">Importe</div></div>
          <div className="max-h-[480px] overflow-y-auto">
            {documentsLoading ? <div className="py-12 text-center text-[12px] text-muted-foreground">Cargando facturas…</div> : documentsError ? <div className="py-12 text-center text-[12px] text-destructive">{documentsError}</div> : !documents.documentos.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">{copy.empty}</div> : documents.documentos.map((document) => (
              <div key={`${document.id}_${document.factura}`} className="border-t">
                <button type="button" onClick={() => setExpanded((current) => current === document.id ? null : document.id)} className={cn("grid w-full items-center px-3 py-2 text-left text-[12px] hover:bg-accent", area === "servicios" ? "grid-cols-[130px_minmax(210px,1fr)_150px_220px_100px_125px]" : area === "maquinas" ? "grid-cols-[130px_minmax(210px,1fr)_210px_130px_100px_125px]" : "grid-cols-[130px_minmax(210px,1fr)_minmax(260px,1fr)_100px_70px_125px]")}><div className="truncate font-mono font-semibold">{document.factura}</div><div className="truncate font-medium">{document.cliente}</div><div className="truncate text-muted-foreground" title={documentIdentity(document)}>{area === "maquinas" ? cleanModel(document.lineas[0]?.modelo || document.lineas[0]?.descripcion) : documentIdentity(document)}</div>{area === "servicios" ? <div className="truncate text-muted-foreground" title={serviceComposition(document)}>{serviceComposition(document)}</div> : area === "maquinas" ? <div className="truncate font-mono text-muted-foreground">{document.lineas[0]?.chasis || "—"}</div> : <div>{shortDate.format(new Date(`${document.fecha}T00:00:00`))}</div>}<div>{area === "repuestos" ? <span className="block text-right tabular-nums">{document.cantidad_lineas}</span> : shortDate.format(new Date(`${document.fecha}T00:00:00`))}</div><div className="text-right font-semibold tabular-nums">{usd.format(document.total_venta)}</div></button>
                {expanded === document.id && <div className="bg-muted/20 px-3 py-2"><div className="grid grid-cols-[minmax(300px,1fr)_150px_90px_130px] gap-3 text-[10px] font-medium text-muted-foreground"><div>{copy.primary} / detalle</div><div>Componente</div><div className="text-right">Cantidad</div><div className="text-right">Importe</div></div>{document.lineas.map((row) => <div key={row.id} className="grid grid-cols-[minmax(300px,1fr)_150px_90px_130px] gap-3 border-t border-border/50 py-1.5 text-[11px]"><div className="truncate" title={lineIdentity(area, row)}>{lineIdentity(area, row)}</div><div className="truncate text-muted-foreground">{row.concepto === "Servicio" ? "Mano de obra" : row.concepto}</div><div className="text-right tabular-nums">{quantity.format(row.cantidad)}</div><div className="text-right font-medium tabular-nums">{usd.format(row.total_venta)}</div></div>)}</div>}
              </div>
            ))}
          </div>
          <Pager page={documents.pagina} pages={documents.paginas} total={documents.total} onChange={(page) => { setDocumentPage(page); setExpanded(null); }} />
        </div>
      ) : view === "clientes" ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {!clients.length ? <div className="col-span-full py-12 text-center text-[12px] text-muted-foreground">{copy.empty}</div> : clients.map((client) => <div key={client.nombre} className="rounded-md border px-3 py-2.5"><div className="truncate text-[12px] font-medium" title={client.nombre}>{client.nombre}</div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground"><div><span className="block">Facturas</span><strong className="text-[12px] font-medium text-foreground tabular-nums">{client.facturas}</strong></div><div><span className="block">Promedio</span><strong className="text-[12px] font-medium text-foreground tabular-nums">{usd.format(Number(client.importe) / Math.max(client.facturas, 1))}</strong></div><div className="text-right"><span className="block">Facturación</span><strong className="text-[12px] font-semibold text-foreground tabular-nums">{usd.format(Number(client.importe))}</strong></div></div></div>)}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Analizar por</span><select value={pivotRows} onChange={(event) => { const next = event.target.value as PivotRow; setPivotRows(next); if (next === "concepto" && pivotMetric === "facturas") setPivotMetric("usd"); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">{rowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Desagregar en</span><select value={pivotColumns} onChange={(event) => { setPivotColumns(event.target.value as PivotColumn); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="mes">Mes</option><option value="sucursal">Sucursal</option><option value="none">Sin desglose</option></select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Mostrar</span><select value={pivotMetric} onChange={(event) => { setPivotMetric(event.target.value as PivotMetric); setAnalysisPage(1); }} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="usd">Facturación USD</option><option value="cantidad">{area === "maquinas" ? "Unidades" : "Cantidad"}</option>{pivotRows !== "concepto" && <option value="facturas">Facturas</option>}</select></label>
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
  const [data, setData] = useState<SalesResponse | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    if (!desde || !hasta || desde > hasta) { setError("Seleccioná un rango de fechas válido."); setData(null); setLoading(false); return; }
    const { data: response, error: rpcError } = await (supabase as any).rpc("ventas_area_resumen", { p_area: area, p_desde: desde, p_hasta: hasta, p_sucursal: sucursal === "TODAS" ? null : sucursal, p_buscar: buscar.trim() || null, p_limite: 500 });
    if (rpcError) { setError(rpcError.message ?? "No se pudo cargar Ventas."); setData(null); } else setData(response as SalesResponse);
    setLoading(false);
  }, [area, buscar, desde, hasta, sucursal]);
  useEffect(() => { void load(); }, [load]);
  const copy = AREA_COPY[area]; const activeFilters = Number(sucursal !== "TODAS") + Number(Boolean(buscar)); const showHistoricalLimit = Boolean(data?.historico && area !== "maquinas");
  return (
    <PageShell>
      <PageHeader title={copy.title} />
      <FiltersBar search={{ value: buscar, onChange: setBuscar, placeholder: copy.search }} activeCount={activeFilters} onClear={() => { setBuscar(""); setSucursal("TODAS"); }} meta={data ? `${data.facturas.toLocaleString("es-PY")} facturas` : undefined}><FilterDate label="Desde" value={desde} onChange={setDesde} max={hasta} /><FilterDate label="Hasta" value={hasta} onChange={setHasta} min={desde} /><FilterSelect label="Sucursal" value={sucursal} onChange={setSucursal} placeholder="Todas" options={[{ value: "TODAS", label: "Todas" }, ...SUCURSALES.map((value) => ({ value, label: value }))]} /></FiltersBar>
      {error ? <ErrorState description={error} onRetry={() => void load()} /> : <>
        <KpiStrip><KpiItem label="Facturado" value={loading ? "—" : usd.format(data?.total ?? 0)} icon={<Receipt />} /><KpiItem label="Facturas" value={loading ? "—" : (data?.facturas ?? 0).toLocaleString("es-PY")} icon={<FileText />} /><KpiItem label="Clientes" value={loading ? "—" : (data?.clientes ?? 0).toLocaleString("es-PY")} icon={<Users />} /><KpiItem label="Promedio por factura" value={loading ? "—" : usd.format(data?.promedio ?? 0)} /></KpiStrip>
        {area === "servicios" && Boolean(data?.pendientes_vinculacion?.facturas) && <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span>{data!.pendientes_vinculacion.facturas.toLocaleString("es-PY")} factura(s) con conceptos de servicio quedaron fuera por no tener OS vinculada. Importe a revisar: {usd.format(data!.pendientes_vinculacion.importe)}.</span></div>}
        {showHistoricalLimit && <details className="rounded-md border bg-background px-3 py-2 text-[10px] text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /><span>Alcance del histórico</span><ChevronDown className="ml-auto h-3.5 w-3.5" /></summary><p className="mt-2 pl-5">Antes del 01/07/2026 no existe una vinculación confiable entre factura y OS ni detalle por código de repuesto. Los totales se conservan por rubro contable.</p></details>}
        <SalesExplorer area={area} data={data} loading={loading} desde={desde} hasta={hasta} sucursal={sucursal} buscar={buscar} />
      </>}
    </PageShell>
  );
}
