import { useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiItem, KpiStrip } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterCustom } from "@/components/filters/FiltersBar";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { MobileRecord } from "@/components/lists/MobileRecord";
import { ResponsiveDrawer, ResponsiveDrawerBody, ResponsiveDrawerHeader } from "@/components/ui/responsive-drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { metaText, sectionTitle, tableHeadText, tableText } from "@/lib/ui-classes";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MARCAS } from "@/lib/constants";
import {
  fetchSemaforoHistorico, SEMAFORO_COLORES, SEMAFORO_PAGE_SIZE,
  useSemaforoHistorico, type SemaforoFila, type SemaforoFiltros,
} from "@/hooks/useSemaforoHistorico";

const SUCURSALES = ["Santa Rita", "Santa Rosa", "Campo 9", "Misiones", "Loma Plata", "Katuete"];
const INITIAL_FILTERS: SemaforoFiltros = { busqueda: "", marca: "", color: "", sucursal: "" };
const quantity = (value: number | null | undefined) => value == null ? "—" : Number(value).toLocaleString("es-PY", { maximumFractionDigits: 2 });
const usd = (value: number | null | undefined) => value == null ? "—" : `USD ${Number(value).toLocaleString("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function DetailFields({ row }: { row: SemaforoFila }) {
  return <div className={`grid gap-3 sm:grid-cols-2 ${tableText}`}>
    <div>Fabricante: {row.codigo_fabricante || "—"}<br />Código anterior confirmado: {row.codigo_anterior_ejemplo || "—"}{row.codigos_anteriores > 1 && ` (+${row.codigos_anteriores - 1})`}</div>
    <div>Última venta: {fecha(row.ultima_venta)}<br />Antigüedad: {row.dias_ultima_venta == null ? "—" : `${quantity(row.dias_ultima_venta)} días`}</div>
    <div>Ventas {new Date().getFullYear()}: {quantity(row.unidades_anio_actual)}<br />{new Date().getFullYear() - 1}: {quantity(row.unidades_anio_anterior)} · {new Date().getFullYear() - 2}: {quantity(row.unidades_hace_dos_anios)}</div>
    <div>Kardex: {usd(row.valor_kardex_usd)}<br />Saldo foto: {quantity(row.saldo_kardex)} · actual: {quantity(row.stock_total)}<br />Archivo: {row.kardex_archivo || "—"}</div>
  </div>;
}

export function StockSemaphoreSection({ canExport }: { canExport: boolean }) {
  const isPhone = useIsMobile(640);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [filtros, setFiltros] = useState<SemaforoFiltros>(INITIAL_FILTERS);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SemaforoFila | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => { setFiltros(current => ({ ...current, busqueda: debounced })); }, [debounced]);
  useEffect(() => { setPage(0); setSelected(null); }, [filtros]);
  const report = useSemaforoHistorico(filtros, page);
  const data = report.data;
  const rows = data?.rows ?? [];
  const byColor = new Map(data?.por_color.map(item => [item.color, item]) ?? []);
  const pages = Math.max(1, Math.ceil((data?.lineas ?? 0) / SEMAFORO_PAGE_SIZE));

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

  return <section className="min-w-0 space-y-3" aria-label="Semáforo histórico de repuestos">
    <FiltersBar
      search={{ value: search, onChange: setSearch, placeholder: "Código, descripción o fabricante…", label: "Buscar", width: "w-[min(390px,32vw)]" }}
      activeCount={Number(Boolean(filtros.busqueda)) + Number(Boolean(filtros.marca)) + Number(Boolean(filtros.color)) + Number(Boolean(filtros.sucursal))}
      onClear={() => { setSearch(""); setFiltros(INITIAL_FILTERS); }}
      mobileContext={data ? `Análisis ${fecha(data.fecha_analisis)} · ${quantity(data.lineas)} repuestos` : "Rotación por última venta confirmada"}
      secondaryActions={canExport ? <SectionActionsMenu busy={exporting} options={[{
        id: "exportar-semaforo", label: "Exportar semáforo histórico", disabled: exporting || report.isLoading || report.isError || !data?.lineas,
        onSelect: () => void exportar(),
      }]} /> : undefined}
      expanded={<>
        <FilterCustom label="Color" width="w-full"><select aria-label="Filtrar por color" value={filtros.color} onChange={event => setFiltros(current => ({ ...current, color: event.target.value }))} className="h-11 w-full rounded-md border bg-background px-2 text-base sm:h-8 sm:text-[12px]"><option value="">Todos los colores</option>{SEMAFORO_COLORES.map(color => <option key={color.id} value={color.id}>{color.label}</option>)}</select></FilterCustom>
        <FilterCustom label="Sucursal con stock" width="w-full"><select aria-label="Filtrar por sucursal con stock" value={filtros.sucursal} onChange={event => setFiltros(current => ({ ...current, sucursal: event.target.value }))} className="h-11 w-full rounded-md border bg-background px-2 text-base sm:h-8 sm:text-[12px]"><option value="">Todas las sucursales</option>{SUCURSALES.map(sucursal => <option key={sucursal}>{sucursal}</option>)}</select></FilterCustom>
      </>}
    >
      <FilterCustom label="Marca" width="w-[140px]"><select aria-label="Filtrar por marca" value={filtros.marca} onChange={event => setFiltros(current => ({ ...current, marca: event.target.value }))} className="h-11 w-full rounded-md border bg-background px-2 text-base sm:h-8 sm:text-[12px]"><option value="">Todas las marcas</option>{MARCAS.map(marca => <option key={marca}>{marca}</option>)}</select></FilterCustom>
    </FiltersBar>

    {report.isLoading && <p className="text-sm text-muted-foreground">Calculando historial y valorización…</p>}
    {report.isError && <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive"><span><AlertTriangle className="mr-2 inline h-4 w-4" />No se pudo cargar el semáforo. {(report.error as Error).message}</span><Button type="button" variant="outline" size="sm" onClick={() => void report.refetch()}>Reintentar</Button></div>}
    {data && <>
      <KpiStrip>
        <KpiItem label="Con stock" value={quantity(data.lineas)} detail={`${quantity(data.unidades_stock)} unidades`} />
        <KpiItem label="Kardex USD" value={usd(data.valor_kardex_usd)} detail={`${quantity(data.lineas_valorizadas)} líneas valorizadas`} />
        <KpiItem label="Saldo coincidente" value={quantity(data.saldos_coincidentes)} detail="Con la foto del Kardex" />
      </KpiStrip>
      <p className={metaText}>El valor USD es VALOR_2 del último Kardex, cargado {fecha(data.kardex_cargado_en)}. Es una foto de costo sin fecha de corte en el XML; puede diferir del stock actual.</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{SEMAFORO_COLORES.map(color => {
        const item = byColor.get(color.id);
        const lines = item?.lineas ?? 0;
        return <button type="button" key={color.id} aria-pressed={filtros.color === color.id} onClick={() => setFiltros(current => ({ ...current, color: current.color === color.id ? "" : color.id }))} className="min-h-11 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.className}`} />{color.label}<span className="ml-auto tabular-nums">{quantity(lines)}</span></span>
          <span className={metaText}>{color.descripcion}</span>
          <span className={`${metaText} mt-1 block`}>{usd(item?.valor_kardex_usd)} · {data.lineas ? (lines / data.lineas * 100).toLocaleString("es-PY", { maximumFractionDigits: 1 }) : 0}% de líneas · {data.valor_kardex_usd ? (Number(item?.valor_kardex_usd ?? 0) / data.valor_kardex_usd * 100).toLocaleString("es-PY", { maximumFractionDigits: 1 }) : 0}% del valor</span>
        </button>;
      })}</div>
      <Card><CardHeader className="px-3 py-2"><CardTitle className={sectionTitle}>Stock por sucursal</CardTitle></CardHeader><CardContent className="grid gap-x-4 px-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">{data.sucursales.map(branch => <div key={branch.nombre} className={`flex items-center justify-between gap-2 border-t py-2 ${tableText}`}><span>{branch.nombre}<span className={`ml-2 ${metaText}`}>{quantity(branch.lineas)} líneas</span></span><span className="font-medium tabular-nums">{quantity(branch.unidades)}</span></div>)}</CardContent></Card>
      <Card><CardContent className="p-0">
        {isPhone && rows.length > 0 && <div role="table" aria-label="Detalle del semáforo" className={tableText}>
          <div role="row" className={`grid grid-cols-[minmax(0,1fr)_76px] gap-2 border-b bg-muted/50 px-3 py-2 ${tableHeadText}`}><span role="columnheader">Repuesto / color</span><span role="columnheader" className="text-right">Stock</span></div>
          {rows.map(row => <div role="row" key={row.codigo_interno} className="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-2 border-b px-3 py-1.5">
            <button type="button" role="cell" className="min-h-11 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected(selected?.codigo_interno === row.codigo_interno ? null : row)} aria-expanded={selected?.codigo_interno === row.codigo_interno}>
              <MobileRecord primary={row.descripcion} secondary={<span className="flex flex-wrap items-center gap-1.5"><span className="font-mono">{row.codigo_interno}</span><span className={`h-2 w-2 rounded-full ${SEMAFORO_COLORES.find(c => c.id === row.color)?.className ?? "bg-slate-200"}`} />{SEMAFORO_COLORES.find(c => c.id === row.color)?.label ?? row.color}</span>} />
            </button>
            <span role="cell" className="text-right font-medium tabular-nums">{quantity(row.stock_total)}</span>
          </div>)}
        </div>}
        {rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin repuestos para estos filtros.</p> : !isPhone && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Código / descripción</th><th className="px-3 py-2">Marca</th><th className="px-3 py-2">Color</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2">Última venta</th><th className="px-3 py-2 text-right">Ventas 365d</th><th className="px-3 py-2 text-right">Kardex USD</th></tr></thead><tbody>{rows.map(row => <tr key={row.codigo_interno} className="border-t hover:bg-muted/40"><td className="px-3 py-2"><button type="button" className="max-w-[320px] text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected(selected?.codigo_interno === row.codigo_interno ? null : row)} aria-expanded={selected?.codigo_interno === row.codigo_interno}><span className="block font-mono text-xs">{row.codigo_interno}</span><span className="block truncate">{row.descripcion}</span></button></td><td className="px-3 py-2">{row.marca}</td><td className="px-3 py-2"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${SEMAFORO_COLORES.find(c => c.id === row.color)?.className ?? "bg-slate-200"}`} />{SEMAFORO_COLORES.find(c => c.id === row.color)?.label ?? row.color}</span></td><td className="px-3 py-2 text-right tabular-nums">{quantity(row.stock_total)}</td><td className="px-3 py-2">{fecha(row.ultima_venta)}</td><td className="px-3 py-2 text-right tabular-nums">{quantity(row.unidades_365d)}</td><td className="px-3 py-2 text-right tabular-nums">{usd(row.valor_kardex_usd)}{row.saldo_kardex != null && !row.saldo_coincide && <span className="block text-xs text-amber-700">Saldo diferente</span>}</td></tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground"><span>Página {page + 1} de {pages} · {quantity(data.lineas)} repuestos</span><span className="flex gap-1"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button></span></div>
      </CardContent></Card>
      {isPhone ? <ResponsiveDrawer open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <ResponsiveDrawerHeader><h2 className={sectionTitle}>{selected?.descripcion}</h2><p className={metaText}>{selected?.codigo_interno} · {selected?.marca}</p></ResponsiveDrawerHeader>
        <ResponsiveDrawerBody>{selected && <DetailFields row={selected} />}</ResponsiveDrawerBody>
      </ResponsiveDrawer> : selected && <Card><CardHeader className="px-3 py-2"><CardTitle className={sectionTitle}>{selected.codigo_interno} · {selected.descripcion}</CardTitle></CardHeader><CardContent className="px-3 pb-3"><DetailFields row={selected} /></CardContent></Card>}
    </>}
  </section>;
}
