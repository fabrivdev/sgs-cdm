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
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  useVentasRepuesto,
  type StockFiltros,
  type StockMatrizRow,
  type StockSortKey,
} from "@/hooks/useRepuestos";
import { MARCAS } from "@/lib/constants";
import { metaText, pageDescription, pageShellWide, pageTitle } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface VentaMensual {
  mes: string;
  cantidad: number;
}

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

/* Legacy modal kept temporarily in source history while the side panel is validated.
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
                {ventas.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    {fuentes.map((fuente) => (
                      <span key={fuente} className="rounded border px-2 py-1">
                        {fuente === "legacy" ? "Histórico" : "Nuevo sistema"}
                      </span>
                    ))}
                    {vinculos.map(({ metodo, cantidad }) => (
                      <span key={metodo} className="rounded border px-2 py-1">
                        {VINCULO_LABEL[metodo as keyof typeof VINCULO_LABEL] ?? metodo}: {cantidad.toLocaleString("es-PY")}
                      </span>
                    ))}
                  </div>
                )}
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
                              {fechaVentaLabel(l.fecha_factura)}
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
*/

function DetalleProductoSheet({ producto, onClose }: { producto: StockMatrizRow | null; onClose: () => void }) {
  const ventasQuery = useVentasRepuesto(producto?.codigo_interno ?? null);
  const ventas = ventasQuery.data ?? [];
  const historialCargando = ventasQuery.isLoading || ventasQuery.isFetching;
  const historialError = ventasQuery.isError;
  const meses12 = useMemo(() => ultimosMeses(MESES_KPI), []);
  const cutoffKpi = `${meses12[0]}-01`;
  const cutoffKpiDate = useMemo(() => fechaLocal(cutoffKpi), [cutoffKpi]);
  const ventas12m = useMemo(
    () => ventas.filter((linea) => {
      const fecha = fechaLocal(linea.fecha_factura);
      return Boolean(fecha && cutoffKpiDate && fecha >= cutoffKpiDate);
    }),
    [ventas, cutoffKpiDate],
  );

  const cutoffKpi24 = `${ultimosMeses(MESES_KPI_LARGO)[0]}-01`;
  const cutoffKpi24Date = useMemo(() => fechaLocal(cutoffKpi24), [cutoffKpi24]);
  const ventas24m = useMemo(
    () => ventas.filter((linea) => {
      const fecha = fechaLocal(linea.fecha_factura);
      return Boolean(fecha && cutoffKpi24Date && fecha >= cutoffKpi24Date);
    }),
    [ventas, cutoffKpi24Date],
  );

  const unidades12m = useMemo(
    () => ventas12m.reduce((total, linea) => total + Number(linea.cantidad || 0), 0),
    [ventas12m],
  );
  const facturado12m = useMemo(
    () => ventas12m.reduce((total, linea) => total + Number(linea.total_venta_usd || 0), 0),
    [ventas12m],
  );
  const promedioMensual = unidades12m / MESES_KPI;

  const vendidoPorSucursal = useMemo(() => {
    const map = new Map<string, number>();
    for (const linea of ventas12m) {
      const sucursal = normalizarSucursal(linea.sucursal || "Sin sucursal");
      map.set(sucursal, (map.get(sucursal) ?? 0) + Number(linea.cantidad || 0));
    }
    return map;
  }, [ventas12m]);

  const vendidoPorSucursal24m = useMemo(() => {
    const map = new Map<string, number>();
    for (const linea of ventas24m) {
      const sucursal = normalizarSucursal(linea.sucursal || "Sin sucursal");
      map.set(sucursal, (map.get(sucursal) ?? 0) + Number(linea.cantidad || 0));
    }
    return map;
  }, [ventas24m]);

  const evolucionMensual = useMemo<VentaMensual[]>(() => {
    const porMes = new Map<string, number>(meses12.map((mes) => [mes, 0]));
    for (const linea of ventas12m) {
      const mes = mesVenta(linea.fecha_factura);
      if (!mes) continue;
      if (porMes.has(mes)) {
        porMes.set(mes, (porMes.get(mes) ?? 0) + Number(linea.cantidad || 0));
      }
    }
    return meses12.map((mes) => ({ mes, cantidad: porMes.get(mes) ?? 0 }));
  }, [meses12, ventas12m]);

  const maxMensual = Math.max(...evolucionMensual.map((item) => item.cantidad), 1);
  const fechasVentas = useMemo(
    () => ventas
      .map((linea) => fechaLocal(linea.fecha_factura))
      .filter((fecha): fecha is Date => fecha !== null)
      .sort((a, b) => a.getTime() - b.getTime()),
    [ventas],
  );
  const cobertura = historialCargando
    ? "Cargando historial..."
    : historialError
      ? "Historial no disponible"
      : fechasVentas.length
        ? `${fechasVentas[0].toLocaleDateString("es-PY")} - ${fechasVentas[fechasVentas.length - 1].toLocaleDateString("es-PY")}`
        : ventas.length
          ? "Sin fechas validas"
          : "Sin historial vinculado";

  return (
    <Sheet open={producto !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:w-[min(1120px,94vw)] sm:max-w-none">
        {producto && (
          <>
            <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="text-base">{producto.descripcion}</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono">{producto.codigo_interno}</span>
                    {producto.codigo_fabricante && <span>Fabricante: {producto.codigo_fabricante}</span>}
                  </SheetDescription>
                </div>
                <MarcaBadge marca={producto.marca} />
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <KpiCard icon={Warehouse} value={producto.total.toLocaleString("es-PY")} label="Stock total" />
                <KpiCard
                  icon={Package}
                  value={historialCargando ? "..." : historialError ? "—" : unidades12m.toLocaleString("es-PY")}
                  label="Unidades vendidas 12m"
                />
                <KpiCard
                  icon={DollarSign}
                  value={historialCargando ? "..." : historialError ? "—" : `USD ${facturado12m.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`}
                  label="Facturación 12m"
                />
                <KpiCard
                  icon={History}
                  value={historialCargando ? "..." : historialError ? "—" : promedioMensual.toLocaleString("es-PY", { maximumFractionDigits: 1 })}
                  label="Promedio unidades/mes"
                />
              </section>

              {historialError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <p>No se pudo cargar el historial unificado. Verificá que la migración de ventas históricas esté aplicada.</p>
                  <p className="mt-1 break-words text-xs opacity-80">
                    {mensajeError(ventasQuery.error)}
                  </p>
                </div>
              )}

              <section className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Warehouse className="h-4 w-4 text-primary" />
                    Disponibilidad por sucursal
                  </div>
                  <div className="h-64 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={th}>Sucursal</TableHead>
                          <TableHead className={cn(th, "text-right")}>Ventas 12M</TableHead>
                          <TableHead className={cn(th, "text-right")}>Ventas 24M</TableHead>
                          <TableHead className={cn(th, "text-right")}>Disponible</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {SUCURSAL_COLUMNAS.map((columna) => {
                          const clave = normalizarSucursal(columna.label);
                          return (
                            <TableRow key={columna.key}>
                              <TableCell className={td}>{columna.label}</TableCell>
                              <TableCell className={cn(td, "text-right tabular-nums")}>
                                {historialCargando ? "…" : historialError ? "—" : (vendidoPorSucursal.get(clave) ?? 0).toLocaleString("es-PY")}
                              </TableCell>
                              <TableCell className={cn(td, "text-right tabular-nums")}>
                                {historialCargando ? "…" : historialError ? "—" : (vendidoPorSucursal24m.get(clave) ?? 0).toLocaleString("es-PY")}
                              </TableCell>
                              <TableCell className={cn(td, "text-right font-semibold tabular-nums")}>
                                {Number(producto[columna.key] ?? 0).toLocaleString("es-PY")}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4 text-primary" /> Evolución de consumo
                    </span>
                    <span className={metaText}>Últimos 12 meses</span>
                  </div>
                  <div className="flex h-64 items-end gap-2 rounded-md border px-3 pb-7 pt-8">
                    {historialCargando && <p className="m-auto text-xs text-muted-foreground">Cargando consumo...</p>}
                    {historialError && <p className="m-auto text-xs text-muted-foreground">Consumo no disponible.</p>}
                    {!historialCargando && !historialError && ventas12m.length === 0 && (
                      <p className="m-auto text-xs text-muted-foreground">Sin consumo vinculado.</p>
                    )}
                    {!historialCargando && !historialError && ventas12m.length > 0 && evolucionMensual.map((item) => {
                      const altura = item.cantidad > 0 ? Math.max((item.cantidad / maxMensual) * 78, 4) : 0;
                      return (
                        <div key={item.mes} className="relative flex h-full min-w-0 flex-1 items-end" title={`${formatMes(item.mes)}: ${item.cantidad}`}>
                          {item.cantidad > 0 && (
                            <span
                              className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground"
                              style={{ bottom: `calc(${altura}% + 5px)` }}
                            >
                              {Number(item.cantidad).toLocaleString("es-PY", { maximumFractionDigits: 1 })}
                            </span>
                          )}
                          <div className="w-full rounded-t bg-primary/75" style={{ height: `${altura}%` }} />
                          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-muted-foreground">
                            {item.mes.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <History className="h-4 w-4 text-primary" /> Historial de ventas
                  </h3>
                  <span className={metaText}>{cobertura}</span>
                </div>
                <div className="max-h-[360px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className={th}>Fecha / factura</TableHead>
                        <TableHead className={th}>Cliente</TableHead>
                        <TableHead className={cn(th, "text-right")}>Cant.</TableHead>
                        <TableHead className={cn(th, "text-right")}>USD</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historialCargando && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                            Cargando historial de ventas...
                          </TableCell>
                        </TableRow>
                      )}
                      {historialError && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                            El historial no está disponible.
                          </TableCell>
                        </TableRow>
                      )}
                      {!historialCargando && !historialError && ventas.map((linea) => (
                        <TableRow key={linea.linea_id}>
                          <TableCell className={cn(td, "whitespace-nowrap")}>
                            {fechaVentaLabel(linea.fecha_factura)}{" "}
                            <span className="font-mono text-[10px] text-muted-foreground">{linea.factura || "Sin número"}</span>
                          </TableCell>
                          <TableCell className={cn(td, "max-w-48 truncate")}>{linea.cliente || "Sin cliente"}</TableCell>
                          <TableCell className={cn(td, "text-right tabular-nums")}>{Number(linea.cantidad).toLocaleString("es-PY")}</TableCell>
                          <TableCell className={cn(td, "text-right tabular-nums")}>{Number(linea.total_venta_usd).toLocaleString("es-PY", { maximumFractionDigits: 0 })}</TableCell>
                        </TableRow>
                      ))}
                      {!historialCargando && !historialError && ventas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                            No se encontraron ventas vinculadas a {producto.codigo_interno}
                            {producto.codigo_fabricante ? ` / fabricante ${producto.codigo_fabricante}` : ""}.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
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

  const filtrosActivos = Boolean(
    filtros.busqueda || filtros.marca || filtros.familia || filtros.estadoStock !== "con_stock",
  );

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
            <div className="w-36 space-y-1">
              <Label className="text-[11px]">Existencia</Label>
              <Select
                value={filtros.estadoStock}
                onValueChange={(value: StockFiltros["estadoStock"]) =>
                  setFiltros((f) => ({ ...f, estadoStock: value }))
                }
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="con_stock">Con stock</SelectItem>
                  <SelectItem value="sin_stock">Sin stock</SelectItem>
                  <SelectItem value="todos">Todos</SelectItem>
                </SelectContent>
              </Select>
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

      <DetalleProductoSheet producto={seleccionado} onClose={() => setSeleccionado(null)} />
    </div>
  );
}
