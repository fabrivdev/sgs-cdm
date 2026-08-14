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
  RefreshCw,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MarcaBadge } from "@/components/StatusBadges";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSortable } from "@/hooks/useSortable";
import {
  fetchStockMatrizCompleto,
  STOCK_FILTROS_VACIOS,
  STOCK_PAGE_SIZE,
  useFamiliasStock,
  useRepuestoHermanos,
  useStockKpis,
  useStockMatriz,
  useVentasRepuesto,
  type StockFiltros,
  type StockMatrizRow,
  type StockSortKey,
} from "@/hooks/useRepuestos";
import { MARCAS, SUCURSALES } from "@/lib/constants";
import { metaText, pageShellWide } from "@/lib/ui-classes";
import { KpiItem, KpiStrip, PageHeader } from "@/components/layout/AppPrimitives";
import { FiltersBar, FilterSelect } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";

interface VentaMensual {
  mes: string;
  cantidad: number;
}

interface VentaAgrupada {
  clave: string;
  etiqueta: string;
  cantidad: number;
  facturas: number;
  total: number;
}

type VistaHistorial = "facturas" | "clientes" | "meses";

const VISTAS_HISTORIAL: { value: VistaHistorial; label: string }[] = [
  { value: "facturas", label: "Facturas" },
  { value: "clientes", label: "Por cliente" },
  { value: "meses", label: "Por mes" },
];

const MESES_KPI = 12;
const MESES_KPI_LARGO = 24;

function fechaLocal(fecha: string | null | undefined): Date | null {
  const valor = String(fecha ?? "").trim();
  if (!valor) return null;

  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const resultado = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
  }

  const local = valor.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (local) {
    const resultado = new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), 12);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
  }

  const resultado = new Date(valor);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

function fechaVentaLabel(fecha: string | null | undefined) {
  return fechaLocal(fecha)?.toLocaleDateString("es-PY") ?? "Sin fecha";
}

function mesVenta(fecha: string | null | undefined) {
  const resultado = fechaLocal(fecha);
  if (!resultado) return null;
  return `${resultado.getFullYear()}-${String(resultado.getMonth() + 1).padStart(2, "0")}`;
}

function normalizarSucursal(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Al menos un cliente (Campos del Manana) viene facturado con la sucursal
// pegada al nombre en algunas lineas ("CAMPOS DEL MANANA S.A. - SANTA RITA")
// y sin pegar en otras ("CAMPOS DEL MA\u00d1ANA S.A.") -- ese sufijo no lo saca
// normalizar tildes/mayusculas, hay que sacarlo aparte antes de comparar.
const SUFIJO_SUCURSAL_RE = new RegExp(`\\s*-\\s*(${SUCURSALES.join("|")})\\s*$`, "i");

function limpiarNombreCliente(value: string | null | undefined) {
  return (value ?? "").trim().replace(SUFIJO_SUCURSAL_RE, "").trim();
}

// Mismo cliente puede quedar facturado con variantes de tilde/mayusculas/
// espacios/sucursal-pegada-al-nombre distintas segun quien emitio -- se
// agrupa por esta clave para que no aparezca como un cliente distinto por
// cada variante.
function normalizarClienteClave(value: string | null | undefined) {
  return limpiarNombreCliente(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function mensajeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const candidate = error as Record<string, unknown>;
    const details = [
      candidate.message,
      candidate.details,
      candidate.hint,
      candidate.code ? `Codigo ${String(candidate.code)}` : null,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    return details.join(" | ") || "Error desconocido";
  }
  return "Error desconocido";
}

function ultimosMeses(cantidad: number) {
  const hoy = new Date();
  return Array.from({ length: cantidad }, (_, index) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (cantidad - 1 - index), 1);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
  });
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
const td = "px-2 py-1.5 text-[12px]";

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
          <div className="truncate text-[18px] font-bold leading-tight">{value}</div>
          <div className={metaText}>{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}





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

  const kpisQuery = useStockKpis();
  const familiasQuery = useFamiliasStock();
  const matrizQuery = useStockMatriz(filtros, page, sortKey, sortDir);

  const filtrosActivos =
    (filtros.busqueda ? 1 : 0) +
    (filtros.marca ? 1 : 0) +
    (filtros.familia ? 1 : 0) +
    (filtros.estadoStock !== "con_stock" ? 1 : 0);

  const limpiarFiltros = () => {
    setBusquedaInput("");
    setFiltros(STOCK_FILTROS_VACIOS);
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
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
        actions={<Button type="button" variant="outline" size="sm" className="h-8 text-[12px]" onClick={exportar} disabled={exporting}><Download className="mr-1 h-3.5 w-3.5" />{exporting ? "Exportando…" : "Exportar"}</Button>}
      >
        <FilterSelect label="Marca" value={filtros.marca || "todas"} onChange={(value) => setFiltros((current) => ({ ...current, marca: value === "todas" ? "" : value }))} placeholder="Marca" width="w-[140px]" options={[{ value: "todas", label: "Todas" }, ...MARCAS.map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Familia" value={filtros.familia || "todas"} onChange={(value) => setFiltros((current) => ({ ...current, familia: value === "todas" ? "" : value }))} placeholder="Familia" width="w-[180px]" options={[{ value: "todas", label: "Todas" }, ...(familiasQuery.data ?? []).map((value) => ({ value, label: value }))]} />
        <FilterSelect label="Existencia" value={filtros.estadoStock} onChange={(value) => setFiltros((current) => ({ ...current, estadoStock: value as StockFiltros["estadoStock"] }))} placeholder="Existencia" width="w-[140px]" options={[{ value: "con_stock", label: "Con stock" }, { value: "sin_stock", label: "Sin stock" }, { value: "todos", label: "Todos" }]} />
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

      <DetalleProductoSheet producto={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
