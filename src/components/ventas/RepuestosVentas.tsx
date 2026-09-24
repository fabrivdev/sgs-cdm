/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs nuevas, tipadas al regenerar Supabase. */
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileSalesTable } from "./MobileSalesTable";
import { SalesViewSwitcher } from "./SalesViewSwitcher";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Receipt, Users } from "lucide-react";
import { RowCount, TableScroll, salesHeader } from "./TableScroll";
import { MarcaBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { KpiItem, KpiStrip, Panel } from "@/components/layout/AppPrimitives";
import { money, pct } from "@/components/dashboard/utils";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";
import { partsSellerName } from "@/lib/partsSellerName";
import { PARTS_HEADERS, partsRange, validPartsRange as validRange } from "./partsSalesFormat";
import { useAuth } from "@/hooks/useAuth";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { useSalesSectionExport } from "./SalesSectionExports";
import { SalesSortButton } from "./SalesTableControls";
import type { SalesColumn, SalesSort } from "./salesTableInteraction";

type Filters = { desde: string; hasta: string; sucursal: string; buscar: string };
export type PartsMetrics = {
  facturado: number; ventas: number; notas_credito: number; clientes: number;
  documentos: number; documentos_nc: number; lineas: number; unidades_netas: number | null;
};
export type PartsPeriod = PartsMetrics & {
  periodo: string; desde: string; hasta: string; anterior: number; anterior_lineas: number;
  anio_anterior: number; anio_anterior_lineas: number;
};
export type PartsOverview = {
  resumen: PartsMetrics; periodos: PartsPeriod[];
  por_sucursal: Array<PartsMetrics & { sucursal: string }>;
  por_marca: Array<PartsMetrics & { marca: string }>;
  comparacion: { facturado: number; lineas: number; desde: string; hasta: string };
  comparacion_ly: { facturado: number; lineas: number; desde: string; hasta: string };
};
type View = "resumen" | "vendedores" | "clientes" | "repuestos" | "detalle";
export type PartsRow = Partial<PartsMetrics> & {
  id: string; facturado: number; fecha?: string; factura?: string; cliente?: string;
  sucursal?: string; codigo?: string; codigo_fabricante?: string; descripcion?: string;
  cantidad?: number | null; metodologia?: string; es_nota_credito?: boolean;
  marca?: string; vendedor?: string;
  abc?: "A" | "B" | "C" | null;
  unidades_vendidas?: number | null; unidades_devueltas?: number | null;
  anterior?: number | null; ultima?: string;
};
export type PartsListing = { total: number; pagina: number; paginas: number; total_periodo: number; filas: PartsRow[] };
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const date = (value?: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const number = (value: number | null | undefined) => value == null ? "—" : decimal.format(value);
const share = (value: number, total: number) => total ? `${Math.round(value / total * 100)}%` : "—";
const seller = partsSellerName;
const brand = (value?: string) => value === "CLAAS" || value === "HORSCH" ? value : "Otros";
function params(filters: Filters) {
  return { p_desde: filters.desde, p_hasta: filters.hasta, p_sucursal: filters.sucursal === "TODAS" ? null : filters.sucursal, p_buscar: filters.buscar.trim() || null };
}
async function rpc<T>(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const result = await (supabase as any).rpc(name, args).abortSignal(signal);
  if (result.error) {
    if (result.error.code === "PGRST202" || result.error.code === "42883") throw new Error("Falta aplicar el SQL de Ventas de Repuestos.");
    if (result.error.code === "57014") throw new Error("La consulta excedió el tiempo disponible. Probá con un período más corto.");
    throw new Error(result.error.message || "No se pudo cargar Ventas de Repuestos.");
  }
  if (!result.data) throw new Error("La consulta no devolvió datos.");
  return result.data as T;
}
function useOverview(filters: Filters, mode: PeriodMode) {
  return useQuery({ queryKey: ["ventas-repuestos-panorama-v2", params(filters), mode],
    queryFn: ({ signal }) => rpc<PartsOverview>("ventas_repuestos_panorama_v2", { ...params(filters), p_agrupacion: mode }, signal),
    enabled: validRange(filters), retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
}
function State({ loading, error, retry }: { loading?: boolean; error?: Error | null; retry?: () => void }) {
  return <div role={error ? "alert" : "status"} className={cn("py-10 text-center text-[12px]", error ? "text-destructive" : "text-muted-foreground")}>
    {error ? error.message : loading ? "Cargando ventas…" : "No hay ventas de Repuestos en el período."}
    {error && retry && <button type="button" onClick={retry} className="ml-3 rounded border px-2 py-1 text-foreground">Reintentar</button>}
  </div>;
}
function metricColumns<T extends Partial<PartsMetrics>>(client = false): SalesColumn<T>[] {
  return [
    ...(["facturado", "ventas", "notas_credito"] as const).map((key, i) => ({ key, label: PARTS_HEADERS[i], kind: "number" as const, align: "right" as const, value: (r: T) => r[key], excelFormat: '"$" #,##0.00' })),
    { key: client ? "ticket" : "clientes", label: client ? "Ticket Medio" : "Clientes", kind: "number", align: client ? "right" : "center", excelFormat: client ? '"$" #,##0.00' : undefined, value: r => client ? r.documentos && r.facturado != null ? r.facturado / r.documentos : null : r.clientes },
    { key: "documentos", label: "Documentos", kind: "number", align: "center", value: r => r.documentos },
    { key: "unidades_netas", label: "Unidades netas", kind: "number", align: "center", value: r => r.unidades_netas },
  ];
}
function participation<T extends Partial<PartsMetrics>>(total: number): SalesColumn<T> {
  return { key: "participacion", label: "Participación", kind: "number", align: "right", value: r => total && r.facturado != null ? r.facturado / total : null, excelFormat: "0%" };
}
function listingColumns(view: Exclude<View, "resumen">, total: number): SalesColumn<PartsRow>[] {
  const text = (key: keyof PartsRow, label: string): SalesColumn<PartsRow> => ({ key, label, kind: "text", value: r => r[key] as string | null | undefined });
  const amount: SalesColumn<PartsRow> = { key: "facturado", label: "Facturación", kind: "number", align: "right", value: r => r.facturado, excelFormat: '"$" #,##0.00' };
  if (view === "detalle") return [
    { key: "fecha", label: "Fecha", kind: "date", value: r => r.fecha?.slice(0, 10) },
    text("factura", "Factura"), text("sucursal", "Sucursal"), text("cliente", "Cliente"), text("marca", "Marca"),
    text("codigo", "Código"), text("codigo_fabricante", "Cód. fabricante"), text("descripcion", "Descripción"),
    { key: "cantidad", label: "Cantidad", kind: "number", align: "center", value: r => r.cantidad }, amount,
  ];
  if (view === "repuestos") return [text("codigo", "Código"), text("descripcion", "Descripción"), text("marca", "Marca"), amount,
    { key: "unidades_netas", label: "Unidades", kind: "number", align: "center", value: r => r.unidades_netas },
    { key: "clientes", label: "Clientes", kind: "number", align: "center", value: r => r.clientes },
    { key: "documentos", label: "Documentos", kind: "number", align: "center", value: r => r.documentos },
    participation(total), { ...text("abc", "ABC"), align: "center" }];
  return [view === "clientes" ? text("cliente", "Cliente facturado") : { key: "vendedor", label: "Vendedor", kind: "text", value: r => seller(r.vendedor) },
    ...metricColumns<PartsRow>(view === "clientes"),
    ...(view === "clientes" ? [
      { key: "anterior", label: "Año anterior", kind: "number" as const, align: "right" as const, excelFormat: '"$" #,##0.00', value: (r: PartsRow) => r.anterior },
      { key: "variacion", label: "Variación LY", kind: "number" as const, align: "right" as const, value: (r: PartsRow) => r.anterior == null ? null : pct(r.facturado, r.anterior) == null ? null : pct(r.facturado, r.anterior)! / 100, excelFormat: "0%" },
      { key: "ultima", label: "Última compra", kind: "date" as const, value: (r: PartsRow) => r.ultima?.slice(0, 10) },
    ] : []), participation(total)];
}
function Metrics({ row, client = false }: { row: Partial<PartsMetrics>; client?: boolean }) {
  return <>{[row.facturado, row.ventas, row.notas_credito].map((value, index) => <td key={index} className={cn("text-right tabular-nums", index === 0 ? "font-semibold" : "text-muted-foreground")}>{value == null ? "—" : money(value)}</td>)}
    <td className={client ? "text-right tabular-nums" : "text-center tabular-nums"}>{client ? row.documentos && row.facturado != null ? money(row.facturado / row.documentos) : "—" : number(row.clientes)}</td><td className="text-center tabular-nums">{number(row.documentos)}</td><td className="text-center tabular-nums">{number(row.unidades_netas)}</td></>;
}
function Delta({ current, previous, lines }: { current: number; previous: number | null | undefined; lines?: number }) {
  const value = previous == null || lines === 0 ? null : pct(current, previous);
  return <span className={cn("tabular-nums", value != null && value < 0 && "text-destructive")} title={value == null ? "Sin base de comparación distinta de cero." : undefined}>{value == null ? "—" : `${value > 0 ? "+" : ""}${value}%`}</span>;
}
const tableClass = "w-full table-fixed text-[12px] leading-4 [&_th]:h-8 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_td]:h-8 [&_td]:px-3 [&_td]:align-middle [&_tbody_tr]:border-t";
function Table({ children, minWidth = "min-w-0", rows = 0, footer }: { children: React.ReactNode; minWidth?: string; rows?: number; footer?: React.ReactNode }) {
  return <div className="overflow-hidden rounded-md border"><div className="overflow-hidden"><TableScroll rows={rows}><table className={cn(tableClass, minWidth)}>{children}</table></TableScroll></div>{footer}</div>;
}
function Heads<T>({ columns, sort, toggle }: { columns: readonly SalesColumn<T>[]; sort: SalesSort; toggle: (key: string) => void }) {
  return <thead className={`text-muted-foreground ${salesHeader}`}><tr>{columns.map(c => <th key={c.key} aria-sort={sort.key === c.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className={cn("sticky top-0 z-10 bg-muted/60", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}><SalesSortButton label={c.label} kind={c.kind} align={c.align} active={sort.key === c.key} direction={sort.direction} onClick={() => toggle(c.key)} /></th>)}</tr></thead>;
}
function PeriodLabel({ value, mode }: { value: string; mode: PeriodMode }) {
  const start = new Date(`${value}T00:00:00`);
  if (mode === "anio") return <>{start.getFullYear()}</>;
  if (mode === "dia") return <>{date(value)}</>;
  if (mode === "semana") return <>Sem. {date(value)}</>;
  return <span className="capitalize">{new Intl.DateTimeFormat("es-PY", { month: "short", year: "numeric" }).format(start)}</span>;
}
function Panorama({ data, loading, error, retry, mode, selected, onSelect }: {
  data?: PartsOverview; loading: boolean; error: Error | null; retry: () => void; mode: PeriodMode;
  selected: string | null; onSelect: (value: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile(1024);
  const columns: SalesColumn<PartsPeriod>[] = [
    { key: "periodo", label: "Período", kind: "text", value: r => r.periodo, exportValue: r => r.periodo || "Total del período" },
    ...metricColumns<PartsPeriod>(),
    { key: "lm", label: "Variación LM", kind: "number", align: "right", value: r => r.anterior_lineas === 0 ? null : pct(r.facturado, r.anterior) == null ? null : pct(r.facturado, r.anterior)! / 100, excelFormat: "0%" },
    { key: "ly", label: "Variación LY", kind: "number", align: "right", value: r => r.anio_anterior_lineas === 0 ? null : pct(r.facturado, r.anio_anterior) == null ? null : pct(r.facturado, r.anio_anterior)! / 100, excelFormat: "0%" },
    participation(data?.resumen.facturado ?? 0),
  ];
  const table = useSectionTable({ rows: data?.periodos ?? [], columns, title: "Períodos de Repuestos", fileName: "ventas-repuestos-periodos.xlsx", initialSort: { key: "periodo", direction: "asc" },
    disabled: loading || !!error || collapsed, footer: data ? { ...data.resumen, periodo: "", desde: "", hasta: "", anterior: data.comparacion.facturado, anterior_lineas: data.comparacion.lineas, anio_anterior: data.comparacion_ly.facturado, anio_anterior_lineas: data.comparacion_ly.lineas } : undefined });
  return <Panel className="p-0 lg:p-3">
    <div className="flex min-h-11 items-center justify-between gap-2 px-3 lg:min-h-0 lg:px-0">
      <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="flex flex-1 items-center justify-between text-left text-[13px] font-semibold">Evolución de la facturación{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
      {selected && <button type="button" onClick={() => onSelect(null)} className="rounded border px-2 py-1 text-[11px]">Ver período completo</button>}
    </div>
    {!collapsed && <div className="lg:mt-3">{loading || error || !data ? <State loading={loading} error={error} retry={retry} /> : isMobile ? <MobileSalesTable embedded title="Períodos de Repuestos" rows={table.ordered} columns={columns.map(c => c.key === "periodo" ? {...c, render:(r:PartsPeriod)=><PeriodLabel value={r.periodo} mode={mode} />} : c)} rowKey={r=>r.periodo} sort={table.sort} toggleSort={table.toggleSort} onRowClick={r=>onSelect(selected===r.periodo?null:r.periodo)} selected={r=>selected===r.periodo} footer={{...data.resumen,periodo:"",desde:"",hasta:"",anterior:data.comparacion.facturado,anterior_lineas:data.comparacion.lineas,anio_anterior:data.comparacion_ly.facturado,anio_anterior_lineas:data.comparacion_ly.lineas}} /> : <Table minWidth="min-w-0">
      <colgroup><col style={{ width: "13%" }} />{PARTS_HEADERS.map(label => <col key={label} style={{ width: "10%" }} />)}<col /><col /><col /></colgroup>
      <Heads columns={columns} sort={table.sort} toggle={table.toggleSort} />
      <tbody>{table.ordered.map(row => <tr key={row.periodo} className={cn("hover:bg-accent", selected === row.periodo && "bg-primary/5")}>
        <td><button type="button" aria-pressed={selected === row.periodo} onClick={() => onSelect(selected === row.periodo ? null : row.periodo)} className="w-full text-left font-medium hover:text-primary"><PeriodLabel value={row.periodo} mode={mode} /></button></td>
        <Metrics row={row} /><td className="text-right"><Delta current={row.facturado} previous={row.anterior} lines={row.anterior_lineas} /></td><td className="text-right"><Delta current={row.facturado} previous={row.anio_anterior} lines={row.anio_anterior_lineas} /></td><td className="text-right text-muted-foreground">{share(row.facturado, data.resumen.facturado)}</td>
      </tr>)}</tbody>
      <tfoot className="border-t bg-muted/30 font-semibold"><tr><td>Total del período</td><Metrics row={data.resumen} /><td className="text-right"><Delta current={data.resumen.facturado} previous={data.comparacion.facturado} lines={data.comparacion.lineas} /></td><td className="text-right"><Delta current={data.resumen.facturado} previous={data.comparacion_ly.facturado} lines={data.comparacion_ly.lineas} /></td><td className="text-right">{share(data.resumen.facturado, data.resumen.facturado)}</td></tr></tfoot>
    </Table>}
    </div>}
  </Panel>;
}
function Summary({ data }: { data: PartsOverview }) {
  const brandOrder = ["CLAAS", "HORSCH", "Otros"];
  const groups = [
    ["Sucursal", data.por_sucursal.map(row => ({ ...row, label: row.sucursal }))],
    ["Marca", data.por_marca.map(row => ({ ...row, label: brand(row.marca) })).sort((a, b) => brandOrder.indexOf(a.label) - brandOrder.indexOf(b.label))],
  ] as const;
  return <div className="space-y-3">
    {groups.map(([label, rows]) => <SummaryGroup key={label} label={label} rows={rows} total={data.resumen.facturado} />)}
  </div>;
}
function SummaryGroup({ label, rows, total }: { label: string; rows: Array<PartsMetrics & { label: string }>; total: number }) {
  const isMobile = useIsMobile(1024);
  const columns: SalesColumn<PartsMetrics & { label: string }>[] = [{ key: "label", label, kind: "text", value: r => r.label }, ...metricColumns(), participation(total)];
  const table = useSectionTable({ rows, columns, title: `Repuestos por ${label.toLowerCase()}`, fileName: `ventas-repuestos-${label.toLowerCase()}.xlsx`, initialSort: { key: "facturado", direction: "desc" } });
  if (isMobile) return <MobileSalesTable title={`Repuestos por ${label.toLowerCase()}`} rows={table.ordered} columns={columns} rowKey={r=>r.label} sort={table.sort} toggleSort={table.toggleSort} />;
  return <Table>
      <colgroup><col style={{ width: "28%" }} />{PARTS_HEADERS.map(head => <col key={head} />)}<col /></colgroup>
      <Heads columns={columns} sort={table.sort} toggle={table.toggleSort} /><tbody>{table.ordered.map(row => <tr key={row.label}><td className="font-medium">{row.label}</td><Metrics row={row} /><td className="text-right">{share(row.facturado, total)}</td></tr>)}</tbody>
    </Table>;
}
function Listing({ filters, view }: { filters: Filters; view: "vendedores" | "clientes" | "repuestos" | "detalle" }) {
  const isMobile = useIsMobile(1024);
  const { can } = useAuth();
  const [sort, setSort] = useState<SalesSort>({ key: view === "detalle" ? "fecha" : "facturado", direction: "desc" });
  const toggleSort = (key: string) => setSort(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  const columns = listingColumns(view, 0);
  const exportController = useRef<AbortController | null>(null);
  useEffect(() => () => exportController.current?.abort(), []);
  const query = useInfiniteQuery({ queryKey: ["ventas-repuestos-listado-v3", params(filters), view, sort],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => rpc<PartsListing>("ventas_repuestos_listado_v3", { ...params(filters), p_vista: view, p_pagina: pageParam, p_por_pagina: 50, p_orden: sort.key, p_direccion: sort.direction }, signal),
    getNextPageParam: (last: PartsListing) => last.pagina < last.paginas ? last.pagina + 1 : undefined,
    enabled: validRange(filters), retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const sentinel = useRef<HTMLTableRowElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void fetchNextPage(); }, { rootMargin: "120px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, query.data]);
  useSalesSectionExport({ id: `ventas-repuestos-${view}.xlsx`, label: `Exportar ${{ vendedores: "Vendedores", clientes: "Clientes", repuestos: "Repuestos", detalle: "Detalle" }[view]}`,
    disabled: query.isFetching || !!query.error || !query.data?.pages[0]?.total,
    onSelect: async () => {
      const args = { ...params(filters), p_vista: view, p_orden: sort.key, p_direccion: sort.direction, p_exportar: true };
      const controller = new AbortController(); exportController.current = controller;
      try {
        const full = await rpc<PartsListing>("ventas_repuestos_listado_v3", args, controller.signal);
        if (full.filas.length !== full.total) throw new Error("La exportación está incompleta. No se generó un archivo parcial.");
        const { exportSalesTable } = await import("./salesTableExport");
        if (controller.signal.aborted) throw new Error("La exportación fue cancelada.");
        exportSalesTable({ rows: full.filas, columns: listingColumns(view, full.total_periodo), fileName: `ventas-repuestos-${view}.xlsx`, sheetName: `Repuestos ${view}` });
      } finally { if (exportController.current === controller) exportController.current = null; }
    } }, can("datos:exportar"));
  if (query.isLoading || query.error || !query.data) return <State loading={query.isLoading} error={query.error} retry={() => void query.refetch()} />;
  const data = { ...query.data.pages[0], filas: query.data.pages.flatMap(page => page.filas) };
  if (!data.filas.length) return <State />;
  const labels = columns.map(c => c.label);
  if (isMobile) return <div className="space-y-2"><MobileSalesTable title={`Ventas de Repuestos · ${view}`} rows={data.filas} columns={listingColumns(view,data.total_periodo).map(c=>c.key==="factura"?{...c,render:(r:PartsRow)=>`${r.es_nota_credito?"NC ":""}${r.factura||"—"}`}:c)} primaryKey={view==="detalle"?"cliente":view==="repuestos"?"descripcion":undefined} rowKey={r=>r.id} sort={sort} toggleSort={toggleSort} />
    <RowCount rows={data.total} loaded={data.filas.length} label="registros" />
    {query.hasNextPage && <button type="button" className="min-h-11 w-full rounded-md border text-sm" disabled={query.isFetchingNextPage} onClick={()=>void fetchNextPage()}>{query.isFetchingNextPage?"Cargando…":"Cargar más registros"}</button>}
  </div>;
  return <div className="space-y-2"><Table rows={data.filas.length} footer={<RowCount rows={data.total} loaded={data.filas.length} label="registros" />} minWidth={view === "detalle" ? "min-w-0" : view === "repuestos" ? "min-w-0" : "min-w-0"}>
    <colgroup>{columns.map(c => <col key={c.key} style={{ width: `${100 * (c.key === "descripcion" || c.key === "cliente" || c.key === "vendedor" ? 1.8 : 1) / columns.reduce((n, k) => n + (k.key === "descripcion" || k.key === "cliente" || k.key === "vendedor" ? 1.8 : 1), 0)}%` }} />)}</colgroup>
    <Heads columns={columns} sort={sort} toggle={toggleSort} /><tbody>{data.filas.map(row => <tr key={row.id} className="hover:bg-muted/20">
      {view === "detalle" ? <><td className="whitespace-nowrap text-muted-foreground">{date(row.fecha)}</td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.factura}>{row.factura || "—"}{row.es_nota_credito && <span className="ml-1 rounded bg-muted px-1 font-sans text-[10px]">NC</span>}</td><td className="truncate whitespace-nowrap" title={row.sucursal}>{row.sucursal || "—"}</td><td className="truncate whitespace-nowrap" title={row.cliente}>{row.cliente || "—"}</td><td><MarcaBadge marca={brand(row.marca)} className="px-1.5 py-0 text-[10px]" /></td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo}>{row.codigo || "—"}</td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo_fabricante}>{row.codigo_fabricante || "—"}</td><td className="truncate whitespace-nowrap" title={row.descripcion}>{row.descripcion || "—"}</td><td className="text-center tabular-nums">{number(row.cantidad)}</td><td className="text-right font-semibold tabular-nums">{money(row.facturado)}</td></>
        : view === "repuestos" ? <><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo}>{row.codigo || "—"}</td><td className="truncate whitespace-nowrap font-medium" title={row.descripcion}>{row.descripcion || "—"}</td><td><MarcaBadge marca={brand(row.marca)} className="px-1.5 py-0 text-[10px]" /></td><td className="text-right font-semibold tabular-nums">{money(row.facturado)}</td><td className="text-center tabular-nums">{number(row.unidades_netas)}</td><td className="text-center tabular-nums">{number(row.clientes)}</td><td className="text-center tabular-nums">{number(row.documentos)}</td><td className="text-right tabular-nums">{share(row.facturado, data.total_periodo)}</td><td className="text-center">{row.abc ? <Badge variant="outline" className="min-w-6 justify-center px-1.5 py-0 text-[10px] font-semibold">{row.abc}</Badge> : "—"}</td></>
        : <>{view === "clientes" ? <td className="truncate whitespace-nowrap font-medium" title={row.cliente}>{row.cliente || "—"}</td> : <td className="truncate whitespace-nowrap font-medium" title={seller(row.vendedor)}>{seller(row.vendedor)}</td>}<Metrics row={row} client={view === "clientes"} />
          {view === "clientes" && <><td className="text-right tabular-nums text-muted-foreground">{row.anterior == null ? "—" : money(row.anterior)}</td><td className="text-right"><Delta current={row.facturado} previous={row.anterior} /></td><td className="text-left whitespace-nowrap">{date(row.ultima)}</td></>}
          <td className="text-right tabular-nums">{share(row.facturado, data.total_periodo)}</td></>}
    </tr>)}
    {query.hasNextPage && <tr ref={sentinel}><td colSpan={labels.length} className="text-center text-[11px] text-muted-foreground">{query.isFetchingNextPage ? "Cargando más registros…" : ""}</td></tr>}
    </tbody>
  </Table></div>;
}
export function RepuestosVentas({ desde, hasta, sucursal, buscar, periodMode, selectedPeriod, onSelectPeriod }: Filters & {
  periodMode: PeriodMode; selectedPeriod: string | null; onSelectPeriod: (value: string | null) => void;
}) {
  const filters = { desde, hasta, sucursal, buscar };
  const range = partsRange(filters, selectedPeriod, periodMode);
  const focused = { ...filters, ...range };
  const panorama = useOverview(filters, periodMode);
  const overview = useOverview(focused, periodMode); // Misma clave sin selección: React Query comparte la petición.
  const [view, setView] = useState<View>("resumen");
  useEffect(() => { onSelectPeriod(null); }, [buscar, onSelectPeriod]);
  const history = useQuery({ queryKey: ["ventas-repuestos-estado-historico"],
    queryFn: ({ signal }) => rpc<{ cargado: boolean; notas_credito_verificadas: boolean }>("ventas_repuestos_estado_historico_v1", {}, signal),
    enabled: validRange(filters), retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  if (!validRange(filters)) return <State error={new Error("Seleccioná un rango de fechas válido.")} />;
  if (history.error) return <State error={history.error} retry={() => void history.refetch()} />;
  const metrics = overview.data?.resumen;
  const available = metrics && !overview.error;
  return <>
    <KpiStrip mobilePrimary={[0, 1]}><KpiItem label="Facturado" value={available ? money(metrics.facturado) : "—"} icon={<Receipt />} /><KpiItem label="Documentos" value={available ? integer.format(metrics.documentos) : "—"} icon={<FileText />} /><KpiItem label="Clientes facturados" value={available ? integer.format(metrics.clientes) : "—"} icon={<Users />} /><KpiItem label="Ticket Medio" value={available && metrics.documentos ? money(metrics.facturado / metrics.documentos) : "—"} /></KpiStrip>
    {filters.desde < "2027-07-01" && history.data && (!history.data.cargado || !history.data.notas_credito_verificadas) &&
      <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
        {!history.data?.cargado ? "Falta cargar el histórico detallado: no se usa el importador agrupado como reemplazo." :
          "Histórico pendiente de conciliar: completá las notas de crédito desde Sugerencias → Historial. Los importes mostrados incluyen solamente las líneas ya cargadas."}
      </p>}
    <Panorama data={panorama.data} loading={panorama.isLoading} error={panorama.error} retry={() => void panorama.refetch()} mode={periodMode} selected={selectedPeriod} onSelect={onSelectPeriod} />
    <Panel className="p-3"><div className="flex min-h-8 flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between"><h2 className="truncate text-[13px] font-semibold">Indicadores comerciales</h2><SalesViewSwitcher<View> value={view} onChange={setView} options={[["resumen","Resumen"],["vendedores","Vendedores"],["clientes","Clientes"],["repuestos","Repuestos"],["detalle","Detalle"]]} /></div>
      <div className="mt-3" />
      {view === "resumen" ? overview.isLoading || overview.error || !overview.data ? <State loading={overview.isLoading} error={overview.error} retry={() => void overview.refetch()} /> : <Summary data={overview.data} />
        : <Listing key={`${view}:${JSON.stringify(focused)}`} filters={focused} view={view} />}
    </Panel>
  </>;
}
