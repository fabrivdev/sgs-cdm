import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Calculator, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { MarcaBadge } from "@/components/StatusBadges";
import {
  useRepuestoHermanos,
  useStockMatrizProducto,
  useVentasRepuesto,
  type StockMatrizRow,
} from "@/hooks/useRepuestos";
import {
  guardarPlanificacionArticulo,
  type ResultadoSugerencia,
} from "@/hooks/useSugerenciasCompra";
import { SUCURSALES } from "@/lib/constants";
import { cardLabel, metaText } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export interface DetalleRepuestoProducto {
  codigo_interno: string;
  descripcion: string;
  codigo_fabricante?: string | null;
  marca: string;
  familia?: string | null;
  /** Fila de stock por sucursal ya disponible (Catálogo). Si falta, se consulta. */
  stock?: StockMatrizRow | null;
}

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

type BarraConsumo = { clave: string; etiqueta: string; valor: number };
type VistaHistorial = "facturas" | "clientes" | "meses";

const VISTAS_HISTORIAL: { value: VistaHistorial; label: string }[] = [
  { value: "facturas", label: "Facturas" },
  { value: "clientes", label: "Por cliente" },
  { value: "meses", label: "Por mes" },
];

const MESES_KPI = 12;
const MESES_KPI_LARGO = 24;

const integer = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 });

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

function fechaLocal(fecha: string | null | undefined): Date | null {
  const valor = String(fecha ?? "").trim();
  if (!valor) return null;

  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const resultado = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    return Number.isNaN(resultado.getTime()) ? null : resultado;
  }

  const local = valor.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
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

const SUFIJO_SUCURSAL_RE = new RegExp(`\\s*-\\s*(${SUCURSALES.join("|")})\\s*$`, "i");

function limpiarNombreCliente(value: string | null | undefined) {
  return (value ?? "").trim().replace(SUFIJO_SUCURSAL_RE, "").trim();
}

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
  return "Error desconocido";
}

function ultimosMeses(cantidad: number) {
  const hoy = new Date();
  return Array.from({ length: cantidad }, (_, index) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (cantidad - 1 - index), 1);
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
  });
}

