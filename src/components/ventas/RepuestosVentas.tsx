/* eslint-disable @typescript-eslint/no-explicit-any -- RPCs nuevas, tipadas al regenerar Supabase. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Receipt, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KpiItem, KpiStrip, Panel } from "@/components/layout/AppPrimitives";
import { money, pct } from "@/components/dashboard/utils";
import type { PeriodMode } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";
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
  por_origen: Array<PartsMetrics & { metodologia: string }>;
  comparacion: { facturado: number; lineas: number; desde: string; hasta: string };
  comparacion_ly: { facturado: number; lineas: number; desde: string; hasta: string };
};
type View = "resumen" | "clientes" | "repuestos" | "detalle";
export type PartsRow = Partial<PartsMetrics> & {
  id: string; facturado: number; fecha?: string; factura?: string; cliente?: string;
  sucursal?: string; codigo?: string; codigo_fabricante?: string; descripcion?: string;
  cantidad?: number | null; metodologia?: string; es_nota_credito?: boolean;
  unidades_vendidas?: number | null; unidades_devueltas?: number | null;
  anterior?: number | null; ultima?: string;
};
export type PartsListing = { total: number; pagina: number; paginas: number; total_periodo: number; filas: PartsRow[] };
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const date = (value?: string) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const number = (value: number | null | undefined) => value == null ? "—" : decimal.format(value);
const share = (value: number, total: number) => total ? `${Math.round(value / total * 100)}%` : "—";
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
    queryFn: ({ signal }) => rpc<PartsOverview>("ventas_repuestos_panorama_v1", { ...params(filters), p_agrupacion: mode }, signal),
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
const tableClass = "w-full table-fixed text-[12px] [&_th]:px-3 [&_th]:py-2 [&_th]:text-center [&_th]:text-[11px] [&_th]:font-medium [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle [&_tbody_tr]:border-t";
function Table({ children, minWidth = "min-w-[1060px]" }: { children: React.ReactNode; minWidth?: string }) {
  return <div className="overflow-x-auto rounded-md border"><table className={cn(tableClass, minWidth)}>{children}</table></div>;
}
function Heads({ labels }: { labels: string[] }) {
  return <thead className="bg-muted/60 text-muted-foreground"><tr>{labels.map(label => <th key={label}>{label}</th>)}</tr></thead>;
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
      <tfoot className="border-t bg-muted/30"><tr><td className="font-semibold">Total del período</td><Metrics row={data.resumen} /><td className="text-center"><Delta current={data.resumen.facturado} previous={data.comparacion.facturado} lines={data.comparacion.lineas} /></td><td className="text-center"><Delta current={data.resumen.facturado} previous={data.comparacion_ly.facturado} lines={data.comparacion_ly.lineas} /></td><td className="text-right">{share(data.resumen.facturado, data.resumen.facturado)}</td></tr></tfoot>
    </Table>}
      <p className="mt-2 text-[10px] text-muted-foreground">Ventas + notas de crédito = facturado neto. LM: período anterior; LY: año anterior, con el mismo recorte de fechas. El histórico conserva artículos, cantidades y devoluciones E. No distingue repuestos de OS: las comparaciones que cruzan el 01/07/2026 tienen distinta cobertura.</p>
    </div>}
  </Panel>;
}
function Summary({ data }: { data: PartsOverview }) {
  const cards: Array<[string, string]> = [
    ["Facturado", money(data.resumen.facturado)], ["Ventas", money(data.resumen.ventas)], ["Notas de crédito", money(data.resumen.notas_credito)],
    ["Clientes", integer.format(data.resumen.clientes)], ["Documentos", integer.format(data.resumen.documentos)], ["Unidades netas", number(data.resumen.unidades_netas)],
    ["Documentos NC", integer.format(data.resumen.documentos_nc)], ["Líneas", integer.format(data.resumen.lineas)],
  ];
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value]) => <div key={label} className="rounded-md border px-3 py-2"><p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p><p className="mt-0.5 text-[13px] font-semibold tabular-nums">{value}</p></div>)}</div>
    {([ ["Sucursal", data.por_sucursal.map(row => ({ ...row, label: row.sucursal }))], ["Origen", data.por_origen.map(row => ({ ...row, label: row.metodologia === "historico" ? "Sistema anterior · detalle por artículo" : "Sistema actual" }))] ] as const).map(([label, rows]) => <Table key={label}>
      <colgroup><col style={{ width: "28%" }} />{PARTS_HEADERS.map(head => <col key={head} />)}<col /></colgroup>
      <Heads labels={[label, ...PARTS_HEADERS, "Participación"]} /><tbody>{rows.map(row => <tr key={row.label}><td className="font-medium">{row.label}</td><Metrics row={row} /><td className="text-right">{share(row.facturado, data.resumen.facturado)}</td></tr>)}</tbody>
    </Table>)}
  </div>;
}
function Pager({ data, onPage }: { data: { total: number; pagina: number; paginas: number }; onPage: (page: number) => void }) {
  return <div className="flex flex-col gap-2 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{integer.format(data.total)} registros · totales sobre todo el período</span><div className="flex shrink-0 items-center gap-2 whitespace-nowrap"><button type="button" disabled={data.pagina <= 1} onClick={() => onPage(data.pagina - 1)} className="rounded border px-2 py-1 disabled:opacity-40">Anterior</button><span>{data.pagina} de {data.paginas}</span><button type="button" disabled={data.pagina >= data.paginas} onClick={() => onPage(data.pagina + 1)} className="rounded border px-2 py-1 disabled:opacity-40">Siguiente</button></div></div>;
}
function Listing({ filters, view }: { filters: Filters; view: "clientes" | "repuestos" | "detalle" }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["ventas-repuestos-listado-v2", params(filters), view, page],
    queryFn: ({ signal }) => rpc<PartsListing>("ventas_repuestos_listado_v1", { ...params(filters), p_vista: view, p_pagina: page, p_por_pagina: 50 }, signal),
    enabled: validRange(filters), retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  if (query.isLoading || query.error || !query.data) return <State loading={query.isLoading} error={query.error} retry={() => void query.refetch()} />;
  const data = query.data;
  if (!data.filas.length) return <State />;
  const labels = view === "detalle" ? ["Fecha", "Factura", "Cliente", "Sucursal", "Cód. repuesto", "Cód. fabricante", "Descripción", "Cantidad", "Facturado"]
    : view === "clientes" ? ["Cliente facturado", "Sucursales", ...PARTS_HEADERS.map(label => label === "Clientes" ? "Promedio por documento" : label), "Año anterior", "Variación LY", "Última compra", "Participación"]
      : ["Cód. repuesto", "Cód. fabricante", "Descripción", ...PARTS_HEADERS, "Unidades vendidas", "Unidades devueltas", "Participación"];
  return <div className="space-y-2"><Table minWidth={view === "detalle" ? "min-w-[1120px]" : view === "repuestos" ? "min-w-[1530px]" : "min-w-[1300px]"}>
    <colgroup>{view === "detalle" ? <><col style={{ width: "85px" }} /><col style={{ width: "125px" }} /><col style={{ width: "190px" }} /><col style={{ width: "95px" }} /><col style={{ width: "105px" }} /><col style={{ width: "110px" }} /><col /><col style={{ width: "70px" }} /><col style={{ width: "105px" }} /></>
      : view === "clientes" ? <><col style={{ width: "220px" }} /><col style={{ width: "140px" }} />{labels.slice(2).map(label => <col key={label} />)}</>
        : <><col style={{ width: "130px" }} /><col style={{ width: "140px" }} /><col style={{ width: "300px" }} />{labels.slice(3).map(label => <col key={label} />)}</>}</colgroup>
    <Heads labels={labels} /><tbody>{data.filas.map(row => <tr key={row.id} className="hover:bg-muted/20">
      {view === "detalle" ? <><td className="whitespace-nowrap text-muted-foreground">{date(row.fecha)}</td><td className="break-all font-mono text-[11px]">{row.factura || "Sin número"}{row.es_nota_credito && <span className="ml-1 inline-block whitespace-nowrap rounded bg-muted px-1 font-sans text-[10px]">NC</span>}</td><td>{row.cliente}</td><td>{row.sucursal}</td><td className="break-all font-mono text-[11px]">{row.codigo || "—"}</td><td className="break-all font-mono text-[11px]">{row.codigo_fabricante || "—"}</td><td className="break-words">{row.descripcion || "Descripción no informada"}</td><td className="text-right tabular-nums">{number(row.cantidad)}</td><td className="text-right font-semibold tabular-nums">{money(row.facturado)}</td></>
        : <>{view === "clientes" ? <><td className="font-medium">{row.cliente}</td><td className="text-muted-foreground">{row.sucursal}</td></> : <><td className="break-all font-mono text-[11px]">{row.codigo || "—"}</td><td className="break-all font-mono text-[11px]">{row.codigo_fabricante || "—"}</td><td className="break-words">{row.descripcion || "Descripción no informada"}</td></>}<Metrics row={row} client={view === "clientes"} />
          {view === "clientes" && <><td className="text-right tabular-nums text-muted-foreground">{row.anterior == null ? "—" : money(row.anterior)}</td><td className="text-center"><Delta current={row.facturado} previous={row.anterior} /></td><td className="text-center whitespace-nowrap">{date(row.ultima)}</td></>}
          {view === "repuestos" && <><td className="text-right tabular-nums">{number(row.unidades_vendidas)}</td><td className="text-right tabular-nums">{number(row.unidades_devueltas)}</td></>}
          <td className="text-right tabular-nums">{share(row.facturado, data.total_periodo)}</td></>}
    </tr>)}</tbody>
  </Table><p className="text-right text-[11px] text-muted-foreground">Total facturado en el período: <span className="font-semibold text-foreground">{money(data.total_periodo)}</span></p><Pager data={data} onPage={setPage} /></div>;
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
    <Panel className="p-3"><div className="flex flex-col gap-2 border-b pb-3 md:flex-row md:items-center md:justify-between"><h2 className="text-[13px] font-semibold">Indicadores de ventas de repuestos</h2><div className="flex h-8 overflow-x-auto rounded-md border text-[11px]">{([ ["resumen", "Resumen"], ["clientes", "Clientes"], ["repuestos", "Repuestos"], ["detalle", "Detalle"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={cn("shrink-0 px-2 hover:bg-accent md:px-3", view === key && "bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}</div></div>
      <p className="my-3 text-[10px] text-muted-foreground">Facturación del {date(range.desde)} al {date(range.hasta)} · Los repuestos vinculados a OS se contabilizan en Servicios.</p>
      {view === "resumen" ? overview.isLoading || overview.error || !overview.data ? <State loading={overview.isLoading} error={overview.error} retry={() => void overview.refetch()} /> : <Summary data={overview.data} />
        : <Listing key={`${view}:${JSON.stringify(focused)}`} filters={focused} view={view} />}
    </Panel>
  </>;
}
