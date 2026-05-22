import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  PhoneCall,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { SUCURSALES, type Estado, type Marca, type Sucursal } from "@/lib/constants";
import { estadoTrabajoDesdeJornadas, type EstadoTrabajo } from "@/lib/trabajos";
import { cn } from "@/lib/utils";

interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
  sucursal: Sucursal;
  marca: Marca;
  estado: Estado;
  horas_trabajadas: number | null;
  cliente_id: string | null;
  trabajo_descripcion: string;
}

interface Jornada {
  id: string;
  servicio_id: string;
  fecha: string;
  estado: "Pendiente" | "Completado" | "Cancelada";
  horas_trabajadas: number | null;
  tecnico_responsable_id: string | null;
  auxiliares: string[];
}

interface Trabajo {
  id: string;
  estado_general: EstadoTrabajo | string | null;
  legacy_servicio_id: string | null;
  sucursal: Sucursal;
  cliente_id: string | null;
  descripcion_problema: string;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface ParqueKpi {
  total_maquinas: number;
  total_clientes: number;
  con_servicio_anio: number;
  contactados_mes: number;
  sin_contacto_60d: number;
}

interface FactResumen {
  cliente_id: string;
  fact_actual: number | string;
  fact_prev: number | string;
}

const PAGE = 1000;
const today = new Date();
const todayStr = format(today, "yyyy-MM-dd");

const statusColor: Record<string, string> = {
  Pendiente: "#EF9F27",
  Programado: "#3B82F6",
  Iniciado: "#14B8A6",
  Completado: "#639922",
  Cancelada: "#9CA3AF",
};

const money = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
    notation: value >= 1_000_000_000 ? "compact" : "standard",
  }).format(value);

const trendText = (value: number | null) => {
  if (value == null) return "sin base previa";
  if (value === 0) return "sin variacion";
  return `${value > 0 ? "+" : ""}${value}% vs periodo anterior`;
};

