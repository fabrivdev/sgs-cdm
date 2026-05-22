import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DatabaseZap,
  PhoneCall,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
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

interface AlertItem {
  id: string;
  title: string;
  detail: string;
  tone: "bad" | "warn" | "good";
  action: string;
  to: string;
}

const PAGE = 1000;
const today = new Date();
const todayStr = format(today, "yyyy-MM-dd");

const fmtMoney = (value: number) =>
  new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
    notation: value >= 1_000_000_000 ? "compact" : "standard",
  }).format(value);

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
        const [serviciosRows, jornadasRows, profilesRows, clientesRows, parqueRes, factRes] =
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
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const trabajosAbiertos = servicios.filter((servicio) => servicio.estado !== "Completado");
  const trabajosSinResponsable = trabajosAbiertos.filter((servicio) => !servicio.tecnico_responsable_id).length;
  const trabajosSinCliente = trabajosAbiertos.filter((servicio) => !servicio.cliente_id).length;
  const jornadasPendientes = jornadas.filter((jornada) => jornada.estado === "Pendiente");
  const jornadasVencidas = jornadasPendientes.filter((jornada) => jornada.fecha < todayStr);
  const jornadasFueraTolerancia = jornadasVencidas.filter(
    (jornada) => differenceInCalendarDays(today, parseISO(jornada.fecha)) > 7,
  );
  const jornadasRealizadas = jornadas.filter((jornada) => jornada.estado === "Completado");
  const jornadasSinHoras = jornadasRealizadas.filter((jornada) => !Number(jornada.horas_trabajadas)).length;

  const totalClientesParque = parqueKpi?.total_clientes ?? 0;
  const pctServicioAnio =
    totalClientesParque > 0 ? Math.round(((parqueKpi?.con_servicio_anio ?? 0) / totalClientesParque) * 100) : 0;
  const pctContactadosMes =
    totalClientesParque > 0 ? Math.round(((parqueKpi?.contactados_mes ?? 0) / totalClientesParque) * 100) : 0;

  const factActual = facturacion.reduce((acc, row) => acc + Number(row.fact_actual || 0), 0);
  const factPrev = facturacion.reduce((acc, row) => acc + Number(row.fact_prev || 0), 0);
  const factVar = factPrev > 0 ? Math.round(((factActual - factPrev) / factPrev) * 100) : null;

  const mayoresCaidas = useMemo(
    () =>
      facturacion
        .map((row) => {
          const actual = Number(row.fact_actual || 0);
          const previo = Number(row.fact_prev || 0);
          const variacion = previo > 0 ? Math.round(((actual - previo) / previo) * 100) : null;
          return {
            clienteId: row.cliente_id,
            cliente: clienteById.get(row.cliente_id)?.nombre ?? "Cliente no identificado",
            actual,
            previo,
            variacion,
          };
        })
        .filter((row) => row.variacion != null && row.variacion <= -30 && row.previo > 0)
        .sort((a, b) => (a.variacion ?? 0) - (b.variacion ?? 0))
        .slice(0, 3),
    [clienteById, facturacion],
  );

  const sucursalMasAtrasada = useMemo(() => {
    const map = new Map<Sucursal, { sucursal: Sucursal; abiertas: number; vencidas: number }>();

    for (const servicio of trabajosAbiertos) {
      const actual = map.get(servicio.sucursal) ?? { sucursal: servicio.sucursal, abiertas: 0, vencidas: 0 };
      actual.abiertas += 1;
      map.set(servicio.sucursal, actual);
    }

    for (const jornada of jornadasFueraTolerancia) {
      const servicio = servicioById.get(jornada.servicio_id);
      if (!servicio) continue;
      const actual = map.get(servicio.sucursal) ?? { sucursal: servicio.sucursal, abiertas: 0, vencidas: 0 };
      actual.vencidas += 1;
      map.set(servicio.sucursal, actual);
    }

    return [...map.values()].sort((a, b) => b.vencidas - a.vencidas || b.abiertas - a.abiertas)[0] ?? null;
  }, [jornadasFueraTolerancia, servicioById, trabajosAbiertos]);

  const riesgos = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];

    if (jornadasFueraTolerancia.length > 0) {
      const oldest = jornadasFueraTolerancia.slice().sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const servicio = servicioById.get(oldest.servicio_id);
      const cliente = servicio?.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre : null;
      const responsableId = oldest.tecnico_responsable_id ?? servicio?.tecnico_responsable_id ?? null;
      const responsable = responsableId ? profileById.get(responsableId)?.nombre ?? "Sin asignar" : "Sin asignar";
      items.push({
        id: "jornadas-vencidas",
        title: `${jornadasFueraTolerancia.length} jornadas fuera de tolerancia`,
        detail: `${cliente ?? "Trabajo sin cliente"} · ${responsable} · ${differenceInCalendarDays(today, parseISO(oldest.fecha))} dias`,
        tone: "bad",
        action: "Ver planificador",
        to: "/",
      });
    }

    if (sucursalMasAtrasada && sucursalMasAtrasada.vencidas > 0) {
      items.push({
        id: "sucursal-atrasada",
        title: `${sucursalMasAtrasada.sucursal} concentra atrasos`,
        detail: `${sucursalMasAtrasada.vencidas} jornadas +7d · ${sucursalMasAtrasada.abiertas} trabajos abiertos`,
        tone: "warn",
        action: "Ver trabajos",
        to: "/trabajos",
      });
    }

    if ((parqueKpi?.sin_contacto_60d ?? 0) > 0) {
      items.push({
        id: "sin-contacto",
        title: `${parqueKpi?.sin_contacto_60d ?? 0} clientes sin contacto +60d`,
        detail: `Base instalada en riesgo comercial · ${pctContactadosMes}% contactados este mes`,
        tone: "warn",
        action: "Ver parque",
        to: "/parque-clientes",
      });
    }

    if (factVar != null && factVar <= -15) {
      items.push({
        id: "facturacion-caida",
        title: `Facturacion baja ${Math.abs(factVar)}%`,
        detail: `$${fmtMoney(factActual)} este mes vs $${fmtMoney(factPrev)} anterior`,
        tone: "bad",
        action: "Ver parque",
        to: "/parque-clientes",
      });
    }

    if (jornadasSinHoras > 0 || trabajosSinResponsable > 0) {
      items.push({
        id: "datos-operativos",
        title: "Datos operativos incompletos",
        detail: `${jornadasSinHoras} jornadas sin horas · ${trabajosSinResponsable} trabajos sin responsable`,
        tone: "warn",
        action: "Corregir",
        to: "/trabajos",
      });
    }

    if (items.length === 0) {
      items.push({
        id: "sin-riesgos",
        title: "Sin alertas criticas visibles",
        detail: "Operacion, parque y datos sin desvio fuerte en este corte.",
        tone: "good",
        action: "Ver trabajos",
        to: "/trabajos",
      });
    }

    return items.slice(0, 5);
  }, [
    clienteById,
    factActual,
    factPrev,
    factVar,
    jornadasFueraTolerancia,
    jornadasSinHoras,
    parqueKpi?.sin_contacto_60d,
    pctContactadosMes,
    profileById,
    servicioById,
    sucursalMasAtrasada,
    trabajosSinResponsable,
  ]);

  const oportunidades = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];

    if (pctServicioAnio < 70) {
      items.push({
        id: "cobertura-parque",
        title: `Cobertura de parque en ${pctServicioAnio}%`,
        detail: `${parqueKpi?.con_servicio_anio ?? 0} de ${totalClientesParque} clientes con servicio ultimo anio`,
        tone: pctServicioAnio < 50 ? "bad" : "warn",
        action: "Abrir parque",
        to: "/parque-clientes",
      });
    }

    for (const cliente of mayoresCaidas) {
      items.push({
        id: `caida-${cliente.clienteId}`,
        title: `${cliente.cliente}: ${cliente.variacion}%`,
        detail: `Facturacion cae de $${fmtMoney(cliente.previo)} a $${fmtMoney(cliente.actual)}`,
        tone: "warn",
        action: "Analizar",
        to: "/parque-clientes",
      });
    }

    if (factVar != null && factVar > 15) {
      items.push({
        id: "facturacion-crece",
        title: `Facturacion crece ${factVar}%`,
        detail: `Conviene revisar que clientes y rubros explican el salto.`,
        tone: "good",
        action: "Ver detalle",
        to: "/parque-clientes",
      });
    }

    if (items.length === 0) {
      items.push({
        id: "sin-oportunidades",
        title: "Sin oportunidad critica detectada",
        detail: "La facturacion y cobertura no muestran desvio fuerte en este corte.",
        tone: "good",
        action: "Ver parque",
        to: "/parque-clientes",
      });
    }

    return items.slice(0, 5);
  }, [factVar, mayoresCaidas, parqueKpi?.con_servicio_anio, pctServicioAnio, totalClientesParque]);

  const dataQuality = [
    {
      label: "Jornadas sin horas",
      value: jornadasSinHoras,
      tone: jornadasSinHoras > 0 ? "warn" : "good",
    },
    {
      label: "Trabajos sin responsable",
      value: trabajosSinResponsable,
      tone: trabajosSinResponsable > 0 ? "warn" : "good",
    },
    {
      label: "Trabajos sin cliente",
      value: trabajosSinCliente,
      tone: trabajosSinCliente > 0 ? "warn" : "good",
    },
  ] as const;

  return (
    <div className="container max-w-[1280px] space-y-3 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Dashboard CEO</h1>
          <p className="text-xs text-muted-foreground">
            Senales de gestion · {format(monthStart, "dd/MM")} al {format(monthEnd, "dd/MM")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/trabajos")}>
            Trabajos
          </Button>
          <Button size="sm" onClick={() => navigate("/parque-clientes")}>
            Parque
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SignalCard
          icon={ClipboardList}
          label="Backlog operativo"
          value={trabajosAbiertos.length}
          detail={`${jornadasFueraTolerancia.length} fuera de tolerancia`}
          tone={jornadasFueraTolerancia.length > 0 ? "bad" : trabajosAbiertos.length > 0 ? "warn" : "good"}
          loading={loading}
        />
        <SignalCard
          icon={Clock3}
          label="Disciplina de cierre"
          value={jornadasVencidas.length}
          detail={`${jornadasSinHoras} realizadas sin horas`}
          tone={jornadasVencidas.length > 0 ? "warn" : "good"}
          loading={loading}
        />
        <SignalCard
          icon={Wrench}
          label="Cobertura parque"
          value={`${pctServicioAnio}%`}
          detail={`${parqueKpi?.total_maquinas ?? 0} maquinas activas`}
          tone={pctServicioAnio >= 70 ? "good" : pctServicioAnio >= 50 ? "warn" : "bad"}
          loading={loading}
        />
        <SignalCard
          icon={factVar != null && factVar < 0 ? TrendingDown : TrendingUp}
          label="Facturacion posventa"
          value={`$${fmtMoney(factActual)}`}
          detail={factVar == null ? "sin base previa" : `${factVar > 0 ? "+" : ""}${factVar}% vs mes anterior`}
          tone={factVar == null ? "neutral" : factVar >= 0 ? "good" : factVar <= -15 ? "bad" : "warn"}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <DecisionPanel
          title="Riesgos prioritarios"
          subtitle="Lo que puede afectar servicio, reputacion o control."
          items={riesgos}
          loading={loading}
          onNavigate={navigate}
        />
        <DecisionPanel
          title="Oportunidades comerciales"
          subtitle="Donde puede haber venta perdida, cobertura baja o cliente enfriado."
          items={oportunidades}
          loading={loading}
          onNavigate={navigate}
        />
      </div>

      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">Calidad de datos</div>
              <div className="text-xs text-muted-foreground">Confianza minima para decidir con estos numeros.</div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 md:min-w-[560px]">
            {dataQuality.map((item) => (
              <QualityPill key={item.label} label={item.label} value={item.value} tone={item.tone} loading={loading} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function SignalCard({
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

function DecisionPanel({
  title,
  subtitle,
  items,
  loading,
  onNavigate,
}: {
  title: string;
  subtitle: string;
  items: AlertItem[];
  loading: boolean;
  onNavigate: (to: string) => void;
}) {
  return (
    <Card className="p-3">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-2">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <SkeletonAlert key={index} />)
          : items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border bg-background px-3 py-2">
                <div className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClasses[item.tone])} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{item.detail}</div>
                </div>
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => onNavigate(item.to)}>
                  {item.action}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
      </div>
    </Card>
  );
}

function QualityPill({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone: "good" | "warn";
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      {loading ? (
        <span className="h-5 w-8 animate-pulse rounded bg-muted" />
      ) : (
        <Badge variant={tone === "good" ? "outline" : "secondary"} className={cn("shrink-0", tone === "good" && "border-emerald-500/40 text-emerald-700")}>
          {value}
        </Badge>
      )}
    </div>
  );
}

function SkeletonAlert() {
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

const dotClasses = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-destructive",
};
