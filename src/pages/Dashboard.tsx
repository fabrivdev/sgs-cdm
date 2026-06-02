import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
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
  CalendarDays,
  CheckCircle2,
  DollarSign,
  PauseCircle,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { SUCURSALES, type Marca, type Sucursal } from "@/lib/constants";
import { estadoTrabajoDesdeJornadas, type EstadoTrabajo } from "@/lib/trabajos";
import { cn } from "@/lib/utils";

const PAGE = 1000;
const today = new Date();
const todayStr = format(today, "yyyy-MM-dd");
const initialWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
  sucursal: Sucursal;
  marca: Marca;
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
  auxiliares: string[] | null;
}

interface Trabajo {
  id: string;
  codigo: string | null;
  estado_general: EstadoTrabajo | string | null;
  legacy_servicio_id: string | null;
  sucursal: Sucursal;
  cliente_id: string | null;
  descripcion_problema: string;
  prioridad: string | null;
  motivo_bloqueo: string | null;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface Facturacion {
  fecha: string;
  sucursal: Sucursal | null;
  tipo: "Repuesto" | "Servicio";
  cliente_id: string | null;
  entidad_nombre: string;
  total_venta: number | string;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
}

type Tone = "neutral" | "good" | "warn" | "bad";
type Concepto = "Repuestos" | "Servicio" | "Kilometraje" | "Otros";

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

function localDate(value: string) {
  return parseISO(value);
}

function inRange(date: string, start: Date, end: Date) {
  return isWithinInterval(localDate(date), { start, end });
}

function money(value: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function trendLabel(value: number | null) {
  if (value == null) return "sin base previa";
  if (value === 0) return "igual que periodo anterior";
  return `${value > 0 ? "+" : ""}${value}% vs periodo anterior`;
}

function conceptoFacturacion(row: Facturacion): Concepto {
  const grupo = `${row.grupo_fx ?? ""} ${row.grupo ?? ""}`.trim().toLowerCase();
  if (row.tipo === "Repuesto" || grupo.includes("repuesto")) return "Repuestos";
  if (grupo.includes("kilomet")) return "Kilometraje";
  if (grupo.includes("mano de obra")) return "Servicio";
  if (row.tipo === "Servicio") return "Otros";
  return "Otros";
}

function sumFact(rows: Facturacion[]) {
  return rows.reduce((acc, row) => acc + Number(row.total_venta || 0), 0);
}

function compactName(name: string, max = 34) {
  return name.length > max ? `${name.slice(0, max - 1)}...` : name;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [facturacion, setFacturacion] = useState<Facturacion[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekStartInput, setWeekStartInput] = useState(initialWeekStart);
  const [fSucursal, setFSucursal] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [serviciosRows, jornadasRows, trabajosRows, clientesRows, profilesRows, factRows] = await Promise.all([
          cargarTodo<Servicio>(
            supabase
              .from("servicios")
              .select("id, fecha_programada, tecnico_responsable_id, auxiliares, sucursal, marca, cliente_id, trabajo_descripcion"),
          ),
          cargarTodo<Jornada>(
            supabase
              .from("servicio_jornadas")
              .select("id, servicio_id, fecha, estado, horas_trabajadas, tecnico_responsable_id, auxiliares")
              .order("fecha", { ascending: true }),
          ),
          cargarTodo<Trabajo>(
            supabase
              .from("trabajos")
              .select("id, codigo, estado_general, legacy_servicio_id, sucursal, cliente_id, descripcion_problema, prioridad, motivo_bloqueo"),
          ),
          cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal")),
          cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal")),
          cargarTodo<Facturacion>(
            supabase
              .from("facturacion")
              .select("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, grupo, grupo_fx, cod_factura")
              .order("fecha", { ascending: false }),
          ),
        ]);

        if (!alive) return;
        setServicios(serviciosRows);
        setJornadas(jornadasRows);
        setTrabajos(trabajosRows);
        setClientes(clientesRows);
        setProfiles(profilesRows);
        setFacturacion(factRows);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const weekStart = useMemo(() => startOfWeek(parseISO(weekStartInput), { weekStartsOn: 1 }), [weekStartInput]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const previousWeekStart = useMemo(() => subWeeks(weekStart, 1), [weekStart]);
  const previousWeekEnd = useMemo(() => endOfWeek(previousWeekStart, { weekStartsOn: 1 }), [previousWeekStart]);
  const monthStart = useMemo(() => startOfMonth(weekStart), [weekStart]);
  const monthEnd = useMemo(() => endOfMonth(weekStart), [weekStart]);
  const previousMonthStart = useMemo(() => startOfMonth(subMonths(weekStart, 1)), [weekStart]);
  const previousMonthEnd = useMemo(() => endOfMonth(subMonths(weekStart, 1)), [weekStart]);

  const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);

  const scopedServicio = (servicio: Servicio | undefined | null) => {
    if (!servicio) return false;
    if (fSucursal !== "all" && servicio.sucursal !== fSucursal) return false;
    if (q.trim()) {
      const cliente = servicio.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre ?? "" : "";
      const query = q.trim().toLowerCase();
      if (!cliente.toLowerCase().includes(query) && !servicio.trabajo_descripcion.toLowerCase().includes(query)) return false;
    }
    return true;
  };

  const scopedTrabajo = (trabajo: Trabajo) => {
    if (fSucursal !== "all" && trabajo.sucursal !== fSucursal) return false;
    if (q.trim()) {
      const cliente = trabajo.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre ?? "" : "";
      const query = q.trim().toLowerCase();
      if (
        !cliente.toLowerCase().includes(query) &&
        !trabajo.descripcion_problema.toLowerCase().includes(query) &&
        !(trabajo.codigo ?? "").toLowerCase().includes(query)
      ) {
        return false;
      }
    }
    return true;
  };

  const scopedFact = (row: Facturacion) => {
    if (fSucursal !== "all" && row.sucursal !== fSucursal) return false;
    if (q.trim()) {
      const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      if (!cliente.toLowerCase().includes(q.trim().toLowerCase())) return false;
    }
    return true;
  };

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

  const jornadasRealizadasPrev = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Completado" && inRange(jornada.fecha, previousWeekStart, previousWeekEnd) && scopedServicio(servicio);
      }),
    [jornadas, previousWeekEnd, previousWeekStart, servicioById, fSucursal, q, clienteById],
  );

  const jornadasProgramadasSemana = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, weekStart, weekEnd) && scopedServicio(servicio);
      }),
    [jornadas, servicioById, weekEnd, weekStart, fSucursal, q, clienteById],
  );

  const jornadasPendientesCierre = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && jornada.fecha < todayStr && scopedServicio(servicio);
      }),
    [jornadas, servicioById, fSucursal, q, clienteById],
  );

  const trabajosScope = useMemo(() => trabajos.filter(scopedTrabajo), [trabajos, fSucursal, q, clienteById]);
  const trabajosPausados = useMemo(
    () =>
      trabajosScope.filter((trabajo) => {
        const estado = estadoTrabajoDesdeJornadas(jornadasByTrabajo.get(trabajo.id) ?? [], trabajo.estado_general);
        return estado === "pausado";
      }),
    [jornadasByTrabajo, trabajosScope],
  );

  const trabajosCompletadosPrev = useMemo(() => {
    const ids = new Set(jornadasRealizadasPrev.map((jornada) => jornada.servicio_id));
    return trabajosScope.filter((trabajo) => {
      if (!trabajo.legacy_servicio_id || !ids.has(trabajo.legacy_servicio_id)) return false;
      const estado = estadoTrabajoDesdeJornadas(jornadasByTrabajo.get(trabajo.id) ?? [], trabajo.estado_general);
      return estado === "completado";
    });
  }, [jornadasByTrabajo, jornadasRealizadasPrev, trabajosScope]);

  const factSemana = useMemo(() => facturacion.filter((row) => scopedFact(row) && inRange(row.fecha, weekStart, weekEnd)), [facturacion, weekEnd, weekStart, fSucursal, q, clienteById]);
  const factSemanaPrev = useMemo(() => facturacion.filter((row) => scopedFact(row) && inRange(row.fecha, previousWeekStart, previousWeekEnd)), [facturacion, previousWeekEnd, previousWeekStart, fSucursal, q, clienteById]);
  const factMes = useMemo(() => facturacion.filter((row) => scopedFact(row) && inRange(row.fecha, monthStart, monthEnd)), [facturacion, monthEnd, monthStart, fSucursal, q, clienteById]);
  const factMesPrev = useMemo(() => facturacion.filter((row) => scopedFact(row) && inRange(row.fecha, previousMonthStart, previousMonthEnd)), [facturacion, previousMonthEnd, previousMonthStart, fSucursal, q, clienteById]);

  const totalSemana = sumFact(factSemana);
  const totalSemanaPrev = sumFact(factSemanaPrev);
  const totalMes = sumFact(factMes);
  const totalMesPrev = sumFact(factMesPrev);
  const trendSemana = pct(totalSemana, totalSemanaPrev);
  const trendMes = pct(totalMes, totalMesPrev);

  const factPorConcepto = useMemo(() => {
    const order: Concepto[] = ["Repuestos", "Servicio", "Kilometraje", "Otros"];
    const totals = new Map<Concepto, number>(order.map((key) => [key, 0]));
    for (const row of factSemana) {
      const concepto = conceptoFacturacion(row);
      totals.set(concepto, (totals.get(concepto) ?? 0) + Number(row.total_venta || 0));
    }
    return order.map((concepto) => ({ concepto, total: totals.get(concepto) ?? 0 }));
  }, [factSemana]);

  const factPorSucursal = useMemo(() => {
    return SUCURSALES.map((sucursal) => {
      const semana = sumFact(factSemana.filter((row) => row.sucursal === sucursal));
      const semanaPrev = sumFact(factSemanaPrev.filter((row) => row.sucursal === sucursal));
      const mes = sumFact(factMes.filter((row) => row.sucursal === sucursal));
      return { sucursal, semana, mes, variacion: pct(semana, semanaPrev) };
    }).sort((a, b) => b.semana - a.semana);
  }, [factMes, factSemana, factSemanaPrev]);

  const topClientes = useMemo(() => {
    const totals = new Map<string, { nombre: string; total: number; servicio: number; repuesto: number }>();
    for (const row of factSemana) {
      const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      const current = totals.get(nombre) ?? { nombre, total: 0, servicio: 0, repuesto: 0 };
      const value = Number(row.total_venta || 0);
      current.total += value;
      if (conceptoFacturacion(row) === "Repuestos") current.repuesto += value;
      else current.servicio += value;
      totals.set(nombre, current);
    }
    return Array.from(totals.values()).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [clienteById, factSemana]);

  const cargaTecnicos = useMemo(() => {
    const totals = new Map<string, number>();
    for (const jornada of jornadasProgramadasSemana) {
      const ids = [jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])].filter((id): id is string => !!id);
      for (const id of ids) totals.set(id, (totals.get(id) ?? 0) + 1);
    }
    return Array.from(totals.entries())
      .map(([id, count]) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [jornadasProgramadasSemana, profileById]);

  const factBars = factPorConcepto.map((row) => ({
    name: row.concepto,
    total: row.total,
    fill:
      row.concepto === "Repuestos"
        ? "#639922"
        : row.concepto === "Servicio"
          ? "#2563eb"
          : row.concepto === "Kilometraje"
            ? "#f59e0b"
            : "#94a3b8",
  }));

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > 7);

  const alertas = [
    fueraTolerancia.length > 0
      ? {
          tone: "bad" as Tone,
          title: `${fueraTolerancia.length} jornadas +7d sin cierre`,
          detail: "Afecta medicion de productividad y estado de trabajos.",
          to: "/?overdue=7",
        }
      : null,
    trabajosPausados.length > 0
      ? {
          tone: "warn" as Tone,
          title: `${trabajosPausados.length} trabajos pausados`,
          detail: "Revisar motivos: repuestos, cliente, aprobacion u otro bloqueo.",
          to: "/trabajos?estado=pausado",
        }
      : null,
    sinHorasPrev > 0
      ? {
          tone: "warn" as Tone,
          title: `${sinHorasPrev} jornadas realizadas sin horas`,
          detail: "La semana anterior queda incompleta para reporte.",
          to: "/?estado=Completado&sin_horas=1",
        }
      : null,
    trendSemana != null && trendSemana < -15
      ? {
          tone: "bad" as Tone,
          title: `Facturacion semanal cae ${Math.abs(trendSemana)}%`,
          detail: `${money(totalSemana)} vs ${money(totalSemanaPrev)} semana anterior.`,
          to: "/parque-clientes",
        }
      : null,
  ].filter(Boolean).slice(0, 5) as Array<{ tone: Tone; title: string; detail: string; to: string }>;

  const limpiar = () => {
    setWeekStartInput(initialWeekStart);
    setFSucursal("all");
    setQ("");
  };

  const filtrosActivos =
    (weekStartInput !== initialWeekStart ? 1 : 0) +
    (fSucursal !== "all" ? 1 : 0) +
    (q.trim() ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Resumen ejecutivo</h1>
          <p className="text-xs text-muted-foreground">
            Semana a revisar: {format(weekStart, "dd/MM")} al {format(weekEnd, "dd/MM")} · Realizado:{" "}
            {format(previousWeekStart, "dd/MM")} al {format(previousWeekEnd, "dd/MM")}
          </p>
        </div>
        <Badge variant="outline" className="w-fit text-[11px]">
          Facturacion desde importacion general, no desde OS
        </Badge>
      </div>

      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Cliente, trabajo o factura..." }}
        activeCount={filtrosActivos}
        onClear={limpiar}
        meta={`${factSemana.length} comprobantes · ${jornadasProgramadasSemana.length} jornadas semana`}
      >
        <FilterDate label="Semana" value={weekStartInput} onChange={setWeekStartInput} width="w-[150px]" />
        <FilterSelect
          label="Sucursal"
          value={fSucursal}
          onChange={setFSucursal}
          placeholder="Sucursal"
          width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...SUCURSALES.map((s) => ({ value: s, label: s }))]}
        />
      </FiltersBar>

      <section className="grid gap-3 xl:grid-cols-[1.05fr_1.05fr_1.2fr]">
        <Panel
          title="1. Realizado semana anterior"
          subtitle="Lectura rapida de cierre operativo."
          icon={CheckCircle2}
        >
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Jornadas realizadas" value={jornadasRealizadasPrev.length} loading={loading} tone="good" />
            <Metric label="Trabajos completados" value={trabajosCompletadosPrev.length} loading={loading} />
            <Metric label="Horas cargadas" value={`${horasPrev.toFixed(1)} hs`} loading={loading} />
            <Metric label="Sin horas" value={sinHorasPrev} loading={loading} tone={sinHorasPrev ? "warn" : "good"} />
          </div>
          <ListBlock
            empty="Sin jornadas realizadas en la semana anterior."
            rows={jornadasRealizadasPrev.slice(0, 5).map((jornada) => {
              const servicio = servicioById.get(jornada.servicio_id);
              const cliente = servicio?.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre : null;
              return {
                title: cliente ?? "Sin cliente",
                detail: `${format(parseISO(jornada.fecha), "dd/MM")} · ${servicio?.sucursal ?? "-"} · ${jornada.horas_trabajadas ?? 0} hs`,
              };
            })}
          />
        </Panel>

        <Panel
          title="2. Programado esta semana"
          subtitle="Carga visible para anticipar bloqueos."
          icon={CalendarDays}
        >
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Jornadas pendientes" value={jornadasProgramadasSemana.length} loading={loading} />
            <Metric label="Tecnicos con carga" value={cargaTecnicos.length} loading={loading} />
            <Metric label="Pausados" value={trabajosPausados.length} loading={loading} tone={trabajosPausados.length ? "warn" : "good"} />
            <Metric label="+7d sin cierre" value={fueraTolerancia.length} loading={loading} tone={fueraTolerancia.length ? "bad" : "good"} />
          </div>
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-semibold">Carga por tecnico</div>
            {cargaTecnicos.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">Sin jornadas programadas.</div>
            ) : (
              cargaTecnicos.map((row) => (
                <div key={row.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                  <span className="truncate text-xs font-medium">{row.nombre}</span>
                  <Badge variant="secondary" className="tabular-nums">{row.count}</Badge>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel
          title="3. Facturacion semana"
          subtitle="Fuente: tabla facturacion importada."
          icon={DollarSign}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total semana</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{loading ? "..." : money(totalSemana)}</div>
              <div className={cn("mt-1 text-xs", trendSemana != null && trendSemana < 0 ? "text-destructive" : "text-muted-foreground")}>
                {trendLabel(trendSemana)}
              </div>
            </div>
            <div className="min-w-[120px] rounded-md border bg-muted/30 px-3 py-2 text-right">
              <div className="text-[10px] uppercase text-muted-foreground">Mes</div>
              <div className="text-lg font-semibold tabular-nums">{money(totalMes)}</div>
              <div className="text-[11px] text-muted-foreground">{trendLabel(trendMes)}</div>
            </div>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={factBars} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {factBars.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Comparativo por sucursal</h2>
              <p className="text-xs text-muted-foreground">Semana, mes y variacion semanal.</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[1fr_96px_96px_72px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Sucursal</div>
              <div className="text-right">Semana</div>
              <div className="text-right">Mes</div>
              <div className="text-right">Var.</div>
            </div>
            {factPorSucursal.map((row) => (
              <button
                key={row.sucursal}
                onClick={() => setFSucursal(row.sucursal)}
                className="grid w-full grid-cols-[1fr_96px_96px_72px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
              >
                <div className="truncate font-medium">{row.sucursal}</div>
                <div className="text-right tabular-nums">{money(row.semana)}</div>
                <div className="text-right tabular-nums">{money(row.mes)}</div>
                <div className={cn("text-right tabular-nums", row.variacion != null && row.variacion < 0 && "text-destructive")}>
                  {row.variacion == null ? "-" : `${row.variacion > 0 ? "+" : ""}${row.variacion}%`}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Clientes destacados</h2>
            <p className="text-xs text-muted-foreground">Mayor facturacion de la semana filtrada.</p>
          </div>
          <div className="space-y-2">
            {topClientes.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">Sin facturacion en el periodo.</div>
            ) : (
              topClientes.map((row) => (
                <button
                  key={row.nombre}
                  onClick={() => setQ(row.nombre)}
                  className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="truncate text-xs font-semibold">{compactName(row.nombre)}</div>
                    <div className="text-xs font-semibold tabular-nums">{money(row.total)}</div>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Servicio {money(row.servicio)} · Repuesto {money(row.repuesto)}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className="p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Alertas CEO</h2>
            <p className="text-xs text-muted-foreground">Solo desvios que ameritan decision.</p>
          </div>
          <div className="space-y-2">
            {alertas.length === 0 ? (
              <div className="rounded-md border bg-emerald-500/5 px-3 py-6 text-center text-xs text-emerald-700">Sin alertas criticas para el filtro actual.</div>
            ) : (
              alertas.map((alerta) => (
                <button
                  key={alerta.title}
                  onClick={() => navigate(alerta.to)}
                  className="flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent"
                >
                  <span className={cn("mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", toneClasses[alerta.tone])}>
                    {alerta.tone === "bad" ? <AlertTriangle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{alerta.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{alerta.detail}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Lectura recomendada</h2>
            <p className="text-xs text-muted-foreground">Orden sugerido para reunion de 20 minutos.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MeetingStep minutes="5 min" title="Cierre" text="Validar trabajos y jornadas realizadas la semana anterior." />
            <MeetingStep minutes="10 min" title="Plan" text="Revisar carga semanal, pausados y atrasos antes de ejecutar." />
            <MeetingStep minutes="5 min" title="Venta" text="Comparar facturacion semanal y conceptos principales." />
          </div>
        </Card>
      </section>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Metric({ label, value, loading, tone = "neutral" }: { label: string; value: React.ReactNode; loading: boolean; tone?: Tone }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", tone === "bad" && "border-destructive/30 bg-destructive/5", tone === "warn" && "border-amber-300 bg-amber-50/60")}>
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{loading ? <span className="inline-block h-6 w-14 animate-pulse rounded bg-muted" /> : value}</div>
    </div>
  );
}

function ListBlock({ rows, empty }: { rows: { title: string; detail: string }[]; empty: string }) {
  return (
    <div className="rounded-md border">
      {rows.length === 0 ? (
        <div className="px-3 py-5 text-center text-xs text-muted-foreground">{empty}</div>
      ) : (
        rows.map((row, index) => (
          <div key={`${row.title}-${index}`} className="border-b px-3 py-2 last:border-b-0">
            <div className="truncate text-xs font-semibold">{row.title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{row.detail}</div>
          </div>
        ))
      )}
    </div>
  );
}

function MeetingStep({ minutes, title, text }: { minutes: string; title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <Badge variant="secondary" className="mb-2 text-[10px]">{minutes}</Badge>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-snug text-muted-foreground">{text}</div>
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-primary/10 text-primary",
  good: "bg-emerald-500/10 text-emerald-700",
  warn: "bg-amber-500/10 text-amber-700",
  bad: "bg-destructive/10 text-destructive",
};
