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
type PivotRow = "cliente" | "sucursal" | "factura" | "os" | "repuesto" | "maquina";
type SalesLine = {
  id: string; fecha: string; factura: string; cliente: string; sucursal: string | null;
  concepto: string; metodologia: "historico" | "actual"; total_venta: number; cantidad: number;
  os_numero: string | null; codigo: string | null; codigo_fabricante: string | null;
  descripcion: string | null; marca: string | null; modelo: string | null; chasis: string | null;
};
type SalesResponse = {
  total: number; facturas: number; clientes: number; promedio: number;
  historico: number; actual: number; cruza_corte: boolean; lineas: SalesLine[];
};

const AREA_COPY = {
  servicios: { title: "Ventas de Servicios", search: "OS, factura o cliente…", primary: "OS", primaryValue: "os" as const, empty: "No hay ventas de Servicios en el período." },
  repuestos: { title: "Ventas de Repuestos", search: "Código, repuesto, factura o cliente…", primary: "Repuesto", primaryValue: "repuesto" as const, empty: "No hay ventas de Repuestos en el período." },
  maquinas: { title: "Ventas de Máquinas", search: "Modelo, chasis, factura o cliente…", primary: "Máquina", primaryValue: "maquina" as const, empty: "No hay ventas de Máquinas en el período." },
};

