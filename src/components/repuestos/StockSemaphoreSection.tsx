import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Package, Boxes, Coins, X } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarcaBadge } from "@/components/StatusBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiItem, KpiStrip, PageHeader, Panel } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { type CompactListColumn } from "@/components/lists/CompactListTable";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";

import { sectionTitle, tableText } from "@/lib/ui-classes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartsAnalysisTable } from "./PartsAnalysisTable";
import { sortSalesRows, type SalesSort } from "@/components/ventas/salesTableInteraction";
import { Input } from "@/components/ui/input";
import { MARCAS } from "@/lib/constants";
import {
  fetchSemaforoHistorico, SEMAFORO_COLORES, SEMAFORO_PAGE_SIZE,
  useSemaforoHistorico, type SemaforoFila, type SemaforoFiltros, type SemaforoAgrupacion, type SemaforoGrupo,
} from "@/hooks/useSemaforoHistorico";

const SUCURSALES = ["Santa Rita", "Santa Rosa", "Campo 9", "Misiones", "Loma Plata", "Katuete"];
const INITIAL_FILTERS: SemaforoFiltros = { busqueda: "", marca: "", color: "", sucursal: "" };
const quantity = (value: number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("es-PY", { maximumFractionDigits: 6 });
const usd = (value: number | null | undefined) => value == null ? "—" : `$ ${Number(value).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PY") : "—";

function exportRow(row: SemaforoFila) {
  return {
    "Código interno": row.codigo_interno,
    "Código fabricante": row.codigo_fabricante ?? "",
    "Código anterior confirmado (ejemplo)": row.codigo_anterior_ejemplo ?? "",
    "Cantidad códigos anteriores": row.codigos_anteriores,
    "Descripción": row.descripcion,
    "Marca": row.marca,
    "Familia": row.familia ?? "",
    "Color": SEMAFORO_COLORES.find(c => c.id === row.color)?.label ?? row.color,
    "Stock actual": Number(row.stock_total),
    "Santa Rita": Number(row.santa_rita),
    "Santa Rosa": Number(row.santa_rosa),
    "Campo 9": Number(row.campo_9),
    "Misiones": Number(row.misiones),
    "Loma Plata": Number(row.loma_plata),
    "Katuete": Number(row.katuete),
    "Última venta confirmada global": row.ultima_venta ?? "",
    "Días desde última venta": row.dias_ultima_venta ?? "",
    "Unidades vendidas globales 365 días": Number(row.unidades_365d),
    "Ventas año actual": Number(row.unidades_anio_actual),
    "Ventas año anterior": Number(row.unidades_anio_anterior),
    "Ventas hace dos años": Number(row.unidades_hace_dos_anios),
    "Saldo último Kardex": row.saldo_kardex == null ? "" : Number(row.saldo_kardex),
    "Valor último Kardex USD": row.valor_kardex_usd == null ? "" : Number(row.valor_kardex_usd),
    "Saldo Kardex coincide": row.saldo_kardex == null ? "Sin Kardex" : row.saldo_coincide ? "Sí" : "No",
    "Archivo Kardex": row.kardex_archivo ?? "",
    "Carga Kardex": row.kardex_cargado_en ?? "",
    "Última compra": row.ultima_compra ?? "",
    "Días desde última compra": row.dias_ultima_compra ?? "",
    "Fuente de compra": row.fuente_compra ?? "",
    "Fecha análisis": row.fecha_analisis,
  };
}

const COLOR_FILLS = ["#047857", "#34d399", "#fbbf24", "#f97316", "#a78bfa", "#94a3b8", "#ef4444", "#e2e8f0"];
const percent = (part: number | null | undefined, total: number | null | undefined) => total != null && total > 0 && part != null ? `${(part / total * 100).toLocaleString("es-PY", { maximumFractionDigits: 1 })}%` : "—";

function ColorLabel({ color, compact = false }: { color: string; compact?: boolean }) {
  const definition = SEMAFORO_COLORES.find(item => item.id === color);
  return <span className="flex min-w-0 items-center gap-2" title={definition?.descripcion}>
    <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${definition?.className ?? "bg-slate-200"}`} />
    <span className={compact ? "sr-only sm:not-sr-only sm:truncate" : "truncate"}>{definition?.label ?? color}</span>
  </span>;
}

