/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs nuevas, tipadas al regenerar Supabase. */
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Receipt, Users } from "lucide-react";
import { RowCount, TableScroll } from "./TableScroll";
import { MarcaBadge } from "@/components/StatusBadges";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { KpiItem, KpiStrip, Panel } from "@/components/layout/AppPrimitives";
import { money, pct } from "@/components/dashboard/utils";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";
import { partsSellerName } from "@/lib/partsSellerName";
import { PARTS_HEADERS, partsRange, validPartsRange as validRange } from "./partsSalesFormat";

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
function Metrics({ row, client = false }: { row: Partial<PartsMetrics>; client?: boolean }) {
  return <>{[row.facturado, row.ventas, row.notas_credito].map((value, index) => <td key={index} className={cn("text-right tabular-nums", index === 0 ? "font-semibold" : "text-muted-foreground")}>{value == null ? "—" : money(value)}</td>)}
    <td className="text-right tabular-nums">{client ? row.documentos && row.facturado != null ? money(row.facturado / row.documentos) : "—" : number(row.clientes)}</td><td className="text-right tabular-nums">{number(row.documentos)}</td><td className="text-right tabular-nums">{number(row.unidades_netas)}</td></>;
}
function Delta({ current, previous, lines }: { current: number; previous: number | null | undefined; lines?: number }) {
  const value = previous == null || lines === 0 ? null : pct(current, previous);
  return <span className={cn("tabular-nums", value != null && value < 0 && "text-destructive")} title={value == null ? "Sin base de comparación distinta de cero." : undefined}>{value == null ? "—" : `${value > 0 ? "+" : ""}${value}%`}</span>;
}
const tableClass = "w-full table-fixed text-[12px] leading-4 [&_th]:h-8 [&_th]:px-3 [&_th]:text-right [&_th]:text-[11px] [&_th]:font-medium [&_th:first-child]:text-left [&_td]:h-8 [&_td]:px-3 [&_td]:align-middle [&_tbody_tr]:border-t";
function Table({ children, minWidth = "min-w-[1060px]", rows = 0, footer }: { children: React.ReactNode; minWidth?: string; rows?: number; footer?: React.ReactNode }) {
  return <div className="overflow-hidden rounded-md border"><div className="overflow-x-auto"><TableScroll rows={rows}><table className={cn(tableClass, minWidth)}>{children}</table></TableScroll></div>{footer}</div>;
}
function Heads({ labels, left = [0], centered = [] }: { labels: string[]; left?: number[]; centered?: number[] }) {
  return <thead className="text-muted-foreground"><tr>{labels.map((label, index) => <th key={label} className={cn("sticky top-0 z-10 bg-muted/60", left.includes(index) && "text-left", centered.includes(index) && "text-center")}>{label}</th>)}</tr></thead>;
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
  return <Panel className="p-3">
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="flex flex-1 items-center justify-between text-left text-[13px] font-semibold">Evolución de la facturación{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
      {selected && <button type="button" onClick={() => onSelect(null)} className="rounded border px-2 py-1 text-[11px]">Ver período completo</button>}
    </div>
    {!collapsed && <div className="mt-3">{loading || error || !data ? <State loading={loading} error={error} retry={retry} /> : <Table minWidth="min-w-[1180px]">
      <colgroup><col style={{ width: "13%" }} />{PARTS_HEADERS.map(label => <col key={label} style={{ width: "10%" }} />)}<col /><col /><col /></colgroup>
      <Heads labels={["Período", ...PARTS_HEADERS, "Variación LM", "Variación LY", "Participación"]} />
      <tbody>{data.periodos.map(row => <tr key={row.periodo} className={cn("hover:bg-accent", selected === row.periodo && "bg-primary/5")}>
        <td><button type="button" aria-pressed={selected === row.periodo} onClick={() => onSelect(selected === row.periodo ? null : row.periodo)} className="w-full text-left font-medium hover:text-primary"><PeriodLabel value={row.periodo} mode={mode} /></button></td>
        <Metrics row={row} /><td className="text-center"><Delta current={row.facturado} previous={row.anterior} lines={row.anterior_lineas} /></td><td className="text-center"><Delta current={row.facturado} previous={row.anio_anterior} lines={row.anio_anterior_lineas} /></td><td className="text-right text-muted-foreground">{share(row.facturado, data.resumen.facturado)}</td>
      </tr>)}</tbody>
      <tfoot className="border-t bg-muted/30 font-semibold"><tr><td>Total del período</td><Metrics row={data.resumen} /><td className="text-center"><Delta current={data.resumen.facturado} previous={data.comparacion.facturado} lines={data.comparacion.lineas} /></td><td className="text-center"><Delta current={data.resumen.facturado} previous={data.comparacion_ly.facturado} lines={data.comparacion_ly.lineas} /></td><td className="text-right">{share(data.resumen.facturado, data.resumen.facturado)}</td></tr></tfoot>
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
    {groups.map(([label, rows]) => <Table key={label}>
      <colgroup><col style={{ width: "28%" }} />{PARTS_HEADERS.map(head => <col key={head} />)}<col /></colgroup>
      <Heads labels={[label, ...PARTS_HEADERS, "Participación"]} /><tbody>{rows.map(row => <tr key={row.label}><td className="font-medium">{row.label}</td><Metrics row={row} /><td className="text-right">{share(row.facturado, data.resumen.facturado)}</td></tr>)}</tbody>
    </Table>)}
  </div>;
}
function Listing({ filters, view }: { filters: Filters; view: "vendedores" | "clientes" | "repuestos" | "detalle" }) {
  const query = useInfiniteQuery({ queryKey: ["ventas-repuestos-listado-v2", params(filters), view],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => rpc<PartsListing>("ventas_repuestos_listado_v2", { ...params(filters), p_vista: view, p_pagina: pageParam, p_por_pagina: 50 }, signal),
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
  if (query.isLoading || query.error || !query.data) return <State loading={query.isLoading} error={query.error} retry={() => void query.refetch()} />;
  const data = { ...query.data.pages[0], filas: query.data.pages.flatMap(page => page.filas) };
  if (!data.filas.length) return <State />;
  const labels = view === "detalle" ? ["Fecha", "Factura", "Sucursal", "Cliente", "Marca", "Código", "Cód. fabricante", "Descripción", "Cantidad", "Facturación neta"]
    : view === "clientes" ? ["Cliente facturado", ...PARTS_HEADERS.map(label => label === "Clientes" ? "Promedio por documento" : label), "Año anterior", "Variación LY", "Última compra", "Participación"]
      : view === "vendedores" ? ["Vendedor", ...PARTS_HEADERS, "Participación"]
      : ["Código", "Descripción", "Marca", "Facturación neta", "Unidades", "Clientes", "Documentos", "Participación", "ABC"];
  return <div className="space-y-2"><Table rows={data.filas.length} footer={<RowCount rows={data.total} loaded={data.filas.length} label="registros" />} minWidth={view === "detalle" ? "min-w-[1180px]" : view === "repuestos" ? "min-w-[900px]" : "min-w-[1300px]"}>
    <colgroup>{view === "detalle" ? <><col style={{ width: "82px" }} /><col style={{ width: "118px" }} /><col style={{ width: "90px" }} /><col style={{ width: "170px" }} /><col style={{ width: "82px" }} /><col style={{ width: "105px" }} /><col style={{ width: "110px" }} /><col /><col style={{ width: "72px" }} /><col style={{ width: "110px" }} /></>
      : view === "clientes" ? <><col style={{ width: "220px" }} />{labels.slice(1).map(label => <col key={label} />)}</>
        : view === "vendedores" ? <><col style={{ width: "240px" }} />{labels.slice(1).map(label => <col key={label} />)}</>
        : <><col style={{ width: "115px" }} /><col /><col style={{ width: "90px" }} /><col style={{ width: "125px" }} /><col style={{ width: "85px" }} /><col style={{ width: "78px" }} /><col style={{ width: "88px" }} /><col style={{ width: "88px" }} /><col style={{ width: "55px" }} /></>}</colgroup>
    <Heads labels={labels} left={view === "detalle" ? [0, 1, 2, 3, 4, 5, 6, 7] : view === "repuestos" ? [0, 1, 2] : [0]} centered={view === "repuestos" ? [8] : []} /><tbody>{data.filas.map(row => <tr key={row.id} className="hover:bg-muted/20">
      {view === "detalle" ? <><td className="whitespace-nowrap text-muted-foreground">{date(row.fecha)}</td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.factura}>{row.factura || "—"}{row.es_nota_credito && <span className="ml-1 rounded bg-muted px-1 font-sans text-[10px]">NC</span>}</td><td className="truncate whitespace-nowrap" title={row.sucursal}>{row.sucursal || "—"}</td><td className="truncate whitespace-nowrap" title={row.cliente}>{row.cliente || "—"}</td><td><MarcaBadge marca={brand(row.marca)} className="px-1.5 py-0 text-[10px]" /></td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo}>{row.codigo || "—"}</td><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo_fabricante}>{row.codigo_fabricante || "—"}</td><td className="truncate whitespace-nowrap" title={row.descripcion}>{row.descripcion || "—"}</td><td className="text-right tabular-nums">{number(row.cantidad)}</td><td className="text-right font-semibold tabular-nums">{money(row.facturado)}</td></>
        : view === "repuestos" ? <><td className="truncate whitespace-nowrap font-mono text-[11px]" title={row.codigo}>{row.codigo || "—"}</td><td className="truncate whitespace-nowrap font-medium" title={row.descripcion}>{row.descripcion || "—"}</td><td><MarcaBadge marca={brand(row.marca)} className="px-1.5 py-0 text-[10px]" /></td><td className="text-right font-semibold tabular-nums">{money(row.facturado)}</td><td className="text-right tabular-nums">{number(row.unidades_netas)}</td><td className="text-right tabular-nums">{number(row.clientes)}</td><td className="text-right tabular-nums">{number(row.documentos)}</td><td className="text-right tabular-nums">{share(row.facturado, data.total_periodo)}</td><td className="text-center">{row.abc ? <Badge variant="outline" className="min-w-6 justify-center px-1.5 py-0 text-[10px] font-semibold">{row.abc}</Badge> : "—"}</td></>
        : <>{view === "clientes" ? <td className="truncate whitespace-nowrap font-medium" title={row.cliente}>{row.cliente || "—"}</td> : <td className="truncate whitespace-nowrap font-medium" title={seller(row.vendedor)}>{seller(row.vendedor)}</td>}<Metrics row={row} client={view === "clientes"} />
          {view === "clientes" && <><td className="text-right tabular-nums text-muted-foreground">{row.anterior == null ? "—" : money(row.anterior)}</td><td className="text-center"><Delta current={row.facturado} previous={row.anterior} /></td><td className="text-center whitespace-nowrap">{date(row.ultima)}</td></>}
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
    <KpiStrip><KpiItem label="Facturado" value={available ? money(metrics.facturado) : "—"} icon={<Receipt />} /><KpiItem label="Documentos" value={available ? integer.format(metrics.documentos) : "—"} icon={<FileText />} /><KpiItem label="Clientes facturados" value={available ? integer.format(metrics.clientes) : "—"} icon={<Users />} /><KpiItem label="Promedio por documento" value={available && metrics.documentos ? money(metrics.facturado / metrics.documentos) : "—"} /></KpiStrip>
    {filters.desde < "2027-07-01" && history.data && (!history.data.cargado || !history.data.notas_credito_verificadas) &&
      <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
        {!history.data?.cargado ? "Falta cargar el histórico detallado: no se usa el importador agrupado como reemplazo." :
          "Histórico pendiente de conciliar: completá las notas de crédito desde Sugerencias → Historial. Los importes mostrados incluyen solamente las líneas ya cargadas."}
      </p>}
    <Panorama data={panorama.data} loading={panorama.isLoading} error={panorama.error} retry={() => void panorama.refetch()} mode={periodMode} selected={selectedPeriod} onSelect={onSelectPeriod} />
    <Panel className="p-3"><div className="flex min-h-8 items-center justify-between gap-3 border-b pb-3"><h2 className="truncate text-[13px] font-semibold">Indicadores comerciales</h2><div className="flex h-8 shrink-0 overflow-x-auto rounded-md border text-[11px]">{([ ["resumen", "Resumen"], ["vendedores", "Vendedores"], ["clientes", "Clientes"], ["repuestos", "Repuestos"], ["detalle", "Detalle"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={cn("shrink-0 whitespace-nowrap px-2 hover:bg-accent md:px-3", view === key && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}</div></div>
      <div className="mt-3" />
      {view === "resumen" ? overview.isLoading || overview.error || !overview.data ? <State loading={overview.isLoading} error={overview.error} retry={() => void overview.refetch()} /> : <Summary data={overview.data} />
        : <Listing key={`${view}:${JSON.stringify(focused)}`} filters={focused} view={view} />}
    </Panel>
  </>;
}