async function cargarTodo<T>(queryBuilder: any): Promise<T[]> {
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [parqueKpi, setParqueKpi] = useState<ParqueKpi | null>(null);
  const [facturacion, setFacturacion] = useState<FactResumen[]>([]);
  const [loading, setLoading] = useState(true);

  const monthStart = useMemo(() => startOfMonth(today), []);
  const monthEnd = useMemo(() => endOfMonth(today), []);
  const prevMonthStart = useMemo(() => startOfMonth(subMonths(today, 1)), []);
  const prevMonthEnd = useMemo(() => endOfMonth(subMonths(today, 1)), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [serviciosRows, trabajosRows, jornadasRows, clientesRows, parqueRes, factRes] = await Promise.all([
          cargarTodo<Servicio>(
            supabase
              .from("servicios")
              .select(
                "id, fecha_programada, tecnico_responsable_id, auxiliares, sucursal, marca, estado, horas_trabajadas, cliente_id, trabajo_descripcion",
              ),
          ),
          cargarTodo<Trabajo>(
            supabase
              .from("trabajos")
              .select("id, estado_general, legacy_servicio_id, sucursal, cliente_id, descripcion_problema"),
          ),
          cargarTodo<Jornada>(
            supabase
              .from("servicio_jornadas")
              .select("id, servicio_id, fecha, estado, horas_trabajadas, tecnico_responsable_id, auxiliares")
              .order("fecha", { ascending: true }),
          ),
          cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal")),
          supabase.rpc("parque_kpis"),
          supabase.rpc("parque_resumen_facturacion", {
            p_desde: format(monthStart, "yyyy-MM-dd"),
            p_hasta: format(monthEnd, "yyyy-MM-dd"),
            p_prev_desde: format(prevMonthStart, "yyyy-MM-dd"),
            p_prev_hasta: format(prevMonthEnd, "yyyy-MM-dd"),
          }),
        ]);

        if (!alive) return;
        setServicios(serviciosRows);
        setTrabajos(trabajosRows);
        setJornadas(jornadasRows);
        setClientes(clientesRows);
        setParqueKpi(((parqueRes.data ?? [])[0] as ParqueKpi | undefined) ?? null);
        setFacturacion((factRes.data ?? []) as FactResumen[]);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [monthEnd, monthStart, prevMonthEnd, prevMonthStart]);

  const servicioById = useMemo(() => new Map(servicios.map((servicio) => [servicio.id, servicio])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((cliente) => [cliente.id, cliente])), [clientes]);
  const jornadasByTrabajo = useMemo(() => {
    const servicioATrabajo = new Map<string, string>();
    for (const trabajo of trabajos) {
      if (trabajo.legacy_servicio_id) servicioATrabajo.set(trabajo.legacy_servicio_id, trabajo.id);
    }

    const map = new Map<string, Jornada[]>();
    for (const jornada of jornadas) {
      const trabajoId = servicioATrabajo.get(jornada.servicio_id);
      if (!trabajoId) continue;
      const current = map.get(trabajoId) ?? [];
      current.push(jornada);
      map.set(trabajoId, current);
    }

    return map;
  }, [jornadas, trabajos]);

  const estadoPorTrabajo = useMemo(() => {
    const map = new Map<string, EstadoTrabajo>();
    for (const trabajo of trabajos) {
      map.set(trabajo.id, estadoTrabajoDesdeJornadas(jornadasByTrabajo.get(trabajo.id) ?? [], trabajo.estado_general));
    }
    return map;
  }, [jornadasByTrabajo, trabajos]);

  const serviciosMes = servicios.filter((servicio) =>
    isWithinInterval(parseISO(servicio.fecha_programada), { start: monthStart, end: monthEnd }),
  );
  const serviciosPrev = servicios.filter((servicio) =>
    isWithinInterval(parseISO(servicio.fecha_programada), { start: prevMonthStart, end: prevMonthEnd }),
  );
  const abiertos = trabajos.filter((trabajo) => estadoPorTrabajo.get(trabajo.id) !== "completado");
  const serviciosMesIds = new Set(serviciosMes.map((servicio) => servicio.id));
  const serviciosPrevIds = new Set(serviciosPrev.map((servicio) => servicio.id));
  const abiertasMes = trabajos.filter(
    (trabajo) => trabajo.legacy_servicio_id && serviciosMesIds.has(trabajo.legacy_servicio_id) && estadoPorTrabajo.get(trabajo.id) !== "completado",
  ).length;
  const abiertasPrev = trabajos.filter(
    (trabajo) => trabajo.legacy_servicio_id && serviciosPrevIds.has(trabajo.legacy_servicio_id) && estadoPorTrabajo.get(trabajo.id) !== "completado",
  ).length;
  const abiertosTrend = abiertasPrev > 0 ? Math.round(((abiertasMes - abiertasPrev) / abiertasPrev) * 100) : null;

  const jornadasMes = jornadas.filter((jornada) =>
    isWithinInterval(parseISO(jornada.fecha), { start: monthStart, end: monthEnd }),
  );
  const realizadasMes = jornadasMes.filter((jornada) => jornada.estado === "Completado").length;
  const cierreMes = jornadasMes.length ? Math.round((realizadasMes / jornadasMes.length) * 100) : 0;
  const pendientesCierre = jornadas.filter((jornada) => jornada.estado === "Pendiente" && jornada.fecha < todayStr);
  const fueraTolerancia = pendientesCierre.filter(
    (jornada) => differenceInCalendarDays(today, parseISO(jornada.fecha)) > 7,
  );

  const totalClientesParque = parqueKpi?.total_clientes ?? 0;
  const pctServicioAnio =
    totalClientesParque > 0 ? Math.round(((parqueKpi?.con_servicio_anio ?? 0) / totalClientesParque) * 100) : 0;

  const factActual = facturacion.reduce((acc, row) => acc + Number(row.fact_actual || 0), 0);
  const factPrev = facturacion.reduce((acc, row) => acc + Number(row.fact_prev || 0), 0);
  const factTrend = factPrev > 0 ? Math.round(((factActual - factPrev) / factPrev) * 100) : null;

  const funnel = useMemo(() => {
    const order: Array<{ key: EstadoTrabajo; label: string }> = [
      { key: "pendiente", label: "Pendiente" },
      { key: "programado", label: "Programado" },
      { key: "iniciado", label: "Iniciado" },
      { key: "completado", label: "Completado" },
    ];
    const counts = new Map<string, number>();
    for (const trabajo of trabajos) {
      const estado = estadoPorTrabajo.get(trabajo.id) ?? "pendiente";
      counts.set(estado, (counts.get(estado) ?? 0) + 1);
    }
    return order.map((item) => ({
      estado: item.label,
      cantidad: counts.get(item.key) ?? 0,
      fill: statusColor[item.label],
    }));
  }, [estadoPorTrabajo, trabajos]);

  const sucursales = useMemo(() => {
    const factBySucursal = new Map<Sucursal, number>();
    for (const row of facturacion) {
      const cliente = clienteById.get(row.cliente_id);
      if (!cliente?.sucursal) continue;
      factBySucursal.set(cliente.sucursal, (factBySucursal.get(cliente.sucursal) ?? 0) + Number(row.fact_actual || 0));
    }

    return SUCURSALES.map((sucursal) => {
      const trabajosSucursal = trabajos.filter((trabajo) => trabajo.sucursal === sucursal);
      const abiertosSucursal = trabajosSucursal.filter((trabajo) => estadoPorTrabajo.get(trabajo.id) !== "completado").length;
      const jornadasSucursal = jornadasMes.filter((jornada) => servicioById.get(jornada.servicio_id)?.sucursal === sucursal);
      const cerradasSucursal = jornadasSucursal.filter((jornada) => jornada.estado === "Completado").length;
      const vencidasSucursal = fueraTolerancia.filter((jornada) => servicioById.get(jornada.servicio_id)?.sucursal === sucursal).length;
      const cierre = jornadasSucursal.length ? Math.round((cerradasSucursal / jornadasSucursal.length) * 100) : 0;
      return {
        sucursal,
        abiertos: abiertosSucursal,
        vencidos: vencidasSucursal,
        cierre,
        facturacion: factBySucursal.get(sucursal) ?? 0,
      };
    }).sort((a, b) => b.vencidos - a.vencidos || b.abiertos - a.abiertos || b.facturacion - a.facturacion);
  }, [clienteById, estadoPorTrabajo, facturacion, fueraTolerancia, jornadasMes, servicioById, trabajos]);

  const alertas = useMemo(() => {
    const items: Array<{ id: string; titulo: string; detalle: string; tono: "bad" | "warn"; to: string }> = [];

    if (fueraTolerancia.length > 0) {
      const oldest = fueraTolerancia.slice().sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const servicio = servicioById.get(oldest.servicio_id);
      const cliente = servicio?.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre : null;
      items.push({
        id: "cierre",
        titulo: `${fueraTolerancia.length} jornadas +7d sin cierre`,
        detalle: `${cliente ?? "Trabajo sin cliente"} es el caso mas antiguo`,
        tono: "bad",
        to: "/",
      });
    }

    if ((parqueKpi?.sin_contacto_60d ?? 0) > 0) {
      items.push({
        id: "contacto",
        titulo: `${parqueKpi?.sin_contacto_60d ?? 0} clientes sin contacto +60d`,
        detalle: "Riesgo de enfriamiento de base instalada",
        tono: "warn",
        to: "/parque-clientes",
      });
    }

    if (factTrend != null && factTrend <= -15) {
      items.push({
        id: "facturacion",
        titulo: `Facturacion cae ${Math.abs(factTrend)}%`,
        detalle: `$${money(factActual)} este mes vs $${money(factPrev)} anterior`,
        tono: "bad",
        to: "/parque-clientes",
      });
    }

    const sinHoras = jornadas.filter((jornada) => jornada.estado === "Completado" && !Number(jornada.horas_trabajadas)).length;
    if (sinHoras > 0) {
      items.push({
        id: "horas",
        titulo: `${sinHoras} jornadas realizadas sin horas`,
        detalle: "La medicion de productividad queda incompleta",
        tono: "warn",
        to: "/trabajos",
      });
    }

    return items.slice(0, 5);
  }, [clienteById, factActual, factPrev, factTrend, fueraTolerancia, jornadas, parqueKpi?.sin_contacto_60d, servicioById]);

  return (
    <div className="container max-w-[1320px] space-y-3 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Vision ejecutiva · {format(monthStart, "dd/MM")} al {format(monthEnd, "dd/MM")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/trabajos")}>Trabajos</Button>
          <Button size="sm" onClick={() => navigate("/parque-clientes")}>Parque</Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={ClipboardList}
          label="Trabajos abiertos"
          value={abiertos.length}
          detail={trendText(abiertosTrend)}
          tone={fueraTolerancia.length > 0 ? "bad" : "neutral"}
          loading={loading}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Cierre operativo"
          value={`${cierreMes}%`}
          detail={`${fueraTolerancia.length} fuera de plazo`}
          tone={cierreMes >= 70 ? "good" : cierreMes >= 45 ? "warn" : "bad"}
          loading={loading}
        />
        <KpiCard
          icon={Wrench}
          label="Cobertura parque"
          value={`${pctServicioAnio}%`}
          detail={`${parqueKpi?.total_maquinas ?? 0} maquinas activas`}
          tone={pctServicioAnio >= 70 ? "good" : pctServicioAnio >= 50 ? "warn" : "bad"}
          loading={loading}
        />
        <KpiCard
          icon={factTrend != null && factTrend < 0 ? TrendingDown : TrendingUp}
          label="Facturacion posventa"
          value={`$${money(factActual)}`}
          detail={trendText(factTrend)}
          tone={factTrend == null ? "neutral" : factTrend >= 0 ? "good" : factTrend <= -15 ? "bad" : "warn"}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[0.95fr_1.35fr_0.85fr]">
        <Card className="p-3">
          <div className="mb-2">
            <h2 className="text-sm font-semibold">Embudo operativo</h2>
            <p className="text-xs text-muted-foreground">Estado macro del flujo de trabajos.</p>
          </div>
          <div className="h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="estado" width={78} tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                  {funnel.map((row) => <Cell key={row.estado} fill={row.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Matriz por sucursal</h2>
              <p className="text-xs text-muted-foreground">Comparacion rapida de carga, atraso, cierre y facturacion.</p>
            </div>
            <Button variant="ghost" size="sm" className="hidden h-7 sm:inline-flex" onClick={() => navigate("/")}>
              Planificador <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_64px_64px_64px_92px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Sucursal</div>
              <div className="text-right">Abiertos</div>
              <div className="text-right">+7d</div>
              <div className="text-right">Cierre</div>
              <div className="text-right">Fact.</div>
            </div>
            {sucursales.map((row) => (
              <div key={row.sucursal} className="grid grid-cols-[1fr_64px_64px_64px_92px] items-center border-t px-3 py-2 text-xs">
                <div className="truncate font-medium">{row.sucursal}</div>
                <div className="text-right tabular-nums">{row.abiertos}</div>
                <div className={cn("text-right tabular-nums", row.vencidos > 0 && "font-semibold text-destructive")}>{row.vencidos}</div>
                <div className="text-right tabular-nums">{row.cierre}%</div>
                <div className="truncate text-right tabular-nums">${money(row.facturacion)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-2">
            <h2 className="text-sm font-semibold">Alertas ejecutivas</h2>
            <p className="text-xs text-muted-foreground">Solo desvíos con accion clara.</p>
          </div>
          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <SkeletonLine key={index} />)
            ) : alertas.length === 0 ? (
              <div className="rounded-md border bg-emerald-500/5 px-3 py-6 text-center text-xs text-emerald-700">
                Sin alertas criticas visibles.
              </div>
            ) : (
              alertas.map((alerta) => (
                <button
                  key={alerta.id}
                  className="w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => navigate(alerta.to)}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", alerta.tono === "bad" ? "bg-destructive" : "bg-amber-500")} />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">{alerta.titulo}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{alerta.detalle}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <InsightCard
          icon={PhoneCall}
          title="Base instalada"
          value={`${parqueKpi?.sin_contacto_60d ?? 0}`}
          label="clientes sin contacto +60d"
          detail={`${parqueKpi?.contactados_mes ?? 0} contactados este mes`}
          tone={(parqueKpi?.sin_contacto_60d ?? 0) > 0 ? "warn" : "good"}
          onClick={() => navigate("/parque-clientes")}
        />
        <InsightCard
          icon={AlertTriangle}
          title="Disciplina operativa"
          value={`${pendientesCierre.length}`}
          label="jornadas pendientes de cierre"
          detail={`${fueraTolerancia.length} fuera de tolerancia`}
          tone={fueraTolerancia.length > 0 ? "bad" : pendientesCierre.length > 0 ? "warn" : "good"}
          onClick={() => navigate("/")}
        />
        <InsightCard
          icon={Wrench}
          title="Oportunidad parque"
          value={`${totalClientesParque - (parqueKpi?.con_servicio_anio ?? 0)}`}
          label="clientes sin servicio ultimo anio"
          detail={`${pctServicioAnio}% de cobertura actual`}
          tone={pctServicioAnio >= 70 ? "good" : "warn"}
          onClick={() => navigate("/parque-clientes")}
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
  loading: boolean;
}) {
  return (
    <Card className={cn("p-3", tone === "bad" && "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : value}
          </div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function InsightCard({
  icon: Icon,
  title,
  value,
  label,
  detail,
  tone,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  label: string;
  detail: string;
  tone: "good" | "warn" | "bad";
  onClick: () => void;
}) {
  return (
    <button className="rounded-lg text-left" onClick={onClick}>
      <Card className="p-3 transition-colors hover:bg-accent/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{value}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
          </div>
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </button>
  );
}

function SkeletonLine() {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

const toneClasses = {
  neutral: "bg-primary/10 text-primary",
  good: "bg-emerald-500/10 text-emerald-700",
  warn: "bg-amber-500/10 text-amber-700",
  bad: "bg-destructive/10 text-destructive",
};