function DetailFields({ row }: { row: SemaforoFila }) {
  const year = Number(row.fecha_analisis.slice(0, 4));
  const fields = [
    ["Fecha de análisis", fecha(row.fecha_analisis)], ["Código", row.codigo_interno], ["Descripción", row.descripcion], ["Marca", row.marca],
    ["Fabricante", row.codigo_fabricante], ["Familia", row.familia],
    ["Código anterior", row.codigo_anterior_ejemplo], ["Equivalencias", quantity(row.codigos_anteriores)],
    ["Stock", quantity(row.stock_total)], ["Última venta global", fecha(row.ultima_venta)],
    ["Última compra", fecha(row.ultima_compra)], ["Días en stock", quantity(row.dias_ultima_compra)], ["Fuente de compra", row.fuente_compra],
    ["Días sin venta", quantity(row.dias_ultima_venta)], ["Ventas 365d", quantity(row.unidades_365d)],
    [String(year), quantity(row.unidades_anio_actual)], [String(year - 1), quantity(row.unidades_anio_anterior)],
    [String(year - 2), quantity(row.unidades_hace_dos_anios)],
    ["Santa Rita", quantity(row.santa_rita)], ["Santa Rosa", quantity(row.santa_rosa)], ["Campo 9", quantity(row.campo_9)],
    ["Misiones", quantity(row.misiones)], ["Loma Plata", quantity(row.loma_plata)], ["Katuete", quantity(row.katuete)],
    ["Valor Kardex (USD)", usd(row.valor_kardex_usd)], ["Saldo Kardex", quantity(row.saldo_kardex)],
    ["Saldo coincide", row.saldo_kardex == null ? "—" : row.saldo_coincide ? "Sí" : "No"],
    ["Archivo Kardex", row.kardex_archivo], ["Carga Kardex", fecha(row.kardex_cargado_en)],
  ];
  return <dl className={`space-y-2 ${tableText}`}>{fields.map(([label, value]) =>
    <div key={label} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b pb-2"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words">{value || "—"}</dd></div>
  )}</dl>;
}


import { GROUP_LABELS, STOCK_BANDS } from "./partsAnalysisDefinitions";