const formatMes = (mes: string) => {
  const [anio, mesNum] = mes.split("-");
  const nombre = new Date(Number(anio), Number(mesNum) - 1, 1).toLocaleDateString("es-PY", {
    month: "short",
    year: "numeric",
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

function displayDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function topeEscalonado(max: number) {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / exp;
  const paso = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return paso * exp;
}

function BloqueConsumo({
  titulo,
  subtitulo,
  series,
}: {
  titulo: string;
  subtitulo: string;
  series: BarraConsumo[];
}) {
  const total = series.reduce((sum, item) => sum + item.valor, 0);
  const tope = topeEscalonado(Math.max(...series.map((item) => item.valor), 0));

  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium">{titulo}</p>
        <p className={metaText}>{decimal.format(total)} un.</p>
      </div>
      <p className={cn(metaText, "mb-2")}>{subtitulo}</p>
      {series.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-muted-foreground">Sin datos.</p>
      ) : (
        <div className="flex h-[140px] items-end gap-1.5 pb-5 pt-5">
          {series.map((item) => {
            const altura = item.valor > 0 ? Math.max((item.valor / tope) * 88, 3) : 0;
            return (
              <div
                key={item.clave}
                className="relative flex h-full min-w-0 flex-1 items-end"
                title={`${item.etiqueta}: ${item.valor}`}
              >
                {item.valor > 0 && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-foreground"
                    style={{ bottom: `calc(${altura}% + 4px)` }}
                  >
                    {decimal.format(item.valor)}
                  </span>
                )}
                <div className="w-full rounded-t bg-primary/75" style={{ height: `${altura}%` }} />
                <span className="absolute -bottom-4 left-1/2 max-w-full -translate-x-1/2 truncate text-[9px] text-muted-foreground">
                  {item.etiqueta}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PanelPlanificacion({
  sugerencia,
  cargando,
  canManage,
  onSaved,
}: {
  sugerencia: ResultadoSugerencia | null;
  cargando: boolean;
  canManage: boolean;
  onSaved?: () => void;
}) {
  const [minimoEstrategico, setMinimoEstrategico] = useState("0");
  const [origen, setOrigen] = useState("ALEMANIA");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    setMinimoEstrategico(String(sugerencia?.stock_minimo_estrategico ?? 0));
    setOrigen(sugerencia?.origen ?? "ALEMANIA");
    setNotas("");
  }, [sugerencia]);

  const guardar = useMutation({
    mutationFn: () => guardarPlanificacionArticulo({
      productoCodigo: sugerencia!.producto_codigo,
      stockMinimoEstrategico: Math.max(0, Number(minimoEstrategico) || 0),
      origen,
      observaciones: notas,
    }),
    onSuccess: () => {
      toast.success("Datos guardados. La sugerencia en vivo se está actualizando.");
      onSaved?.();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "No se pudo guardar"),
  });

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sugerencia) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-[12px] text-muted-foreground">
        Sin cálculo de sugerencia para esta pieza.
      </div>
    );
  }

  const explicacion = sugerencia.explicacion ?? {};

  return (
    <div className="h-full space-y-3 overflow-auto p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Clasificación", `${sugerencia.abc}${sugerencia.fsn}${sugerencia.xyz}`],
          ["Segmento", sugerencia.segmento],
          ["Confianza", sugerencia.confianza_datos ?? "—"],
          ["Última venta", displayDate(sugerencia.ultima_venta)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border bg-muted/20 p-2.5">
            <p className={cardLabel}>{label}</p>
            <p className="mt-0.5 text-[13px] font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={cardLabel}>Estado del historial</p>
            <p className="mt-0.5 text-[13px] font-semibold">
              {sugerencia.estado_datos === "CODIGO_NUEVO_SIN_HISTORIAL"
                ? "Código nuevo sin historial"
                : sugerencia.estado_datos === "SIN_VENTAS_RECIENTES"
                  ? "Código anterior sin ventas recientes"
                  : "Con historial reciente"}
            </p>
          </div>
          <Badge variant={sugerencia.estado_datos === "LISTO" ? "secondary" : "outline"}>{sugerencia.estado_datos}</Badge>
        </div>
        {sugerencia.incorporado_en && (
          <p className={cn(metaText, "mt-1.5")}>Incorporado al maestro: {displayDate(sugerencia.incorporado_en)}</p>
        )}
      </div>

      <div className="rounded-md border p-3">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold">
          <Calculator className="h-4 w-4 text-primary" /> Cómo se obtuvo
        </h3>
        <p className="mt-1.5 text-[12px]">{String(explicacion.motivo ?? "Sin explicación disponible")}</p>
        {explicacion.tipo_demanda && (
          <p className={cn(metaText, "mt-0.5")}>
            Patrón {String(explicacion.tipo_demanda).toLowerCase()} · ADI {decimal.format(Number(explicacion.adi ?? 0))} · CV² {decimal.format(Number(explicacion.cv2 ?? 0))}
          </p>
        )}
        <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
          <span>Demanda mensual <strong className="float-right text-foreground">{decimal.format(sugerencia.demanda_ponderada_mensual)}</strong></span>
          <span>Horizonte <strong className="float-right text-foreground">{sugerencia.horizonte_meses} meses</strong></span>
          <span>Demanda horizonte <strong className="float-right text-foreground">{decimal.format(sugerencia.demanda_horizonte)}</strong></span>
          <span>Stock seguridad <strong className="float-right text-foreground">{decimal.format(sugerencia.stock_seguridad)}{sugerencia.tipo_stock_seguridad === "ESTIMADA" ? " (estimada)" : ""}</strong></span>
          <span>Cobertura aplicada <strong className="float-right text-foreground">{decimal.format(sugerencia.cobertura_aplicada_meses ?? sugerencia.horizonte_meses)} meses</strong></span>
          <span>Mínimo estratégico <strong className="float-right text-foreground">{decimal.format(sugerencia.stock_minimo_estrategico)}</strong></span>
          <span>Tránsito <strong className="float-right text-foreground">0 (pendiente fuente)</strong></span>
          <span>Necesidad neta <strong className="float-right text-foreground">{decimal.format(sugerencia.necesidad_neta)}</strong></span>
        </div>
      </div>

      <div className="space-y-2.5 rounded-md border p-3">
        <div>
          <h3 className="text-[13px] font-semibold leading-5">Datos maestros de planificación</h3>
          <p className={metaText}>El mínimo estratégico es opcional y funciona como piso del objetivo, incluso cuando la pieza todavía no tiene historial.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px]">Stock mínimo estratégico</Label>
            <Input className="mt-1 h-8 text-[12px]" type="number" min="0" step="1" value={minimoEstrategico} onChange={(event) => setMinimoEstrategico(event.target.value)} disabled={!canManage} />
          </div>
          <div>
            <Label className="text-[11px]">Origen</Label>
            <Input className="mt-1 h-8 text-[12px]" value={origen} onChange={(event) => setOrigen(event.target.value)} disabled={!canManage} />
          </div>
        </div>
        <div>
          <Label className="text-[11px]">Observaciones</Label>
          <Textarea className="mt-1 text-[12px]" rows={2} value={notas} onChange={(event) => setNotas(event.target.value)} disabled={!canManage} />
        </div>
        {canManage && (
          <Button size="sm" className="w-full" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar datos maestros
          </Button>
        )}
      </div>
    </div>
  );
}

export function DetalleRepuestoSheet({
  producto,
  onClose,
  sugerencia = null,
  sugerenciaCargando = false,
  canManage = false,
  onSugerenciaGuardada,
  tabInicial = "ventas",
}: {
  producto: DetalleRepuestoProducto | null;
  onClose: () => void;
  sugerencia?: ResultadoSugerencia | null;
  sugerenciaCargando?: boolean;
  canManage?: boolean;
  onSugerenciaGuardada?: () => void;
  tabInicial?: string;
}) {
  const codigo = producto?.codigo_interno ?? null;
  const ventasQuery = useVentasRepuesto(codigo);
  const ventas = ventasQuery.data ?? [];
  const hermanosQuery = useRepuestoHermanos(codigo);
  const hermanos = hermanosQuery.data ?? [];
  const stockQuery = useStockMatrizProducto(producto?.stock ? null : codigo);
  const stock = producto?.stock ?? stockQuery.data ?? null;

  const [vistaHistorial, setVistaHistorial] = useState<VistaHistorial>("facturas");
  const [tab, setTab] = useState(tabInicial);

  useEffect(() => {
    if (producto) setTab(tabInicial);
  }, [producto?.codigo_interno, tabInicial]);

  const historialCargando = ventasQuery.isLoading || ventasQuery.isFetching;
  const historialError = ventasQuery.isError;
  const meses12 = useMemo(() => ultimosMeses(MESES_KPI), []);
  const cutoffKpiDate = useMemo(() => fechaLocal(`${meses12[0]}-01`), [meses12]);
  const ventas12m = useMemo(
    () => ventas.filter((linea) => {
      const fecha = fechaLocal(linea.fecha_factura);
      return Boolean(fecha && cutoffKpiDate && fecha >= cutoffKpiDate);
    }),
    [ventas, cutoffKpiDate],
  );

  const cutoffKpi24Date = useMemo(() => fechaLocal(`${ultimosMeses(MESES_KPI_LARGO)[0]}-01`), []);
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
      if (porMes.has(mes)) porMes.set(mes, (porMes.get(mes) ?? 0) + Number(linea.cantidad || 0));
    }
    return meses12.map((mes) => ({ mes, cantidad: porMes.get(mes) ?? 0 }));
  }, [meses12, ventas12m]);

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

  const ventasPorCliente = useMemo<VentaAgrupada[]>(() => {
    const map = new Map<string, { etiqueta: string; cantidad: number; total: number; facturas: Set<string> }>();
    for (const linea of ventas) {
      const nombre = limpiarNombreCliente(linea.cliente) || "Sin cliente";
      const clave = normalizarClienteClave(linea.cliente) || "SIN CLIENTE";
      const actual = map.get(clave) ?? { etiqueta: nombre, cantidad: 0, total: 0, facturas: new Set<string>() };
      actual.cantidad += Number(linea.cantidad || 0);
      actual.total += Number(linea.total_venta_usd || 0);
      if (linea.factura) actual.facturas.add(linea.factura);
      map.set(clave, actual);
    }
    return Array.from(map.entries())
      .map(([clave, v]) => ({ clave, etiqueta: v.etiqueta, cantidad: v.cantidad, facturas: v.facturas.size, total: v.total }))
      .sort((a, b) => b.total - a.total);
  }, [ventas]);

  const ventasPorMes = useMemo<VentaAgrupada[]>(() => {
    const map = new Map<string, { cantidad: number; total: number; facturas: Set<string> }>();
    for (const linea of ventas) {
      const mes = mesVenta(linea.fecha_factura) ?? "Sin fecha";
      const actual = map.get(mes) ?? { cantidad: 0, total: 0, facturas: new Set<string>() };
      actual.cantidad += Number(linea.cantidad || 0);
      actual.total += Number(linea.total_venta_usd || 0);
      if (linea.factura) actual.facturas.add(linea.factura);
      map.set(mes, actual);
    }
    return Array.from(map.entries())
      .map(([clave, v]) => ({
        clave,
        etiqueta: clave === "Sin fecha" ? clave : formatMes(clave),
        cantidad: v.cantidad,
        facturas: v.facturas.size,
        total: v.total,
      }))
      .sort((a, b) => b.clave.localeCompare(a.clave));
  }, [ventas]);

  const consumoPorAnio = useMemo<BarraConsumo[]>(() => {
    const map = new Map<string, number>();
    for (const linea of ventas) {
      const mes = mesVenta(linea.fecha_factura);
      if (!mes) continue;
      const anio = mes.slice(0, 4);
      map.set(anio, (map.get(anio) ?? 0) + Number(linea.cantidad || 0));
    }
    const anios = Array.from(map.keys()).sort();
    if (anios.length === 0) return [];
    const desde = Number(anios[0]);
    const hasta = Number(anios[anios.length - 1]);
    const series: BarraConsumo[] = [];
    for (let a = desde; a <= hasta; a += 1) {
      const clave = String(a);
      series.push({ clave, etiqueta: clave, valor: map.get(clave) ?? 0 });
    }
    return series;
  }, [ventas]);

  const consumoPorMes = useMemo<BarraConsumo[]>(
    () => evolucionMensual.map((item) => ({ clave: item.mes, etiqueta: item.mes.slice(5), valor: item.cantidad })),
    [evolucionMensual],
  );

  const consumoPorSucursal = useMemo<BarraConsumo[]>(
    () =>
      Array.from(vendidoPorSucursal.entries())
        .map(([clave, valor]) => ({ clave, etiqueta: clave, valor }))
        .sort((a, b) => b.valor - a.valor),
    [vendidoPorSucursal],
  );

  const stockGlobal = stock ? Number(stock.total ?? 0) : sugerencia ? Number(sugerencia.stock_global ?? 0) : null;
  const ritmoMensual = sugerencia
    ? Number(sugerencia.demanda_ponderada_mensual ?? 0)
    : promedioMensual;
  const coberturaMeses = ritmoMensual > 0 && stockGlobal !== null ? stockGlobal / ritmoMensual : null;

  const resumen = [
    { label: "Stock global", value: stockGlobal === null ? "—" : integer.format(stockGlobal) },
    { label: "Venta 12m", value: historialCargando ? "…" : historialError ? "—" : integer.format(unidades12m) },
    {
      label: "Demanda mensual",
      value: sugerencia
        ? decimal.format(sugerencia.demanda_ponderada_mensual)
        : historialCargando ? "…" : decimal.format(promedioMensual),
    },
    { label: "Cobertura", value: coberturaMeses === null ? "—" : `${decimal.format(coberturaMeses)} m` },
    { label: "Objetivo", value: sugerencia ? decimal.format(sugerencia.stock_objetivo) : "—" },
    { label: "Sugerencia", value: sugerencia ? integer.format(sugerencia.sugerencia_unidades) : "—" },
  ];

  return (
    <Sheet open={producto !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:w-[min(1120px,94vw)] sm:max-w-none">
        {producto && (
          <>
            <SheetHeader className="border-b px-5 py-3 pr-12 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="text-[14px]">{producto.descripcion}</SheetTitle>
                  <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="font-mono">{producto.codigo_interno}</span>
                    {producto.codigo_fabricante && <span>Fabricante: {producto.codigo_fabricante}</span>}
                    {producto.familia && <span>{producto.familia}</span>}
                  </SheetDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {sugerencia && (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        sugerencia.sugerencia_unidades > 0
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {sugerencia.sugerencia_unidades > 0
                        ? `Sugerido pedir ${integer.format(sugerencia.sugerencia_unidades)} un.`
                        : "Sin necesidad de pedido"}
                    </span>
                  )}
                  <MarcaBadge marca={producto.marca as never} />
                </div>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-3 divide-x divide-y border-b sm:grid-cols-6 sm:divide-y-0">
              {resumen.map((item) => (
                <div key={item.label} className="px-3 py-2">
                  <p className="text-[16px] font-semibold leading-6 tabular-nums tracking-[-0.02em]">{item.value}</p>
                  <p className={cn(metaText, "truncate")}>{item.label}</p>
                </div>
              ))}
            </div>

            {hermanos.length > 0 && (
              <div
                className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-900"
                title={`Mismo código de fabricante que ${hermanos
                  .map((h) => `${h.codigo_interno} (${h.descripcion})`)
                  .join(", ")}. La factura no distingue cuál se vendió realmente.`}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  Mismo código de fabricante que{" "}
                  {hermanos.map((h) => h.codigo_interno).join(", ")} — las ventas pueden corresponder a cualquiera.
                </span>
              </div>
            )}

            {historialError && (
              <div className="flex items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-1.5 text-[11px] text-destructive">
                <span className="truncate" title={mensajeError(ventasQuery.error)}>
                  No se pudo consultar el historial. El stock sigue disponible.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => ventasQuery.refetch()}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Reintentar
                </Button>
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <TabsList className="h-8">
                  <TabsTrigger value="ventas" className="h-6 text-[12px]">Ventas</TabsTrigger>
                  <TabsTrigger value="sucursales" className="h-6 text-[12px]">Sucursales</TabsTrigger>
                  <TabsTrigger value="consumo" className="h-6 text-[12px]">Consumo</TabsTrigger>
                  <TabsTrigger value="planificacion" className="h-6 text-[12px]">Planificación</TabsTrigger>
                </TabsList>

                {tab === "ventas" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={metaText}>{cobertura}</span>
                    <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border text-[11px]">
                      {VISTAS_HISTORIAL.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setVistaHistorial(value)}
                          className={cn(
                            "px-3 hover:bg-accent",
                            vistaHistorial === value && "bg-primary text-primary-foreground hover:bg-primary",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {tab === "consumo" && <span className={metaText}>Unidades vendidas</span>}
              </div>

              <TabsContent value="sucursales" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <div className="h-full overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
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
                          <TableRow key={String(columna.key)}>
                            <TableCell className={td}>{columna.label}</TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>
                              {historialCargando ? "…" : historialError ? "—" : integer.format(vendidoPorSucursal.get(clave) ?? 0)}
                            </TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>
                              {historialCargando ? "…" : historialError ? "—" : integer.format(vendidoPorSucursal24m.get(clave) ?? 0)}
                            </TableCell>
                            <TableCell className={cn(td, "text-right font-semibold tabular-nums")}>
                              {stock ? integer.format(Number(stock[columna.key] ?? 0)) : stockQuery.isLoading ? "…" : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="consumo" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <div className="h-full overflow-auto p-4">
                  {historialCargando ? (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">Cargando historial...</p>
                  ) : historialError ? (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">El historial no está disponible.</p>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <BloqueConsumo titulo="Por año" subtitulo="Historial completo — unidades" series={consumoPorAnio} />
                      <BloqueConsumo titulo="Por mes" subtitulo="Últimos 12 meses — unidades" series={consumoPorMes} />
                      <BloqueConsumo
                        titulo="Por sucursal"
                        subtitulo="Últimos 12 meses — unidades"
                        series={consumoPorSucursal}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="planificacion" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <PanelPlanificacion
                  sugerencia={sugerencia}
                  cargando={sugerenciaCargando}
                  canManage={canManage}
                  onSaved={onSugerenciaGuardada}
                />
              </TabsContent>

              <TabsContent value="ventas" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <div className="h-full overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      {vistaHistorial === "facturas" ? (
                        <TableRow>
                          <TableHead className={th}>Fecha</TableHead>
                          <TableHead className={th}>Factura</TableHead>
                          <TableHead className={th}>Cliente</TableHead>
                          <TableHead className={cn(th, "text-right")}>Cantidad</TableHead>
                          <TableHead className={cn(th, "text-right")}>Precio Unit.</TableHead>
                          <TableHead className={cn(th, "text-right")}>Precio Total</TableHead>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableHead className={th}>{vistaHistorial === "clientes" ? "Cliente" : "Período"}</TableHead>
                          <TableHead className={cn(th, "text-right")}>Cantidad</TableHead>
                          <TableHead className={cn(th, "text-right")}>Facturas</TableHead>
                          <TableHead className={cn(th, "text-right")}>Total USD</TableHead>
                        </TableRow>
                      )}
                    </TableHeader>
                    <TableBody>
                      {historialCargando && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-[12px] text-muted-foreground">
                            Cargando historial de ventas...
                          </TableCell>
                        </TableRow>
                      )}
                      {historialError && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-[12px] text-muted-foreground">
                            El historial no está disponible.
                          </TableCell>
                        </TableRow>
                      )}
                      {!historialCargando && !historialError && vistaHistorial === "facturas" && ventas.map((linea) => {
                        const cantidad = Number(linea.cantidad || 0);
                        const total = Number(linea.total_venta_usd || 0);
                        const precioUnitario = cantidad > 0 ? total / cantidad : null;
                        return (
                          <TableRow key={linea.linea_id}>
                            <TableCell className={cn(td, "whitespace-nowrap")}>{fechaVentaLabel(linea.fecha_factura)}</TableCell>
                            <TableCell className={cn(td, "whitespace-nowrap font-mono text-[10px]")}>{linea.factura || "Sin número"}</TableCell>
                            <TableCell className={cn(td, "max-w-48 truncate")}>{linea.cliente || "Sin cliente"}</TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>
                              <div className="flex items-center justify-end gap-1.5">
                                <span>{integer.format(cantidad)}</span>
                                {linea.conversion_aplicada && (
                                  <span
                                    className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 text-[9px] font-semibold text-amber-700"
                                    title={`${integer.format(Number(linea.cantidad_original || 0))} ${linea.unidad_original || ""} x ${linea.factor_conversion} = ${integer.format(cantidad)} ${linea.unidad_destino || ""}`}
                                  >
                                    {linea.unidad_original}-{">"}{linea.unidad_destino}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>
                              {precioUnitario === null ? "—" : precioUnitario.toLocaleString("es-PY", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>{integer.format(total)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {!historialCargando && !historialError && vistaHistorial !== "facturas" &&
                        (vistaHistorial === "clientes" ? ventasPorCliente : ventasPorMes).map((fila) => (
                          <TableRow key={fila.clave}>
                            <TableCell className={cn(td, "max-w-48 truncate")}>{fila.etiqueta}</TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>{integer.format(fila.cantidad)}</TableCell>
                            <TableCell className={cn(td, "text-right tabular-nums")}>{integer.format(fila.facturas)}</TableCell>
                            <TableCell className={cn(td, "text-right font-medium tabular-nums")}>{integer.format(fila.total)}</TableCell>
                          </TableRow>
                        ))}
                      {!historialCargando && !historialError && ventas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-[12px] text-muted-foreground">
                            No se encontraron ventas vinculadas a {producto.codigo_interno}
                            {producto.codigo_fabricante ? ` / fabricante ${producto.codigo_fabricante}` : ""}.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default DetalleRepuestoSheet;
