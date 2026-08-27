import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { MarcaBadge } from "@/components/StatusBadges";
import { DetalleRepuestoSheet } from "@/components/repuestos/DetalleRepuestoSheet";
import { useAuth } from "@/hooks/useAuth";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortable } from "@/hooks/useSortable";
import {
  fetchFullPartsStockSales,
  STOCK_FILTROS_VACIOS,
  STOCK_PAGE_SIZE,
  useFamiliasStock,
  useStockKpis,
  useStockMatriz,
  type StockFiltros,
  type StockMatrizRow,
  type StockSortKey,
} from "@/hooks/useRepuestos";
import { useSugerenciaProducto, type MarcaModeloSugerencia } from "@/hooks/useSugerenciasCompra";
import { MARCAS } from "@/lib/constants";
import { metaText, pageShellWide } from "@/lib/ui-classes";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { FiltersBar } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { cn } from "@/lib/utils";
import { buildStockSalesReport, filterPartsStockSalesByBrands } from "@/lib/exports/partsStockSales";

const SUCURSAL_COLUMNAS: { key: keyof StockMatrizRow; label: string }[] = [
  { key: "santa_rita", label: "Santa Rita" },
  { key: "santa_rosa", label: "Santa Rosa" },
  { key: "campo_9", label: "Campo 9" },
  { key: "misiones", label: "Misiones" },
  { key: "loma_plata", label: "Loma Plata" },
  { key: "katuete", label: "Katuete" },
];

const th = "px-2 py-1.5 text-[11px] font-medium";
const td = "px-2 py-1.5 text-[12px]";