export function StockSemaphoreSection({ canExport }: { canExport: boolean }) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [filtros, setFiltros] = useState<SemaforoFiltros>(INITIAL_FILTERS);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("resumen");
  const [agrupacion, setAgrupacion] = useState<SemaforoAgrupacion>("marca");
  const [path, setPath] = useState<Array<{ key: SemaforoAgrupacion; value: string }>>([]);
  const [selected, setSelected] = useState<SemaforoFila | null>(null);
  const [detailSort, setDetailSort] = useState<SalesSort>({ key: "usd", direction: "desc" });
  const [groupSort, setGroupSort] = useState<SalesSort>({ key: "valor", direction: "desc" });
  const toggleSort = (key: string) => { setPage(0); const setter = tab === "resumen" ? setGroupSort : setDetailSort; setter(prev => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" })); };
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setFiltros(current => ({ ...current, busqueda: debounced })); }, [debounced]);
  useEffect(() => { setPage(0); setSelected(null); setPath([]); }, [filtros]);
  useEffect(() => { setPage(0); }, [path]);
  const detailFilters = { ...filtros, orden: detailSort.key, direccion: detailSort.direction, ...Object.fromEntries(path.map(item => [item.key, item.value])) };
  const overview = useSemaforoHistorico(filtros, 0);
  const report = useSemaforoHistorico(detailFilters, page, agrupacion);
  const data = overview.data;
  const rows = report.data?.rows ?? [];
  const byColor = new Map(data?.por_color.map(item => [item.color, item]) ?? []);
  const pages = Math.max(1, Math.ceil((report.data?.lineas ?? 0) / SEMAFORO_PAGE_SIZE));
  const update = (key: keyof SemaforoFiltros, value: string) => setFiltros(current => ({ ...current, [key]: value === "all" ? "" : value }));
  const toggle = (key: keyof SemaforoFiltros, value: string) => update(key, filtros[key] === value ? "" : value);
  const filter = (key: keyof SemaforoFiltros, label: string, options: Array<{value: string; label: string}>) => <FilterSelect label={label} value={filtros[key] || "all"} onChange={value => update(key, value)} placeholder="Todos" options={[{ value: "all", label: "Todos" }, ...options]} />;
  const facet = (key: keyof SemaforoFiltros, label: string, values: string[]) => filter(key, label, values.map(value => ({ value, label: value })));
  const range = (key: keyof SemaforoFiltros, label: string) => <FilterCustom label={label}><Input aria-label={label} type="number" step="any" className="h-11 text-base sm:h-8 sm:text-xs" value={filtros[key] || ""} onChange={event => update(key, event.target.value)} /></FilterCustom>;
  const drill = (group: SemaforoGrupo) => {
    const nextPath = [...path.filter(item => item.key !== agrupacion), { key: agrupacion, value: group.nombre }];
    setPath(nextPath);
    const next = (Object.keys(GROUP_LABELS) as SemaforoAgrupacion[]).find(key => !nextPath.some(item => item.key === key) && !filtros[key]);
    if (next) setAgrupacion(next); else setTab("detalle");
  };
  const exportar = async () => {
    setExporting(true);
    try {
      const all: SemaforoFila[] = [];
      const first = await fetchSemaforoHistorico(detailFilters, 0, 200, agrupacion);
      all.push(...first.rows);
      for (let offset = 1; all.length < first.lineas; offset++) {
        const chunk = await fetchSemaforoHistorico(detailFilters, offset, 200, agrupacion);
        if (chunk.version !== first.version || chunk.lineas !== first.lineas || !chunk.rows.length) throw new Error("El corte cambió durante la exportación. Reintentá.");
        all.push(...chunk.rows);
      }
      if (!all.length || all.length !== first.lineas || new Set(all.map(row => row.codigo_interno)).size !== first.lineas) throw new Error("La exportación está vacía o incompleta.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const append = (name: string, values: object[]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(values), name);
      append("Detalle", all.map(exportRow));
      append("Resumen", sortSalesRows(first.grupos, groupColumns, groupSort).map(group => ({ [GROUP_LABELS[agrupacion]]: group.nombre, Códigos: group.lineas, Unidades: group.unidades, "Valor Kardex USD": group.valor_kardex_usd, "Participación USD": first.valor_kardex_usd && group.valor_kardex_usd != null ? group.valor_kardex_usd / first.valor_kardex_usd : null, "Ubicaciones sin valor": group.ubicaciones_sin_valor })));
      append("Colores", SEMAFORO_COLORES.map(color => ({ Color: color.label, Criterio: color.descripcion, ...first.por_color.find(item => item.color === color.id) })));
      append("Sucursales", first.sucursales);
      append("Antigüedad del stock", first.franjas.map(band => ({ ...band, Criterio: STOCK_BANDS.find(item => item.id === band.franja)?.label })));
      append("Contexto", [...Object.entries(detailFilters).filter(([, value]) => value).map(([Campo, Valor]) => ({ Campo, Valor })), { Campo: "Antigüedad", Valor: "Días desde última compra global: hasta 365, 366 a 730 y más de 730; sin fecha separado. No representa edad física por lote. Histórico GRID con equivalencia confirmada y facturas NF positivas TOTVS." }, { Campo: "Valorización", Valor: "VALOR_2 del Kardex sintético; fecha de carga no equivale a corte contable. Valores faltantes excluidos del denominador monetario." }]);
      XLSX.writeFile(workbook, `analisis-repuestos-${first.fecha_analisis}.xlsx`);
      toast.success(`${quantity(all.length)} repuestos exportados`);
    } catch (error) { toast.error(`No se pudo exportar: ${(error as Error).message}`); }
    finally { setExporting(false); }
  };
  const columns: CompactListColumn<SemaforoFila>[] = [
    { key: "codigo", label: "Código", kind: "text", width: "w-[110px]", value: row => row.codigo_interno, render: row => <button className="block min-h-11 w-full truncate text-left font-mono focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" onClick={() => setSelected(row)} aria-label={`Ver ${row.codigo_interno}`}>{row.codigo_interno}</button> },
    { key: "descripcion", label: "Descripción", kind: "text", width: "w-auto", value: row => row.descripcion },
    { key: "marca", label: "Marca", kind: "text", width: "w-[85px]", hiddenBelow: "xl", value: row => row.marca, render: row => <MarcaBadge marca={row.marca} /> },
    { key: "stock", label: "Stock", kind: "number", align: "center", width: "w-[100px]", hiddenBelow: "lg", value: row => row.stock_total, render: row => quantity(row.stock_total) },
    { key: "usd", label: "Valor USD", kind: "number", align: "right", width: "w-[150px]", value: row => row.valor_kardex_usd, render: row => usd(row.valor_kardex_usd) },
    { key: "dias", label: "Días venta", kind: "number", align: "center", width: "w-[100px]", hiddenBelow: "lg", value: row => row.dias_ultima_venta, render: row => quantity(row.dias_ultima_venta) },
    { key: "ventas", label: "Unid. 365d", kind: "number", align: "center", width: "w-[100px]", hiddenBelow: "xl", value: row => row.unidades_365d, render: row => quantity(row.unidades_365d) },
    { key: "color", label: "Color", kind: "text", width: "w-[115px]", hiddenBelow: "lg", value: row => row.color, render: row => <ColorLabel color={row.color} compact /> },
  ];
  columns.push({ key: "compra", label: "Días stock", kind: "number", align: "center", width: "w-[105px]", hiddenBelow: "xl", value: row => row.dias_ultima_compra, render: row => quantity(row.dias_ultima_compra) });
  const mobileColumns = [{ ...columns[0], width: "w-auto" }, { ...columns[4], width: "w-[145px]" }, { ...columns[7], width: "w-[28px]", hiddenBelow: undefined, label: "" }];
  const groupColumns: CompactListColumn<SemaforoGrupo>[] = [
    { key: "nombre", label: GROUP_LABELS[agrupacion], kind: "text", width: "w-auto", value: row => row.nombre, render: row => <button onClick={event => { event.stopPropagation(); drill(row); }} className="flex min-h-11 w-full min-w-0 items-center gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0" aria-label={`Desglosar ${row.nombre}`}><ChevronRight className="h-3 w-3 shrink-0" /><span className="truncate">{row.nombre}</span></button> },
    { key: "lineas", label: "Códigos", kind: "number", align: "center", width: "w-[90px]", hiddenBelow: "lg", value: row => row.lineas, render: row => quantity(row.lineas) },
    { key: "unidades", label: "Unidades", kind: "number", align: "center", width: "w-[130px]", hiddenBelow: "lg", value: row => row.unidades, render: row => quantity(row.unidades) },
    { key: "valor", label: "Valor USD", kind: "number", align: "right", width: "w-[160px]", value: row => row.valor_kardex_usd, render: row => usd(row.valor_kardex_usd) },
    { key: "porcentaje", label: "% USD", kind: "number", align: "right", width: "w-[80px]", hiddenBelow: "md", value: row => row.valor_kardex_usd, render: row => percent(row.valor_kardex_usd, report.data?.valor_kardex_usd) },
  ];
  const chart = SEMAFORO_COLORES.map((color, index) => ({ id: color.id, name: color.label, value: byColor.get(color.id)?.valor_kardex_usd ?? 0, fill: COLOR_FILLS[index] }));
  const canChart = (data?.valor_kardex_usd ?? 0) > 0 && chart.every(item => item.value >= 0);
  const canBandChart = (data?.valor_kardex_usd ?? 0) > 0 && (data?.franjas.every(item => (item.valor_kardex_usd ?? 0) >= 0) ?? false);
  const maxBranch = Math.max(1, ...(data?.sucursales.map(branch => branch.valor_kardex_usd ?? 0) ?? []));
  const status = report.isLoading ? <span role="status">Cargando…</span> : report.isError ? <span role="alert">No se pudo cargar la tabla. <Button variant="ghost" onClick={() => void report.refetch()}>Reintentar</Button></span> : !report.data?.lineas ? "Sin repuestos para estos filtros." : undefined;
  const labels: Record<string, string> = { busqueda: "Buscar", marca: "Marca", sucursal: "Sucursal", familia: "Familia", deposito: "Depósito", franja: "Antigüedad", color: "Color", usd_min: "USD desde", usd_max: "USD hasta", dias_min: "Días desde", dias_max: "Días sin venta hasta", compra_dias_min: "Días en stock desde", compra_dias_max: "Días en stock hasta", valorizacion: "Valorización" };
  const displayFilter = (value: string) => SEMAFORO_COLORES.find(item => item.id === value)?.label ?? STOCK_BANDS.find(item => item.id === value)?.label ?? ({ COMPLETA: "Completa", INCOMPLETA: "Incompleta" }[value]) ?? value;
  return <section className="min-w-0 space-y-3" aria-label="Semáforo histórico de repuestos">
    <PageHeader title="Análisis de repuestos" actions={data && <time className="hidden text-[12px] text-muted-foreground sm:block" dateTime={data.fecha_analisis}>Análisis {fecha(data.fecha_analisis)}</time>} />
    <FiltersBar search={{ value: search, onChange: setSearch, placeholder: "Código, descripción o fabricante…", label: "Buscar", width: "w-[min(390px,32vw)]" }} activeCount={Object.values(filtros).filter(Boolean).length} onClear={() => { setSearch(""); setFiltros(INITIAL_FILTERS); }}
      secondaryActions={canExport ? <SectionActionsMenu busy={exporting} options={[{ id: "exportar-semaforo", label: "Exportar análisis", disabled: exporting || report.isLoading || report.isError || !report.data?.lineas, onSelect: () => void exportar() }]} /> : undefined}
      expanded={<>{facet("familia", "Familia", data?.facetas.familias ?? [])}{facet("deposito", "Depósito", data?.facetas.depositos ?? [])}{filter("franja", "Antigüedad del stock", STOCK_BANDS.map(item => ({ value: item.id, label: item.label })))}{filter("valorizacion", "Valorización", [{ value: "COMPLETA", label: "Completa" }, { value: "INCOMPLETA", label: "Incompleta" }])}{range("usd_min", "Valor USD desde")}{range("usd_max", "Valor USD hasta")}{range("dias_min", "Días sin venta desde")}{range("dias_max", "Días sin venta hasta")}{range("compra_dias_min", "Días en stock desde")}{range("compra_dias_max", "Días en stock hasta")}</>}>
      {facet("marca", "Marca", [...MARCAS])}{facet("sucursal", "Sucursal", data?.facetas.sucursales ?? SUCURSALES)}{filter("color", "Color histórico", SEMAFORO_COLORES.map(item => ({ value: item.id, label: item.label })))}
    </FiltersBar>
    {Object.values(filtros).some(Boolean) && <div className="flex flex-wrap gap-1" aria-label="Filtros activos">{Object.entries(filtros).filter(([, value]) => value).map(([key, value]) => <Button key={key} variant="outline" size="sm" className="max-w-full min-h-11 gap-1 sm:min-h-8" onClick={() => { update(key as keyof SemaforoFiltros, ""); if (key === "busqueda") setSearch(""); }}><span className="truncate">{labels[key]}: {displayFilter(value)}</span><X className="h-3 w-3 shrink-0" /></Button>)}</div>}
    {overview.isLoading && <div role="status" className="rounded-xl border p-4 text-sm">Cargando análisis…</div>}
    {overview.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"><span><AlertTriangle className="mr-2 inline h-4 w-4" />{overview.error instanceof Error ? overview.error.message : "No se pudo cargar el análisis."}</span><Button variant="outline" onClick={() => void overview.refetch()}>Reintentar</Button></div>}
    {data && !overview.isError && <>
      <KpiStrip className="max-sm:grid-cols-2 max-sm:[&>div:last-child]:col-span-2">
        <KpiItem label="Repuestos en stock" value={quantity(data.lineas)} icon={<Package />} />
        <KpiItem label="Existencias totales" value={quantity(data.unidades_stock)} icon={<Boxes />} className={quantity(data.unidades_stock).length > 12 ? "[&>div:nth-child(2)]:text-[14px]" : undefined} />
        <KpiItem label="Valor del inventario" value={<span title={`USD. ${data.lineas_valorizadas} códigos con valor; ${data.ubicaciones_sin_valor} ubicaciones de stock sin valor. La fecha de carga no es la fecha de corte.`}>{usd(data.valor_kardex_usd)}</span>} icon={<Coins />} className="[&>div:nth-child(2)]:whitespace-nowrap [&>div:nth-child(2)]:text-[clamp(14px,1.6vw,20px)]" />
      </KpiStrip>
      <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]">
        <Card className="min-w-0"><CardHeader className="px-3 py-3"><CardTitle className={sectionTitle}>Clasificación histórica de ventas</CardTitle></CardHeader><CardContent className="grid min-w-0 items-center gap-3 px-3 pb-3 sm:grid-cols-[minmax(200px,0.9fr)_minmax(0,1fr)]">
          <div className="mx-auto aspect-square w-full max-w-[340px] min-w-0" aria-hidden title={canChart ? "Participación en USD" : "Distribución no representable con total nulo o categorías negativas"}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={canChart ? chart : [{ value: 1, fill: "#e2e8f0" }]} dataKey="value" innerRadius="58%" outerRadius="96%" stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false} onClick={(_, index) => { if (canChart && chart[index]) toggle("color", chart[index].id); }}>{(canChart ? chart : [{ fill: "#e2e8f0" }]).map((item, index) => <Cell key={index} fill={item.fill} />)}</Pie></PieChart></ResponsiveContainer></div>
          <table aria-label="Distribución por color" className="w-full table-fixed text-[12px] tabular-nums"><thead className="text-muted-foreground"><tr className="border-b"><th className="py-2 text-left font-medium">Color</th><th className="w-[47%] py-2 text-right font-medium">Valor USD</th><th className="w-[20%] py-2 text-right font-medium">%</th></tr></thead><tbody>{SEMAFORO_COLORES.map(color => { const item = byColor.get(color.id); return <tr key={color.id} className="h-11 border-b last:border-0"><td className="overflow-hidden"><button className="min-h-11 w-full min-w-0 text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => toggle("color", color.id)} aria-label={`Filtrar ${color.label}`} aria-pressed={filtros.color === color.id}><ColorLabel color={color.id} /></button></td><td className="whitespace-nowrap text-right">{usd(item?.valor_kardex_usd)}</td><td className="whitespace-nowrap text-right">{percent(item?.valor_kardex_usd, data.valor_kardex_usd)}</td></tr>; })}</tbody></table>
        </CardContent></Card>
        <Card className="min-w-0"><CardHeader className="px-3 py-3"><CardTitle className={sectionTitle}>Distribución del inventario por sucursal</CardTitle></CardHeader><CardContent className="px-3 pb-3"><table aria-label="Valor por sucursal" className="w-full table-fixed text-[12px] tabular-nums"><thead className="text-muted-foreground"><tr className="border-b"><th className="py-2 text-left font-medium">Sucursal</th><th className="hidden w-[20%] sm:table-cell" aria-label="Participación USD" /><th className="w-[47%] py-2 text-right font-medium sm:w-[32%]">Valor USD</th><th className="w-[20%] py-2 text-right font-medium sm:w-[13%]">%</th></tr></thead><tbody>{data.sucursales.map(branch => <tr key={branch.nombre} className="h-11 border-b last:border-0"><td className="overflow-hidden pr-1"><button className="block min-h-11 w-full truncate text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => toggle("sucursal", branch.nombre)} aria-label={`Filtrar ${branch.nombre}`} aria-pressed={filtros.sucursal === branch.nombre}>{branch.nombre}</button></td><td className="hidden pr-3 sm:table-cell"><div aria-hidden className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, branch.valor_kardex_usd ?? 0) / maxBranch * 100}%` }} /></div></td><td className="whitespace-nowrap text-right">{usd(branch.valor_kardex_usd)}</td><td className="whitespace-nowrap text-right">{percent(branch.valor_kardex_usd, data.valor_kardex_usd)}</td></tr>)}</tbody></table></CardContent></Card>
      </div>
      <Card className="min-w-0"><CardHeader className="flex-row flex-wrap items-center justify-between gap-2 px-3 py-3"><CardTitle className={sectionTitle}>Antigüedad del inventario</CardTitle><button className="flex min-h-11 items-center gap-2 text-xs sm:min-h-8" onClick={() => toggle("franja", "SIN_FECHA")} aria-pressed={filtros.franja === "SIN_FECHA"}><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />Sin fecha <span className="tabular-nums">{usd(data.franjas.find(item => item.franja === "SIN_FECHA")?.valor_kardex_usd)}</span><span>{percent(data.franjas.find(item => item.franja === "SIN_FECHA")?.valor_kardex_usd, data.valor_kardex_usd)}</span></button></CardHeader><CardContent className="space-y-2 px-3 pb-3">
        {canBandChart && <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>{STOCK_BANDS.map(band => <div key={band.id} className={band.className} style={{ width: `${(data.franjas.find(item => item.franja === band.id)?.valor_kardex_usd ?? 0) / data.valor_kardex_usd! * 100}%` }} />)}</div>}
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">{STOCK_BANDS.filter(band => band.id !== "SIN_FECHA").map(band => { const item = data.franjas.find(row => row.franja === band.id); return <button key={band.id} onClick={() => toggle("franja", band.id)} aria-pressed={filtros.franja === band.id} className="min-w-0 rounded-lg border p-3 text-left focus-visible:ring-2 focus-visible:ring-ring" title="Participación USD según días desde la última compra global"><span className="flex items-center gap-2 truncate text-xs"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${band.className}`} />{band.label}</span><span className="mt-2 flex flex-wrap items-center justify-between gap-1 tabular-nums"><span className="whitespace-nowrap text-sm font-semibold">{usd(item?.valor_kardex_usd)}</span><span className="text-right text-xs">{percent(item?.valor_kardex_usd, data.valor_kardex_usd)}</span></span></button>; })}</div>
      </CardContent></Card>
      <Panel className="sales-explorer min-w-0 p-3">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-3 border-b pb-3">
          <h2 className={sectionTitle}>Inventario de repuestos</h2>
          <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Vista de la tabla"><TabsTrigger value="resumen">Resumen</TabsTrigger><TabsTrigger value="detalle">Detalle</TabsTrigger></TabsList></Tabs>
        </div>
        {tab === "resumen" && <div className="my-3"><Select value={agrupacion} onValueChange={value => setAgrupacion(value as SemaforoAgrupacion)}><SelectTrigger aria-label="Agrupar resumen" className="h-11 w-[160px] text-xs sm:h-8"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(GROUP_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>Por {label.toLowerCase()}</SelectItem>)}</SelectContent></Select></div>}
        {path.length > 0 && <div className="flex flex-wrap items-center gap-1 px-3 pb-2" aria-label="Desglose de la tabla"><Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => setPath([])}>Todo</Button>{path.map((item, index) => <Button key={item.key} variant="outline" size="sm" className="max-w-full min-h-11 sm:min-h-8" onClick={() => setPath(path.slice(0, index + 1))}><span className="truncate">{item.value}</span></Button>)}<Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onClick={() => { setAgrupacion(path[path.length - 1].key); setPath(path.slice(0, -1)); }} aria-label="Volver un nivel"><ChevronLeft className="h-4 w-4" /></Button></div>}
        <div className="mt-3">
          {tab === "resumen" ? <PartsAnalysisTable rows={sortSalesRows(report.data?.grupos ?? [],groupColumns,groupSort)} columns={groupColumns} mobileColumns={[groupColumns[0],{ ...groupColumns[3],width:"w-[150px]" }]} id={row=>row.nombre} label="Resumen de repuestos" sort={groupSort} onSort={toggleSort} status={status} onSelect={drill} total={report.data?.grupos.length ?? 0} /> : <>
            <PartsAnalysisTable<SemaforoFila> rows={rows} columns={columns} mobileColumns={mobileColumns} id={row=>row.codigo_interno} label="Detalle de repuestos" sort={detailSort} onSort={toggleSort} status={status} onSelect={row=>setSelected(row)} total={report.data?.lineas ?? 0} />
            <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground"><span>{page+1} / {pages}</span><div className="flex gap-1"><Button variant="outline" size="sm" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" disabled={page===0 || report.isLoading} onClick={()=>setPage(p=>p-1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" disabled={page+1>=pages || report.isLoading || report.isError} onClick={()=>setPage(p=>p+1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button></div></div>
          </>}
        </div>
      </Panel>
      <ResponsiveDrawer open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><ResponsiveDrawerHeader><h2 className={sectionTitle}>Detalle del repuesto</h2></ResponsiveDrawerHeader><ResponsiveDrawerBody>{selected && <DetailFields row={selected} />}</ResponsiveDrawerBody></ResponsiveDrawer>
    </>}
  </section>;
}
