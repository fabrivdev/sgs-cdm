import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PhoneCall,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Wrench,
} from "lucide-react";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { type Estado, type Marca, type Sucursal } from "@/lib/constants";
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

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
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

const money = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
    notation: value >= 1_000_000_000 ? "compact" : "standard",
  }).format(value);

const shortName = (name: string) => name.trim().split(/\s+/).slice(0, 2).join(" ");

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
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [parqueKpi, setParqueKpi] = useState<ParqueKpi | null>(null);
  const [facturacion, setFacturacion] = useState<FactResumen[]>([]);
  const [loading, setLoading] = useState(true);

  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), []);
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), []);
  const monthStart = useMemo(() => startOfMonth(today), []);
  const monthEnd = useMemo(() => endOfMonth(today), []);
  const prevMonthStart = useMemo(() => startOfMonth(subMonths(today, 1)), []);
  const prevMonthEnd = useMemo(() => endOfMonth(subMonths(today, 1)), []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [serviciosRows, jornadasRows, profilesRows, clientesRows, rolesRes, parqueRes, factRes] =
          await Promise.all([
            cargarTodo<Servicio>(
              supabase
                .from("servicios")
                .select(
                  "id, fecha_programada, tecnico_responsable_id, auxiliares, sucursal, marca, estado, horas_trabajadas, cliente_id, trabajo_descripcion",
                ),
            ),
            cargarTodo<Jornada>(
              supabase
                .from("servicio_jornadas")
                .select("id, servicio_id, fecha, estado, horas_trabajadas, tecnico_responsable_id, auxiliares")
                .order("fecha", { ascending: true }),
            ),
            cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal, activo")),
            cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal")),
            supabase.from("user_roles").select("user_id, role").in("role", ["admin", "cabecilla"]),
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
        setJornadas(jornadasRows);
        setProfiles(profilesRows);
        setClientes(clientesRows);
        setAdminIds(new Set((rolesRes.data ?? []).map((row: { user_id: string }) => row.user_id)));
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

  const servicioById = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const tecnicos = useMemo(
    () => profiles.filter((profile) => profile.activo && !adminIds.has(profile.id)),
    [profiles, adminIds],
  );

  const jornadasSemana = useMemo(
    () =>
      jornadas.filter((jornada) =>
        isWithinInterval(parseISO(jornada.fecha), { start: weekStart, end: weekEnd }),
      ),
    [jornadas, weekEnd, weekStart],
  );

  const jornadasMes = useMemo(
    () =>
      jornadas.filter((jornada) =>
        isWithinInterval(parseISO(jornada.fecha), { start: monthStart, end: monthEnd }),
      ),
    [jornadas, monthEnd, monthStart],
  );

  const trabajosAbiertos = servicios.filter((servicio) => servicio.estado !== "Completado");
  const jornadasPendientes = jornadas.filter((jornada) => jornada.estado === "Pendiente");
  const vencidasCierre = jornadasPendientes.filter((jornada) => jornada.fecha < todayStr);
  const vencidasCriticas = vencidasCierre.filter(
    (jornada) => differenceInCalendarDays(today, parseISO(jornada.fecha)) > 7,
  );
  const realizadasMes = jornadasMes.filter((jornada) => jornada.estado === "Completado").length;
  const cierreMes = jornadasMes.length ? Math.round((realizadasMes / jornadasMes.length) * 100) : 0;
  const programadasSemana = jornadasSemana.filter((jornada) => jornada.estado === "Pendiente").length;
  const realizadasSemana = jornadasSemana.filter((jornada) => jornada.estado === "Completado").length;
  const horasMes = jornadasMes.reduce((acc, jornada) => acc + (Number(jornada.horas_trabajadas) || 0), 0);

  const factActual = facturacion.reduce((acc, row) => acc + Number(row.fact_actual || 0), 0);
  const factPrev = facturacion.reduce((acc, row) => acc + Number(row.fact_prev || 0), 0);
  const factVar = factPrev > 0 ? Math.round(((factActual - factPrev) / factPrev) * 100) : null;

  const totalClientesParque = parqueKpi?.total_clientes ?? 0;
  const pctServicioAnio =
    totalClientesParque > 0 ? Math.round(((parqueKpi?.con_servicio_anio ?? 0) / totalClientesParque) * 100) : 0;
  const pctContactadosMes =
    totalClientesParque > 0 ? Math.round(((parqueKpi?.contactados_mes ?? 0) / totalClientesParque) * 100) : 0;

  const agendaTecnicos = useMemo(() => {
    return tecnicos
      .map((tecnico) => {
        const semana = jornadasSemana.filter((jornada) => {
          const servicio = servicioById.get(jornada.servicio_id);
          const responsable = jornada.tecnico_responsable_id ?? servicio?.tecnico_responsable_id;
          const auxiliares = jornada.auxiliares?.length ? jornada.auxiliares : servicio?.auxiliares ?? [];
          return responsable === tecnico.id || auxiliares.includes(tecnico.id);
        });

        const pendientes = semana.filter((jornada) => jornada.estado === "Pendiente");
        const realizadas = semana.filter((jornada) => jornada.estado === "Completado");
        const proxima =
          pendientes.find((jornada) => jornada.fecha >= todayStr) ??
          pendientes[0] ??
          semana.find((jornada) => jornada.fecha >= todayStr) ??
          semana[0] ??
          null;
        const servicio = proxima ? servicioById.get(proxima.servicio_id) : null;
        const cliente = servicio?.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre : null;
        const vencidas = pendientes.filter((jornada) => jornada.fecha < todayStr).length;

        return {
          id: tecnico.id,
          nombre: tecnico.nombre,
          sucursal: tecnico.sucursal,
          total: semana.length,
          pendientes: pendientes.length,
          realizadas: realizadas.length,
          vencidas,
          proxima,
          cliente,
          descripcion: servicio?.trabajo_descripcion ?? null,
        };
      })
      .filter((tecnico) => tecnico.total > 0 || tecnico.pendientes > 0)
      .sort((a, b) => b.vencidas - a.vencidas || b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre))
      .slice(0, 8);
  }, [clienteById, jornadasSemana, servicioById, tecnicos]);

  const sucursales = useMemo(() => {
    const map = new Map<Sucursal, { sucursal: Sucursal; abiertas: number; semana: number; vencidas: number }>();
    for (const servicio of servicios) {
      const current = map.get(servicio.sucursal) ?? { sucursal: servicio.sucursal, abiertas: 0, semana: 0, vencidas: 0 };
      if (servicio.estado !== "Completado") current.abiertas += 1;
      map.set(servicio.sucursal, current);
    }

    for (const jornada of jornadasSemana) {
      const servicio = servicioById.get(jornada.servicio_id);
      if (!servicio) continue;
      const current = map.get(servicio.sucursal) ?? { sucursal: servicio.sucursal, abiertas: 0, semana: 0, vencidas: 0 };
      current.semana += 1;
      if (jornada.estado === "Pendiente" && jornada.fecha < todayStr) current.vencidas += 1;
      map.set(servicio.sucursal, current);
    }

    return [...map.values()].sort((a, b) => b.vencidas - a.vencidas || b.abiertas - a.abiertas).slice(0, 6);
  }, [jornadasSemana, servicioById, servicios]);

  const riesgos = useMemo(() => {
    const items = vencidasCriticas
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(0, 5)
      .map((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        const cliente = servicio?.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre : null;
        const responsableId = jornada.tecnico_responsable_id ?? servicio?.tecnico_responsable_id ?? null;
        return {
          id: jornada.id,
          fecha: jornada.fecha,
          dias: differenceInCalendarDays(today, parseISO(jornada.fecha)),
          cliente: cliente ?? "Sin cliente",
          responsable: responsableId ? profileById.get(responsableId)?.nombre ?? "Sin asignar" : "Sin asignar",
          descripcion: servicio?.trabajo_descripcion ?? "Jornada pendiente de cierre",
        };
      });

    return items;
  }, [clienteById, profileById, servicioById, vencidasCriticas]);

  return (
    <div className="container max-w-[1440px] space-y-4 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Dashboard ejecutivo</h1>
          <p className="text-xs text-muted-foreground">
            Semana {format(weekStart, "dd/MM")} al {format(weekEnd, "dd/MM")} · Operación, equipo y parque.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Planificador
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/trabajos")}>
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Trabajos
          </Button>
          <Button size="sm" onClick={() => navigate("/parque-clientes")}>
            <Wrench className="mr-1.5 h-4 w-4" />
            Parque
          </Button>
        </div>
      </div>

      {vencidasCriticas.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              <span className="font-semibold">{vencidasCriticas.length}</span> jornada
              {vencidasCriticas.length === 1 ? "" : "s"} superan los 7 dias sin cierre.
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/")}>
            Revisar pendientes <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ExecutiveKpi
          icon={ClipboardList}
          label="Trabajos abiertos"
          value={trabajosAbiertos.length}
          detail={`${programadasSemana} jornadas pendientes esta semana`}
          loading={loading}
        />
        <ExecutiveKpi
          icon={CheckCircle2}
          label="Cierre del mes"
          value={`${cierreMes}%`}
          detail={`${realizadasMes}/${jornadasMes.length} jornadas cerradas · ${horasMes.toFixed(1)} hs`}
          tone={cierreMes >= 70 ? "good" : cierreMes >= 40 ? "warn" : "bad"}
          loading={loading}
        />
        <ExecutiveKpi
          icon={Clock3}
          label="Pendientes de cierre"
          value={vencidasCierre.length}
          detail={`${vencidasCriticas.length} fuera de tolerancia +7d`}
          tone={vencidasCriticas.length > 0 ? "bad" : vencidasCierre.length > 0 ? "warn" : "good"}
          loading={loading}
        />
        <ExecutiveKpi
          icon={PhoneCall}
          label="Clientes sin contacto +60d"
          value={parqueKpi?.sin_contacto_60d ?? 0}
          detail={`${pctContactadosMes}% contactados este mes`}
          tone={(parqueKpi?.sin_contacto_60d ?? 0) > 0 ? "warn" : "good"}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Que hara cada tecnico esta semana</h2>
              <p className="text-xs text-muted-foreground">
                Prioriza pendientes, vencidas y siguiente visita visible.
              </p>
            </div>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/calendario")}>
              Calendario <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
            ) : agendaTecnicos.length === 0 ? (
              <div className="col-span-full rounded-md border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
                No hay jornadas asignadas para esta semana.
              </div>
            ) : (
              agendaTecnicos.map((tecnico) => <TecnicoSemanaCard key={tecnico.id} tecnico={tecnico} />)
            )}
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Parque y facturacion</h2>
            <p className="text-xs text-muted-foreground">Senales comerciales sin abrir el detalle.</p>
          </div>

          <div className="space-y-3">
            <MetricLine label="Maquinas activas" value={(parqueKpi?.total_maquinas ?? 0).toLocaleString()} />
            <MetricLine label="Clientes con servicio ultimo anio" value={`${pctServicioAnio}%`} />
            <MetricLine
              label="Facturacion mes actual"
              value={`$${money(factActual)}`}
              helper={factVar == null ? "sin base previa" : `${factVar > 0 ? "+" : ""}${factVar}% vs mes anterior`}
              trend={factVar}
            />

            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cobertura del parque</span>
                <span className="font-semibold">{pctServicioAnio}%</span>
              </div>
              <Progress value={pctServicioAnio} className="h-2" />
              <div className="mt-2 text-[11px] text-muted-foreground">
                {parqueKpi?.con_servicio_anio ?? 0} de {totalClientesParque} clientes del parque tuvieron servicio en el ultimo anio.
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => navigate("/parque-clientes")}>
              Ver analisis de clientes
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Estado por sucursal</h2>
              <p className="text-xs text-muted-foreground">Carga abierta y jornadas de la semana.</p>
            </div>
          </div>

          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <SkeletonLine key={index} />)
            ) : sucursales.length === 0 ? (
              <div className="rounded-md border bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
                Sin datos por sucursal.
              </div>
            ) : (
              sucursales.map((sucursal) => (
                <div key={sucursal.sucursal} className="rounded-md border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{sucursal.sucursal}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {sucursal.semana} jornadas esta semana
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Badge variant="outline">{sucursal.abiertas} abiertas</Badge>
                      {sucursal.vencidas > 0 && <Badge variant="destructive">{sucursal.vencidas} venc.</Badge>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Riesgos que requieren mirada</h2>
              <p className="text-xs text-muted-foreground">Jornadas sin cierre fuera de tolerancia.</p>
            </div>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/trabajos")}>
              Trabajos <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <SkeletonLine key={index} />)
            ) : riesgos.length === 0 ? (
              <div className="rounded-md border bg-emerald-500/5 px-3 py-6 text-center text-xs text-emerald-700">
                No hay jornadas fuera de tolerancia.
              </div>
            ) : (
              riesgos.map((riesgo) => (
                <div key={riesgo.id} className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{riesgo.cliente}</div>
                      <div className="line-clamp-1 text-xs text-muted-foreground">{riesgo.descripcion}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {riesgo.responsable} · {format(parseISO(riesgo.fecha), "dd/MM/yyyy")}
                      </div>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {riesgo.dias}d
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ExecutiveKpi({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: "neutral" | "good" | "warn" | "bad";
  loading?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 bg-emerald-500/10"
      : tone === "warn"
        ? "text-amber-700 bg-amber-500/10"
        : tone === "bad"
          ? "text-destructive bg-destructive/10"
          : "text-primary bg-primary/10";

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" /> : value}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function TecnicoSemanaCard({
  tecnico,
}: {
  tecnico: {
    nombre: string;
    sucursal: Sucursal | null;
    total: number;
    pendientes: number;
    realizadas: number;
    vencidas: number;
    proxima: Jornada | null;
    cliente: string | null;
    descripcion: string | null;
  };
}) {
  const pct = tecnico.total ? Math.round((tecnico.realizadas / tecnico.total) * 100) : 0;
  const nextDate = tecnico.proxima ? parseISO(tecnico.proxima.fecha) : null;

  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{shortName(tecnico.nombre)}</div>
          <div className="truncate text-[11px] text-muted-foreground">{tecnico.sucursal ?? "Sin sucursal"}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          {tecnico.vencidas > 0 && <Badge variant="destructive">{tecnico.vencidas} venc.</Badge>}
          <Badge variant="outline">{tecnico.total} jorn.</Badge>
        </div>
      </div>

      <div className="mt-2 rounded-md bg-muted/40 px-2 py-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate font-medium">{tecnico.cliente ?? "Sin trabajo asignado"}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {nextDate ? format(nextDate, "dd/MM") : "--"}
          </span>
        </div>
        <div className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
          {tecnico.descripcion ?? "Sin detalle operativo"}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Progress value={pct} className="h-1.5" />
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{tecnico.realizadas} realizadas</span>
        <span>{tecnico.pendientes} pendientes</span>
      </div>
    </div>
  );
}

function MetricLine({
  label,
  value,
  helper,
  trend,
}: {
  label: string;
  value: string;
  helper?: string;
  trend?: number | null;
}) {
  const TrendIcon = trend == null ? null : trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          {helper && (
            <div className={cn("mt-1 flex items-center gap-1 text-[11px]", trend != null && trend < 0 ? "text-destructive" : "text-emerald-700")}>
              {TrendIcon && <TrendIcon className="h-3 w-3" />}
              {helper}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-12 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-2 animate-pulse rounded bg-muted" />
    </div>
  );
}

function SkeletonLine() {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-muted" />
    </div>
  );
}
