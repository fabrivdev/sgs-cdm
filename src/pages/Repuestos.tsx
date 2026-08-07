import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  History,
  Package,
  Tag,
  Warehouse,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarcaBadge } from "@/components/StatusBadges";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortable } from "@/hooks/useSortable";
import {
  fetchStockMatrizCompleto,
  STOCK_FILTROS_VACIOS,
  STOCK_PAGE_SIZE,
  useFamiliasStock,
  useStockKpis,
  useStockMatriz,
  type StockFiltros,
  type StockMatrizRow,
  type StockSortKey,
} from "@/hooks/useRepuestos";
import { MARCAS } from "@/lib/constants";
import { metaText, pageDescription, pageShellWide, pageTitle } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface VentaLinea {
  fecha_factura: string;
  cantidad: number;
  total_venta: number;
  entidad_nombre: string | null;
  sucursal: string | null;
}

interface VentaMensual {
  mes: string;
  cantidad: number;
}

const MESES_KPI = 12;
const MESES_EVOLUCION = 6;
const MAX_ULTIMAS_VENTAS = 8;

function fechaHaceMeses(meses: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

const SUCURSAL_COLUMNAS: { key: keyof StockMatrizRow; label: string }[] = [
  { key: "santa_rita", label: "Santa Rita" },
  { key: "santa_rosa", label: "Santa Rosa" },
  { key: "campo_9", label: "Campo 9" },
  { key: "misiones", label: "Misiones" },
  { key: "loma_plata", label: "Loma Plata" },
  { key: "katuete", label: "Katuete" },
];

const th = "px-2 py-1.5 text-[11px] font-medium";
const td = "px-2 py-1.5 text-xs";

const formatMes = (mes: string) => {
  const [anio, mesNum] = mes.split("-");
  const nombre = new Date(Number(anio), Number(mesNum) - 1, 1).toLocaleDateString("es-PY", {
    month: "short",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

function KpiCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Package;
  value: string;
  label: string;
  tone?: "warn";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-base font-bold leading-tight">{value}</div>
          <div className={metaText}>{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetalleProductoDialog({ producto, onClose }: { producto: StockMatrizRow | null; onClose: () => void }) {
  const [ventasLineas, setVentasLineas] = useState<VentaLinea[] | null>(null);
  const [ventasLoading, setVentasLoading] = useState(false);

  useEffect(() => {
    if (!producto) {
      setVentasLineas(null);
      return;
    }

    let cancelled = false;
    setVentasLoading(true);

    (supabase.from("facturacion_lineas_importadas" as any) as any)
      .select("fecha_factura, cantidad, total_venta, entidad_nombre, sucursal")
      .eq("cod_mercaderia", producto.codigo_interno)
      .eq("grupo_normalizado", "Repuestos")
      // Igual que en el Dashboard: se excluye solo lo confirmado en
      // guaranies, no lo que no tiene moneda cargada (historico previo a
      // la migracion de moneda).
      .or("moneda.neq.GS,moneda.is.null")
      .order("fecha_factura", { ascending: false })
      .then(({ data, error }: any) => {
        if (cancelled) return;
        setVentasLineas(error ? [] : ((data ?? []) as VentaLinea[]));
        setVentasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [producto]);

  const cutoffKpi = useMemo(() => fechaHaceMeses(MESES_KPI), []);
  const cutoffEvolucion = useMemo(() => fechaHaceMeses(MESES_EVOLUCION), []);

  const ventas12m = useMemo(
    () => (ventasLineas ?? []).filter((l) => l.fecha_factura && l.fecha_factura >= cutoffKpi),
    [ventasLineas, cutoffKpi],
  );

  const unidadesVendidas12m = useMemo(() => ventas12m.reduce((sum, l) => sum + Number(l.cantidad || 0), 0), [ventas12m]);
  const facturadoUsd12m = useMemo(() => ventas12m.reduce((sum, l) => sum + Number(l.total_venta || 0), 0), [ventas12m]);
  const precioPromedio = unidadesVendidas12m > 0 ? facturadoUsd12m / unidadesVendidas12m : 0;

  const vendidoPorSucursal = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of ventas12m) {
      if (!l.sucursal) continue;
      map.set(l.sucursal, (map.get(l.sucursal) ?? 0) + Number(l.cantidad || 0));
    }
    return map;
  }, [ventas12m]);

  const ultimasVentas = useMemo(() => (ventasLineas ?? []).slice(0, MAX_ULTIMAS_VENTAS), [ventasLineas]);

  const evolucionMensual = useMemo<VentaMensual[]>(() => {
    const porMes = new Map<string, number>();
    for (const l of ventasLineas ?? []) {
      if (!l.fecha_factura || l.fecha_factura < cutoffEvolucion) continue;
      const mes = l.fecha_factura.slice(0, 7);
      porMes.set(mes, (porMes.get(mes) ?? 0) + Number(l.cantidad || 0));
    }
    return Array.from(porMes.entries())
      .map(([mes, cantidad]) => ({ mes, cantidad }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }, [ventasLineas, cutoffEvolucion]);

  return (
    <Dialog open={producto !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] w-[70vw] max-w-[70vw] overflow-y-auto">
        {producto && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-start justify-between gap-2 pr-6">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{producto.descripcion}</span>
                  <span className={metaText}>
                    {producto.codigo_interno}
                    {producto.codigo_fabricante ? ` · Fabricante: ${producto.codigo_fabricante}` : ""}
                  </span>
                </span>
                <MarcaBadge marca={producto.marca} />
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiCard
                icon={Warehouse}
                value={`${producto.total.toLocaleString("es-PY")} ${producto.unidad ?? ""}`.trim()}
                label="Stock total"
              />
              <KpiCard
                icon={Package}
                value={ventasLoading ? "…" : unidadesVendidas12m.toLocaleString("es-PY")}
                label="Vendido (12 meses)"
              />
              <KpiCard
                icon={DollarSign}
                value={ventasLoading ? "…" : `$ ${facturadoUsd12m.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`}
                label="Facturado USD (12 meses)"
              />
              <KpiCard
                icon={Tag}
                value={ventasLoading ? "…" : `$ ${precioPromedio.toLocaleString("es-PY", { maximumFractionDigits: 2 })}`}
                label="Precio promedio (USD)"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  Stock y ventas por sucursal
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sucursal</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Vendido (12m)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {SUCURSAL_COLUMNAS.map((c) => (
                        <TableRow key={c.key}>
                          <TableCell>{c.label}</TableCell>
                          <TableCell className="text-right">{Number(producto[c.key] ?? 0).toLocaleString("es-PY")}</TableCell>
                          <TableCell className="text-right">{(vendidoPorSucursal.get(c.label) ?? 0).toLocaleString("es-PY")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Últimas ventas
                </div>

                {ventasLoading && <p className={metaText}>Cargando…</p>}

                {!ventasLoading && ultimasVentas.length === 0 && (
                  <p className={metaText}>
                    Sin ventas registradas todavía para este producto. Se va a ir completando con cada importación de
                    facturación.
                  </p>
                )}

                {!ventasLoading && ultimasVentas.length > 0 && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-right">Cant.</TableHead>
                          <TableHead className="text-right">USD</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ultimasVentas.map((l, i) => (
                          <TableRow key={`${l.fecha_factura}-${i}`}>
                            <TableCell className="max-w-[120px] truncate text-xs">{l.entidad_nombre ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {l.fecha_factura ? new Date(l.fecha_factura).toLocaleDateString("es-PY") : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">{l.cantidad}</TableCell>
                            <TableCell className="text-right text-xs">
                              $ {Number(l.total_venta || 0).toLocaleString("es-PY", { maximumFractionDigits: 0 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-muted-foreground" />
                Evolución mensual — unidades vendidas (últimos {MESES_EVOLUCION} meses)
              </div>

              {ventasLoading && <p className={metaText}>Cargando…</p>}

              {!ventasLoading && evolucionMensual.length === 0 && (
                <p className={metaText}>Sin ventas registradas en los últimos {MESES_EVOLUCION} meses.</p>
              )}

              {!ventasLoading && evolucionMensual.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Período</TableHead>
                        <TableHead className="text-right">Unidades</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evolucionMensual.map((fila) => (
                        <TableRow key={fila.mes}>
                          <TableCell>{formatMes(fila.mes)}</TableCell>
                          <TableCell className="text-right font-medium">{fila.cantidad}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Repuestos() {
  const [busquedaInput, setBusquedaInput] = useState("");
  const debouncedBusqueda = useDebouncedValue(busquedaInput, 300);
  const [filtros, setFiltros] = useState<StockFiltros>(STOCK_FILTROS_VACIOS);
  const [page, setPage] = useState(0);
  const [seleccionado, setSeleccionado] = useState<StockMatrizRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const { sortKey, sortDir, toggleSort, sortIcon } = useSortable<StockSortKey>("descripcion", "asc");

  useEffect(() => {
    setFiltros((f) => ({ ...f, busqueda: debouncedBusqueda }));
  }, [debouncedBusqueda]);

  useEffect(() => {
    setPage(0);
  }, [filtros, sortKey, sortDir]);

  const kpisQuery = useStockKpis();
  const familiasQuery = useFamiliasStock();
  const matrizQuery = useStockMatriz(filtros, page, sortKey, sortDir);

  const filtrosActivos = Boolean(filtros.busqueda || filtros.marca || filtros.familia || !filtros.soloConStock);

  const limpiarFiltros = () => {
    setBusquedaInput("");
    setFiltros(STOCK_FILTROS_VACIOS);
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const rows = await fetchStockMatrizCompleto(filtros, sortKey, sortDir);
      const data = rows.map((r) => ({
        Código: r.codigo_interno,
        Descripción: r.descripcion,
        Fabricante: r.codigo_fabricante ?? "",
        Marca: r.marca,
        Familia: r.familia ?? "",
        "Santa Rita": r.santa_rita,
        "Santa Rosa": r.santa_rosa,
        "Campo 9": r.campo_9,
        Misiones: r.misiones,
        "Loma Plata": r.loma_plata,
        Katuete: r.katuete,
        Total: r.total,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Stock");
      XLSX.writeFile(wb, `stock-repuestos-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
      <div>
        <h1 className={pageTitle}>Catálogo y Stock</h1>
        <p className={pageDescription}>Matriz de existencias por sucursal, importada desde TOTVS.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <KpiCard
          icon={Package}
          value={kpisQuery.isLoading ? "…" : `${(kpis?.conStock ?? 0).toLocaleString("es-PY")} de ${(kpis?.totalCatalogo ?? 0).toLocaleString("es-PY")}`}
          label="productos con stock registrado"
        />
        <KpiCard
          icon={AlertTriangle}
          value={kpisQuery.isLoading ? "…" : (kpis?.enCero ?? 0).toLocaleString("es-PY")}
          label="productos en cero (ninguna sucursal)"
          tone={kpis && kpis.enCero > 0 ? "warn" : undefined}
        />
        <KpiCard icon={Clock} value={kpisQuery.isLoading ? "…" : ultimaImportacionTexto} label="Última importación de stock" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label className="text-[11px]">Buscar (código, fabricante, descripción)</Label>
              <Input
                value={busquedaInput}
                onChange={(e) => setBusquedaInput(e.target.value)}
                placeholder="REPIN003187, 06673230, casquillo…"
                className="h-8 text-xs"
              />
            </div>
            <div className="w-40 space-y-1">
              <Label className="text-[11px]">Marca</Label>
              <Select
                value={filtros.marca || "todas"}
                onValueChange={(v) => setFiltros((f) => ({ ...f, marca: v === "todas" ? "" : v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {MARCAS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44 space-y-1">
              <Label className="text-[11px]">Familia</Label>
              <Select
                value={filtros.familia || "todas"}
                onValueChange={(v) => setFiltros((f) => ({ ...f, familia: v === "todas" ? "" : v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="todas">Todas</SelectItem>
                  {(familiasQuery.data ?? []).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-1.5">
              <Switch
                checked={filtros.soloConStock}
                onCheckedChange={(checked) => setFiltros((f) => ({ ...f, soloConStock: checked }))}
                id="solo-con-stock"
              />
              <Label htmlFor="solo-con-stock" className="text-xs">
                Solo con stock
              </Label>
            </div>
            {filtrosActivos && (
              <Button type="button" variant="ghost" size="sm" className="h-8" onClick={limpiarFiltros}>
                <X className="mr-1 h-3.5 w-3.5" />
                Limpiar
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="h-8 sm:ml-auto" onClick={exportar} disabled={exporting}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {exporting ? "Exportando…" : "Exportar"}
            </Button>
          </div>

          {matrizQuery.isLoading && <p className={metaText}>Cargando matriz de stock…</p>}

          {!matrizQuery.isLoading && rows.length === 0 && (
            <p className={metaText}>Sin productos para este filtro.</p>
          )}

          {!matrizQuery.isLoading && rows.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-md border">
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
                        className={cn("cursor-pointer", row.total === 0 && "bg-destructive/5")}
                        onClick={() => setSeleccionado(row)}
                      >
                        <TableCell className={cn(td, "font-mono")}>{row.codigo_interno}</TableCell>
                        <TableCell className={cn(td, "max-w-[280px] truncate")}>{row.descripcion}</TableCell>
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

              <div className="flex items-center justify-between gap-2">
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

      <DetalleProductoDialog producto={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