const usd = new Intl.NumberFormat("es-PY", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function cleanModel(value: string | null) {
  return (value ?? "").replace(/\s*[-·]?\s*(?:chasis|casis)\s*:?\s*[\w-]+.*$/i, "").trim() || "Modelo no informado";
}
function lineIdentity(area: VentasArea, row: SalesLine) {
  if (area === "servicios") return row.os_numero || (row.metodologia === "historico" ? "OS no disponible" : "Sin OS vinculada");
  if (area === "repuestos") {
    const code = row.codigo_fabricante || row.codigo;
    const description = row.descripcion && row.descripcion.toUpperCase() !== "REPUESTOS" ? row.descripcion : null;
    if (code && description) return `${code} · ${description}`;
    return code || description || (row.metodologia === "historico" ? "Detalle no disponible en histórico" : "Repuesto sin identificar");
  }
  const model = cleanModel(row.modelo || row.descripcion);
  return row.chasis ? `${model} · ${row.chasis}` : model;
}
function rowDimension(area: VentasArea, row: SalesLine, dimension: PivotRow) {
  if (dimension === "cliente") return row.cliente || "Sin cliente";
  if (dimension === "sucursal") return row.sucursal || "Sin sucursal";
  if (dimension === "factura") return row.factura || "Sin factura";
  return lineIdentity(area, row);
}
function columnDimension(row: SalesLine, dimension: PivotColumn) {
  if (dimension === "none") return { key: "total", label: "Total" };
  if (dimension === "sucursal") { const label = row.sucursal || "Sin sucursal"; return { key: label, label }; }
  const key = row.fecha.slice(0, 7);
  const [year, month] = key.split("-");
  return { key, label: `${month}/${year}` };
}
function metricValue(value: { usd: number; facturas: Set<string>; cantidad: number }, metric: PivotMetric) {
  return metric === "usd" ? value.usd : metric === "facturas" ? value.facturas.size : value.cantidad;
}
function formatMetric(value: number, metric: PivotMetric) {
  if (metric === "usd") return usd.format(value);
  return metric === "facturas" ? Math.round(value).toLocaleString("es-PY") : quantity.format(value);
}

function SalesExplorer({ area, data, loading }: { area: VentasArea; data: SalesResponse | null; loading: boolean }) {
  const copy = AREA_COPY[area];
  const [view, setView] = useState<ExplorerView>("facturas");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pivotRows, setPivotRows] = useState<PivotRow>(copy.primaryValue);
  const [pivotColumns, setPivotColumns] = useState<PivotColumn>("mes");
  const [pivotMetric, setPivotMetric] = useState<PivotMetric>("usd");
  const lines = useMemo(() => data?.lineas ?? [], [data?.lineas]);

  useEffect(() => { setView("facturas"); setExpanded(null); setPivotRows(copy.primaryValue); }, [area, copy.primaryValue]);

  const invoices = useMemo(() => {
    const map = new Map<string, { key: string; factura: string; cliente: string; fecha: string; total: number; rows: SalesLine[] }>();
    lines.forEach((row) => {
      const key = `${row.factura}__${row.cliente}__${row.fecha}`;
      const current = map.get(key) ?? { key, factura: row.factura || "Sin factura", cliente: row.cliente || "Sin cliente", fecha: row.fecha, total: 0, rows: [] };
      current.total += Number(row.total_venta || 0); current.rows.push(row); map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.total - a.total);
  }, [lines]);

  const clients = useMemo(() => {
    const map = new Map<string, { name: string; total: number; invoices: Set<string>; rows: SalesLine[] }>();
    lines.forEach((row) => {
      const name = row.cliente || "Sin cliente";
      const current = map.get(name) ?? { name, total: 0, invoices: new Set<string>(), rows: [] };
      current.total += Number(row.total_venta || 0); current.invoices.add(`${row.factura}__${row.fecha}`); current.rows.push(row); map.set(name, current);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [lines]);

  const pivot = useMemo(() => {
    type Cell = { usd: number; facturas: Set<string>; cantidad: number };
    type Row = Cell & { key: string; cells: Map<string, Cell> };
    const columns = new Map<string, string>(); const rows = new Map<string, Row>();
    lines.forEach((line) => {
      const rowKey = rowDimension(area, line, pivotRows); const column = columnDimension(line, pivotColumns);
      columns.set(column.key, column.label);
      const current = rows.get(rowKey) ?? { key: rowKey, usd: 0, facturas: new Set<string>(), cantidad: 0, cells: new Map<string, Cell>() };
      const cell = current.cells.get(column.key) ?? { usd: 0, facturas: new Set<string>(), cantidad: 0 };
      const invoiceKey = `${line.factura}__${line.fecha}`;
      current.usd += Number(line.total_venta || 0); current.facturas.add(invoiceKey); current.cantidad += Number(line.cantidad || 0);
      cell.usd += Number(line.total_venta || 0); cell.facturas.add(invoiceKey); cell.cantidad += Number(line.cantidad || 0);
      current.cells.set(column.key, cell); rows.set(rowKey, current);
    });
    return { columns: [...columns].map(([key, label]) => ({ key, label })).sort((a, b) => a.key.localeCompare(b.key)), rows: [...rows.values()].sort((a, b) => metricValue(b, pivotMetric) - metricValue(a, pivotMetric)) };
  }, [area, lines, pivotColumns, pivotMetric, pivotRows]);

  const rowOptions = [{ value: copy.primaryValue, label: copy.primary }, { value: "cliente" as const, label: "Cliente" }, { value: "sucursal" as const, label: "Sucursal" }, { value: "factura" as const, label: "Factura" }];
  const partial = Boolean(data && data.facturas > invoices.length);

  return (
    <Panel className="p-3">
      <div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <div><h2 className="text-[13px] font-semibold">Detalle de facturación</h2><p className="text-[11px] text-muted-foreground">Consultá documentos, clientes o armá tu propio desglose.</p></div>
        <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border text-[11px]">
          {([['facturas', 'Facturas'], ['clientes', 'Clientes'], ['analisis', 'Análisis']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setView(value); setExpanded(null); }} className={cn("px-3 hover:bg-accent", view === value && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
        </div>
      </div>

      {loading ? <div className="py-16 text-center text-[12px] text-muted-foreground">Cargando facturación…</div> : view === "facturas" ? (
        <div className="mt-3 overflow-hidden rounded-md border">
          <div className="grid grid-cols-[130px_minmax(220px,1fr)_180px_110px_80px_130px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"><div>Factura</div><div>Cliente</div><div>{copy.primary}</div><div>Fecha</div><div className="text-right">Líneas</div><div className="text-right">Importe</div></div>
          <div className="max-h-[480px] overflow-y-auto">
            {!invoices.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">{copy.empty}</div> : invoices.map((invoice) => (
              <div key={invoice.key} className="border-t">
                <button type="button" onClick={() => setExpanded((current) => current === invoice.key ? null : invoice.key)} className="grid w-full grid-cols-[130px_minmax(220px,1fr)_180px_110px_80px_130px] items-center px-3 py-2 text-left text-[12px] hover:bg-accent"><div className="truncate font-mono font-semibold">{invoice.factura}</div><div className="truncate font-medium">{invoice.cliente}</div><div className="truncate text-muted-foreground" title={lineIdentity(area, invoice.rows[0])}>{lineIdentity(area, invoice.rows[0])}</div><div>{shortDate.format(new Date(`${invoice.fecha}T00:00:00`))}</div><div className="text-right tabular-nums">{invoice.rows.length}</div><div className="text-right font-semibold tabular-nums">{usd.format(invoice.total)}</div></button>
                {expanded === invoice.key && <div className="bg-muted/20 px-3 py-2"><div className="grid grid-cols-[minmax(260px,1fr)_150px_90px_130px] gap-3 text-[10px] font-medium text-muted-foreground"><div>{copy.primary} / detalle</div><div>Rubro</div><div className="text-right">Cantidad</div><div className="text-right">Importe</div></div>{invoice.rows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(260px,1fr)_150px_90px_130px] gap-3 border-t border-border/50 py-1.5 text-[11px]"><div className="truncate" title={lineIdentity(area, row)}>{lineIdentity(area, row)}</div><div className="truncate text-muted-foreground">{row.concepto}</div><div className="text-right tabular-nums">{quantity.format(row.cantidad)}</div><div className="text-right font-medium tabular-nums">{usd.format(row.total_venta)}</div></div>)}</div>}
              </div>
            ))}
          </div>
          {partial && <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">Se muestran las líneas más recientes; los indicadores superiores consideran el total completo.</div>}
        </div>
      ) : view === "clientes" ? (
        <div className="mt-3 overflow-hidden rounded-md border">
          <div className="grid grid-cols-[minmax(260px,1fr)_100px_130px_140px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"><div>Cliente</div><div className="text-right">Facturas</div><div className="text-right">Ticket promedio</div><div className="text-right">Facturación</div></div>
          <div className="max-h-[480px] overflow-y-auto">{!clients.length ? <div className="py-12 text-center text-[12px] text-muted-foreground">{copy.empty}</div> : clients.map((client) => <div key={client.name} className="border-t"><button type="button" onClick={() => setExpanded((current) => current === client.name ? null : client.name)} className="grid w-full grid-cols-[minmax(260px,1fr)_100px_130px_140px] items-center px-3 py-2 text-left text-[12px] hover:bg-accent"><div className="truncate font-medium">{client.name}</div><div className="text-right tabular-nums">{client.invoices.size}</div><div className="text-right tabular-nums">{usd.format(client.total / Math.max(client.invoices.size, 1))}</div><div className="text-right font-semibold tabular-nums">{usd.format(client.total)}</div></button>{expanded === client.name && <div className="bg-muted/20 px-3 py-2 text-[11px]">{client.rows.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((row) => <div key={row.id} className="grid grid-cols-[130px_110px_minmax(240px,1fr)_130px] gap-3 border-t border-border/50 py-1.5"><div className="font-mono text-muted-foreground">{row.factura}</div><div>{shortDate.format(new Date(`${row.fecha}T00:00:00`))}</div><div className="truncate text-muted-foreground">{lineIdentity(area, row)}</div><div className="text-right font-medium tabular-nums">{usd.format(row.total_venta)}</div></div>)}</div>}</div>)}</div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 rounded-md border p-3 md:grid-cols-3">
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Filas</span><select value={pivotRows} onChange={(event) => setPivotRows(event.target.value as PivotRow)} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]">{rowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Columnas</span><select value={pivotColumns} onChange={(event) => setPivotColumns(event.target.value as PivotColumn)} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="mes">Mes</option><option value="sucursal">Sucursal</option><option value="none">Sin columnas</option></select></label>
            <label className="space-y-1"><span className="text-[10px] font-medium text-muted-foreground">Medida</span><select value={pivotMetric} onChange={(event) => setPivotMetric(event.target.value as PivotMetric)} className="h-9 w-full rounded-md border bg-background px-3 text-[12px]"><option value="usd">USD</option><option value="facturas">Facturas</option><option value="cantidad">Cantidad</option></select></label>
          </div>
          {area === "repuestos" && data?.historico !== 0 && <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />El código y la descripción del repuesto no existen en el histórico anterior al 01/07/2026; para ese tramo conviene analizar por cliente, sucursal o factura.</div>}
          <div className="overflow-x-auto rounded-md border"><div className="min-w-max"><div className="grid items-center border-b bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground" style={{ gridTemplateColumns: `260px repeat(${Math.max(pivot.columns.length, 1)}, minmax(130px, 1fr)) 140px` }}><div>{rowOptions.find((option) => option.value === pivotRows)?.label}</div>{pivot.columns.map((column) => <div key={column.key} className="text-right">{column.label}</div>)}<div className="text-right">Total</div></div><div className="max-h-[440px] overflow-y-auto">{!pivot.rows.length ? <div className="w-[700px] py-12 text-center text-[12px] text-muted-foreground">No hay datos para esta combinación.</div> : pivot.rows.map((row) => <div key={row.key} className="grid items-center border-b px-3 py-2 text-[12px] last:border-0" style={{ gridTemplateColumns: `260px repeat(${Math.max(pivot.columns.length, 1)}, minmax(130px, 1fr)) 140px` }}><div className="truncate font-medium" title={row.key}>{row.key}</div>{pivot.columns.map((column) => <div key={column.key} className="text-right tabular-nums text-muted-foreground">{row.cells.get(column.key) ? formatMetric(metricValue(row.cells.get(column.key)!, pivotMetric), pivotMetric) : "—"}</div>)}<div className="text-right font-semibold tabular-nums">{formatMetric(metricValue(row, pivotMetric), pivotMetric)}</div></div>)}</div></div></div>
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
        {showHistoricalLimit && <details className="rounded-md border bg-background px-3 py-2 text-[10px] text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /><span>Alcance del histórico</span><ChevronDown className="ml-auto h-3.5 w-3.5" /></summary><p className="mt-2 pl-5">Antes del 01/07/2026 no existe una vinculación confiable entre factura y OS ni detalle por código de repuesto. Los totales se conservan por rubro contable.</p></details>}
        <SalesExplorer area={area} data={data} loading={loading} />
      </>}
    </PageShell>
  );
}
