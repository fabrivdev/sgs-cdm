import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Package, Boxes, Coins, Activity } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MarcaBadge } from "@/components/StatusBadges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";

import { sectionTitle, tableText } from "@/lib/ui-classes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MARCAS } from "@/lib/constants";
import {
  fetchSemaforoHistorico, SEMAFORO_COLORES, SEMAFORO_PAGE_SIZE,
  useSemaforoHistorico, type SemaforoFila, type SemaforoFiltros,
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
    "Última venta confirmada": row.ultima_venta ?? "",
    "Días desde última venta": row.dias_ultima_venta ?? "",
    "Unidades vendidas 365 días": Number(row.unidades_365d),
    "Ventas año actual": Number(row.unidades_anio_actual),
    "Ventas año anterior": Number(row.unidades_anio_anterior),
    "Ventas hace dos años": Number(row.unidades_hace_dos_anios),
    "Saldo último Kardex": row.saldo_kardex == null ? "" : Number(row.saldo_kardex),
    "Valor último Kardex USD": row.valor_kardex_usd == null ? "" : Number(row.valor_kardex_usd),
    "Saldo Kardex coincide": row.saldo_kardex == null ? "Sin Kardex" : row.saldo_coincide ? "Sí" : "No",
    "Archivo Kardex": row.kardex_archivo ?? "",
    "Carga Kardex": row.kardex_cargado_en ?? "",
    "Fecha análisis": row.fecha_analisis,
  };
}

const COLOR_FILLS = ["#047857", "#34d399", "#fbbf24", "#f97316", "#a78bfa", "#94a3b8", "#ef4444", "#e2e8f0"];
const percent = (part: number, total: number) => total > 0 ? `${(part / total * 100).toLocaleString("es-PY", { maximumFractionDigits: 1 })}%` : "—";

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
    ["Stock", quantity(row.stock_total)], ["Última venta", fecha(row.ultima_venta)],
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