export default function Repuestos() {
  const [busquedaInput, setBusquedaInput] = useState("");
  const debouncedBusqueda = useDebouncedValue(busquedaInput, 300);
  const [filtros, setFiltros] = useState<StockFiltros>(STOCK_FILTROS_VACIOS);
  const [page, setPage] = useState(0);
  const [seleccionado, setSeleccionado] = useState<StockMatrizRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const { sortKey, sortDir, toggleSort, sortIcon } = useSortable<StockSortKey>("total", "desc");

  useEffect(() => {
    setFiltros((f) => ({ ...f, busqueda: debouncedBusqueda }));
  }, [debouncedBusqueda]);

  useEffect(() => {
    setPage(0);
  }, [filtros, sortKey, sortDir]);

  const { isAdmin, isJefatura, isSuperAdmin } = useAuth();
  const canManage = isAdmin || isJefatura || isSuperAdmin;
  const kpisQuery = useStockKpis(filtros);
  const familiasQuery = useFamiliasStock();
  const matrizQuery = useStockMatriz(filtros, page, sortKey, sortDir);
  const marcaSugerencia = seleccionado && (seleccionado.marca === "CLAAS" || seleccionado.marca === "HORSCH" || seleccionado.marca === "OTROS")
    ? (seleccionado.marca as MarcaModeloSugerencia)
    : null;
  const sugerenciaQuery = useSugerenciaProducto(marcaSugerencia, seleccionado?.codigo_interno ?? null);


  const filtrosActivos =
    (filtros.busqueda ? 1 : 0) +
    (filtros.marcas.length ? 1 : 0) +
    (filtros.familias.length ? 1 : 0) +
    (!(filtros.estadosStock.length === 1 && filtros.estadosStock[0] === "con_stock") ? 1 : 0);

  const limpiarFiltros = () => {
    setBusquedaInput("");
    setFiltros(STOCK_FILTROS_VACIOS);
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const allRows = await fetchFullPartsStockSales();
      const rows = filterPartsStockSalesByBrands(allRows, filtros.marcas);
      if (!rows.length) throw new Error("El reporte no devolvió productos para las marcas seleccionadas");
      const data = buildStockSalesReport(rows);
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!autofilter"] = { ref: ws["!ref"] ?? "A1:I1" };
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 46 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 32 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock y ventas");
      const marcaArchivo = filtros.marcas.length === 1 ? `-${filtros.marcas[0].toLowerCase()}` : "";
      XLSX.writeFile(wb, `reporte-stock-ventas${marcaArchivo}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${rows.length.toLocaleString("es-PY")} productos exportados`);
    } catch (e) {
      toast.error("Error exportando: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rows = matrizQuery.data?.rows ?? [];
  const count = matrizQuery.data?.count ?? 0;
  const totalPages = Math.max(Math.ceil(count / STOCK_PAGE_SIZE), 1);

  const kpis = kpisQuery.data;
  const ultimaImportacionTexto = kpis?.ultimaImportacion
    ? new Date(kpis.ultimaImportacion).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })
    : "—";

  return (
    <div className={pageShellWide}>
      <PageHeader title="Catálogo y Stock" />

      <KpiStrip className="sm:grid-cols-3">
        <KpiItem label="Con stock" value={kpisQuery.isLoading ? "…" : (kpis?.conStock ?? 0).toLocaleString("es-PY")} detail={`${(kpis?.totalCatalogo ?? 0).toLocaleString("es-PY")} productos`} icon={<Package className="h-4 w-4 text-primary" />} tone="positive" />
        <KpiItem label="Sin stock" value={kpisQuery.isLoading ? "…" : (kpis?.enCero ?? 0).toLocaleString("es-PY")} icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} tone="warning" />
        <KpiItem label="Actualizado" value={kpisQuery.isLoading ? "…" : ultimaImportacionTexto} icon={<Clock className="h-4 w-4" />} />
      </KpiStrip>

      <FiltersBar
        search={{ value: busquedaInput, onChange: setBusquedaInput, placeholder: "REPIN003187, 06673230, casquillo…", label: "Buscar", width: "w-[min(420px,32vw)]" }}
        activeCount={filtrosActivos}
        onClear={limpiarFiltros}
        actions={<Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={exportar} disabled={exporting} title="Reporte completo con stock y ventas históricas para las marcas seleccionadas"><Download className="mr-1 h-3.5 w-3.5" />{exporting ? "Preparando reporte…" : filtros.marcas.length === 1 ? `Exportar reporte ${filtros.marcas[0]}` : "Exportar reporte completo"}</Button>}
      >
        <FilterMultiSelect label="Marca" values={filtros.marcas} onChange={(marcas) => setFiltros((current) => ({ ...current, marcas }))} placeholder="Todas" width="w-[140px]" options={MARCAS.map((value) => ({ value, label: value }))} />
        <FilterMultiSelect label="Familia" values={filtros.familias} onChange={(familias) => setFiltros((current) => ({ ...current, familias }))} placeholder="Todas" width="w-[180px]" options={(familiasQuery.data ?? []).map((value) => ({ value, label: value }))} />
        <FilterMultiSelect label="Existencia" values={filtros.estadosStock} onChange={(estadosStock) => setFiltros((current) => ({ ...current, estadosStock: estadosStock as StockFiltros["estadosStock"] }))} placeholder="Todos" width="w-[140px]" options={[{ value: "con_stock", label: "Con stock" }, { value: "sin_stock", label: "Sin stock" }]} />
      </FiltersBar>

      <Card className="overflow-hidden">
        <CardContent className="space-y-3 p-0">

          {matrizQuery.isLoading && <p className={cn(metaText, "p-3")}>Cargando matriz de stock…</p>}

          {!matrizQuery.isLoading && rows.length === 0 && (
            <p className={cn(metaText, "p-3")}>Sin productos para este filtro.</p>
          )}

          {!matrizQuery.isLoading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={cn(th, "cursor-pointer select-none")} onClick={() => toggleSort("codigo_interno")}>
                        <div className="flex items-center gap-1">Código {sortIcon("codigo_interno")}</div>
                      </TableHead>
                      <TableHead className={cn(th, "cursor-pointer select-none")} onClick={() => toggleSort("descripcion")}>
                        <div className="flex items-center gap-1">Descripción {sortIcon("descripcion")}</div>
                      </TableHead>
                      {SUCURSAL_COLUMNAS.map((c) => (
                        <TableHead
                          key={c.key}
                          className={cn(th, "cursor-pointer select-none text-right")}
                          onClick={() => toggleSort(c.key as StockSortKey)}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {c.label} {sortIcon(c.key as StockSortKey)}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className={cn(th, "cursor-pointer select-none text-right")} onClick={() => toggleSort("total")}>
                        <div className="flex items-center justify-end gap-1">Total {sortIcon("total")}</div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.codigo_interno}
                        className="cursor-pointer"
                        onClick={() => setSeleccionado(row)}
                      >
                        <TableCell className={cn(td, "font-mono")}>
                          <div>{row.codigo_interno}</div>
                          {row.codigo_fabricante && (
                            <div className="text-[10px] text-muted-foreground">Fab. {row.codigo_fabricante}</div>
                          )}
                        </TableCell>
                        <TableCell className={cn(td, "max-w-[320px]")}>
                          <div className="truncate font-medium">{row.descripcion}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <MarcaBadge marca={row.marca} />
                            {row.familia && <span className="truncate">{row.familia}</span>}
                          </div>
                        </TableCell>
                        {SUCURSAL_COLUMNAS.map((c) => {
                          const valor = Number(row[c.key] ?? 0);
                          return (
                            <TableCell
                              key={c.key}
                              className={cn(td, "text-right tabular-nums", valor === 0 && "text-destructive/70")}
                            >
                              {valor.toLocaleString("es-PY")}
                            </TableCell>
                          );
                        })}
                        <TableCell className={cn(td, "text-right font-semibold tabular-nums")}>
                          {row.total.toLocaleString("es-PY")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <p className={metaText}>
                  Página {page + 1} de {totalPages} ({count.toLocaleString("es-PY")} productos)
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DetalleRepuestoSheet
        producto={seleccionado ? { ...seleccionado, stock: seleccionado } : null}
        onClose={() => setSeleccionado(null)}
        sugerencia={sugerenciaQuery.data ?? null}
        sugerenciaCargando={sugerenciaQuery.isLoading}
        canManage={canManage}
        onSugerenciaGuardada={() => sugerenciaQuery.refetch()}
      />

    </div>
  );
}