export function StockSemaphoreSection({ canExport }: { canExport: boolean }) {

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [filtros, setFiltros] = useState<SemaforoFiltros>(INITIAL_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SemaforoFila | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setFiltros(current => ({ ...current, busqueda: debounced })); }, [debounced]);
  useEffect(() => { setPage(0); setSelected(null); }, [filtros]);
  const report = useSemaforoHistorico(filtros, page);
  const overview = useSemaforoHistorico({ ...filtros, color: "" }, 0);
  const data = overview.data;
  const rows = report.data?.rows ?? [];
  const byColor = new Map(data?.por_color.map(item => [item.color, item]) ?? []);
  const pages = Math.max(1, Math.ceil((report.data?.lineas ?? 0) / SEMAFORO_PAGE_SIZE));

  const exportar = async () => {
    setExporting(true);
    try {
      const all: SemaforoFila[] = [];
      let exportPage = 0;
      let expected: number | null = null;
      let exportSummary: Awaited<ReturnType<typeof fetchSemaforoHistorico>> | null = null;
      do {
        const chunk = await fetchSemaforoHistorico(filtros, exportPage, 200);
        if (expected == null) { expected = chunk.lineas; exportSummary = chunk; }
        if (chunk.lineas !== expected || chunk.fecha_analisis !== exportSummary?.fecha_analisis) {
          throw new Error("El informe cambió durante la exportación. Reintentá para obtener un corte consistente.");
        }
        all.push(...chunk.rows);
        if (chunk.rows.length < 200) break;
        exportPage += 1;
      } while (all.length < expected);
      if (all.length !== expected || new Set(all.map(row => row.codigo_interno)).size !== expected) throw new Error("La exportación está incompleta. Reintentá.");
      if (!all.length) throw new Error("No hay repuestos para exportar con estos filtros.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const detail = XLSX.utils.json_to_sheet(all.map(exportRow));
      detail["!autofilter"] = { ref: detail["!ref"] ?? "A1:AA1" };
      detail["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(workbook, detail, "Detalle semáforo");
      const exportByColor = new Map(exportSummary?.por_color.map(item => [item.color, item]) ?? []);
      const summary = XLSX.utils.json_to_sheet(SEMAFORO_COLORES.map(color => {
        const item = exportByColor.get(color.id);
        return {
          Color: color.label, Criterio: color.descripcion,
          Líneas: item?.lineas ?? 0, "Unidades en stock": Number(item?.unidades_stock ?? 0),
          "Valor último Kardex USD": Number(item?.valor_kardex_usd ?? 0),
          "Líneas valorizadas": item?.lineas_valorizadas ?? 0,
          "Saldos coincidentes": item?.saldos_coincidentes ?? 0,
        };
      }));
      XLSX.utils.book_append_sheet(workbook, summary, "Resumen");
      const branches = XLSX.utils.json_to_sheet((exportSummary?.sucursales ?? []).map(branch => ({
        Sucursal: branch.nombre, "Líneas con stock": branch.lineas, "Unidades en stock": Number(branch.unidades),
      })));
      XLSX.utils.book_append_sheet(workbook, branches, "Sucursales");
      XLSX.writeFile(workbook, `semaforo-repuestos-${exportSummary?.fecha_analisis ?? new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${all.length.toLocaleString("es-PY")} repuestos exportados`);
    } catch (error) {
      toast.error(`No se pudo exportar el semáforo: ${(error as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const stockDigits = Math.max(1, ...rows.map(row => quantity(row.stock_total).length));
  const columns: CompactListColumn<SemaforoFila>[] = [
    { key: "codigo", label: "Código", kind: "text", width: "w-[110px]", value: row => row.codigo_interno,
      render: row => <button type="button" className="block min-h-11 w-full truncate text-left font-mono focus-visible:ring-2 focus-visible:ring-ring md:min-h-0" onClick={() => setSelected(row)} aria-label={`Ver ${row.codigo_interno}`}>{row.codigo_interno}</button> },
    { key: "descripcion", label: "Descripción", kind: "text", width: "w-auto", value: row => row.descripcion },
    { key: "marca", label: "Marca", kind: "text", width: "w-[100px]", hiddenBelow: "lg", value: row => row.marca, render: row => <MarcaBadge marca={row.marca} /> },
    { key: "stock", label: "Stock", kind: "number", align: "center", width: stockDigits > 8 ? "w-[130px]" : "w-[85px]", value: row => row.stock_total, render: row => quantity(row.stock_total) },
    { key: "dias", label: "Días sin venta", kind: "number", align: "center", width: "w-[100px]", hiddenBelow: "md", value: row => row.dias_ultima_venta, render: row => quantity(row.dias_ultima_venta) },
    { key: "ventas", label: "Unid. 365d", kind: "number", align: "center", width: "w-[90px]", hiddenBelow: "lg", value: row => row.unidades_365d, render: row => quantity(row.unidades_365d) },
    { key: "color", label: "Color", kind: "text", width: "w-[125px]", value: row => row.color, render: row => <ColorLabel color={row.color} compact /> },
  ];
  const mobileColumns = [{ ...columns[0], width: stockDigits > 8 ? "w-auto" : "w-[88px]" }, ...(stockDigits > 8 ? [] : [columns[1]]), { ...columns[3], width: stockDigits > 8 ? "w-[130px]" : "w-[62px]" }, { ...columns[6], width: "w-[30px]", label: "" }];
  const recent = (byColor.get("VERDE_OSCURO")?.lineas ?? 0) + (byColor.get("VERDE_CLARO")?.lineas ?? 0);
  const maxBranch = Math.max(1, ...(data?.sucursales.map(branch => branch.lineas) ?? []));
  const chart = SEMAFORO_COLORES.map((color, index) => ({ name: color.label, value: byColor.get(color.id)?.lineas ?? 0, fill: COLOR_FILLS[index] }));

  return <section className="min-w-0 space-y-3" aria-label="Semáforo histórico de repuestos">
    <PageHeader title="Análisis de repuestos" actions={data && <time className="hidden text-[12px] text-muted-foreground sm:block" dateTime={data.fecha_analisis}>Análisis {fecha(data.fecha_analisis)}</time>} />
    <FiltersBar
      search={{ value: search, onChange: setSearch, placeholder: "Código, descripción o fabricante…", label: "Buscar", width: "w-[min(390px,32vw)]" }}
      activeCount={Number(Boolean(filtros.busqueda)) + Number(Boolean(filtros.marca)) + Number(Boolean(filtros.sucursal))}
      onClear={() => { setSearch(""); setFiltros(INITIAL_FILTERS); }}
      secondaryActions={canExport ? <SectionActionsMenu busy={exporting} options={[{
        id: "exportar-semaforo", label: "Exportar semáforo histórico", disabled: exporting || report.isLoading || report.isError || !report.data?.lineas,
        onSelect: () => void exportar(),
      }]} /> : undefined}
    >
      <FilterSelect label="Marca" value={filtros.marca || "all"} onChange={marca => setFiltros(current => ({ ...current, marca: marca === "all" ? "" : marca }))} placeholder="Todas" options={[{ value: "all", label: "Todas" }, ...MARCAS.map(marca => ({ value: marca, label: marca }))]} />
      <FilterSelect label="Sucursal con stock" value={filtros.sucursal || "all"} onChange={sucursal => setFiltros(current => ({ ...current, sucursal: sucursal === "all" ? "" : sucursal }))} placeholder="Todas" width="w-[180px]" options={[{ value: "all", label: "Todas" }, ...SUCURSALES.map(nombre => ({ value: nombre, label: nombre }))]} />
    </FiltersBar>
    {overview.isLoading && <div role="status" className="rounded-xl border p-4 text-sm text-muted-foreground">Cargando análisis…</div>}
    {overview.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"><span><AlertTriangle className="mr-2 inline h-4 w-4" />No se pudo cargar el análisis.</span><Button variant="outline" onClick={() => void overview.refetch()}>Reintentar</Button></div>}
    {data && !overview.isError && <>
      <KpiStrip>
        <KpiItem label="Códigos con stock" value={quantity(data.lineas)} icon={<Package />} />
        <KpiItem label="Unidades en stock" value={quantity(data.unidades_stock)} icon={<Boxes />} className={quantity(data.unidades_stock).length > 12 ? "[&>div:nth-child(2)]:text-[14px]" : undefined} />
        <KpiItem label="Valor Kardex ref." value={<span title="USD">{data.lineas_valorizadas ? usd(data.valor_kardex_usd) : "—"}</span>} icon={<Coins />} className="[&>div:nth-child(2)]:text-[clamp(14px,1.6vw,20px)]" />
        <KpiItem label="Con venta en 365d" value={percent(recent, data.lineas)} icon={<Activity />} />
      </KpiStrip>
      <div className="grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]">
        <Card className="min-w-0"><CardHeader className="px-3 py-3"><CardTitle className={sectionTitle}>Semáforo histórico</CardTitle></CardHeader>
          <CardContent className="grid min-w-0 items-center gap-3 px-3 pb-3 sm:grid-cols-[180px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)]">
            <div className="mx-auto h-[180px] w-[180px] 2xl:h-[220px] 2xl:w-[220px]" aria-hidden>
              <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.lineas ? chart : [{ value: 1, fill: "#e2e8f0" }]} dataKey="value" innerRadius="58%" outerRadius="96%" stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>{(data.lineas ? chart : [{ fill: "#e2e8f0" }]).map((item, index) => <Cell key={index} fill={item.fill} />)}</Pie></PieChart></ResponsiveContainer>
            </div>
            <table aria-label="Distribución por color" className="w-full table-fixed text-[12px] tabular-nums">
              <thead className="text-muted-foreground"><tr className="border-b"><th className="w-[45%] py-2 sm:w-[35%] text-left font-medium">Color</th><th className="py-2 text-center font-medium">Códigos</th><th className="w-[25%] py-2 sm:w-[18%] text-right font-medium">%</th><th className="hidden w-[30%] py-2 text-center font-medium sm:table-cell">Unidades</th></tr></thead>
              <tbody>{SEMAFORO_COLORES.map(color => { const item = byColor.get(color.id); return <tr key={color.id} className="border-b last:border-0"><td className="overflow-hidden py-2"><ColorLabel color={color.id} /></td><td className="text-center">{quantity(item?.lineas ?? 0)}</td><td className="text-right">{percent(item?.lineas ?? 0, data.lineas)}</td><td className="hidden text-center sm:table-cell">{quantity(item?.unidades_stock ?? 0)}</td></tr>; })}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card className="min-w-0"><CardHeader className="px-3 py-3"><CardTitle className={sectionTitle}>Stock por sucursal</CardTitle></CardHeader><CardContent className="px-3 pb-3">
          <table aria-label="Stock por sucursal" className="w-full table-fixed text-[12px] tabular-nums"><thead className="text-muted-foreground"><tr className="border-b"><th className="py-2 text-left font-medium">Sucursal</th><th className="hidden w-[25%] sm:table-cell" aria-label="Presencia" /><th className="w-[20%] py-2 text-center font-medium">Códigos</th><th className="w-[47%] py-2 text-center font-medium sm:w-[30%]">Unidades</th></tr></thead>
            <tbody>{data.sucursales.map(branch => <tr key={branch.nombre} className="h-11 border-b last:border-0"><td className="truncate pr-2">{branch.nombre}</td><td className="hidden pr-3 sm:table-cell"><div aria-hidden className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${branch.lineas / maxBranch * 100}%` }} /></div></td><td className="text-center">{quantity(branch.lineas)}</td><td className="text-center">{quantity(branch.unidades)}</td></tr>)}</tbody>
          </table>
        </CardContent></Card>
      </div>
      <Card className="min-w-0"><CardHeader className="flex-row flex-wrap items-center justify-between gap-2 px-3 py-2"><CardTitle className={sectionTitle}>Detalle de repuestos</CardTitle>
        <Select value={filtros.color || "all"} onValueChange={color => setFiltros(current => ({ ...current, color: color === "all" ? "" : color }))}><SelectTrigger aria-label="Color del detalle" className="h-11 w-[170px] text-[12px] sm:h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los colores</SelectItem>{SEMAFORO_COLORES.map(color => <SelectItem key={color.id} value={color.id}>{color.label}</SelectItem>)}</SelectContent></Select>
      </CardHeader><CardContent className="p-0">
        <CompactListTable rows={rows} columns={columns} mobileColumns={mobileColumns} id={row => row.codigo_interno} label="Detalle de repuestos" className="[&_td>div]:!whitespace-nowrap max-md:[&_td]:py-0" onSelect={setSelected}
          status={report.isLoading ? <span role="status">Cargando detalle…</span> : report.isError ? <span role="alert">No se pudo cargar el detalle. <Button variant="ghost" onClick={() => void report.refetch()}>Reintentar</Button></span> : !rows.length ? "Sin repuestos para estos filtros." : undefined} />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[12px] text-muted-foreground"><span>{page + 1} / {pages}</span><div className="flex gap-1"><Button variant="outline" size="sm" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" disabled={page === 0 || report.isLoading} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="sm" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" disabled={page + 1 >= pages || report.isLoading || report.isError} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button></div></div>
      </CardContent></Card>
      <ResponsiveDrawer open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <ResponsiveDrawerHeader><h2 className={sectionTitle}>Detalle del repuesto</h2></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>{selected && <DetailFields row={selected} />}</ResponsiveDrawerBody>
      </ResponsiveDrawer>
    </>}
  </section>;
}
