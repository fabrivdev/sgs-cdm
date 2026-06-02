import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
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
  total_venta: number;
  grupo: string | null;
  grupo_fx: string | null;
  cod_factura: string;
}

type Concepto = "Repuestos" | "Servicio" | "Kilometraje" | "Otros";
type Tone = "neutral" | "good" | "warn" | "bad";

interface WeekRow {
  key: string;
  label: string;
  start: Date;
  end: Date;
  total: number;
  repuestos: number;
  servicio: number;
  kilometraje: number;
  otros: number;
  facturas: number;
  clientes: number;
  variacion: number | null;
  rows: Facturacion[];
}

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

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function inRange(date: string, start: Date, end: Date) {
  return isWithinInterval(parseISO(date), { start, end });
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

function concept(row: Facturacion): Concepto {
  const group = `${row.grupo_fx ?? ""} ${row.grupo ?? ""}`.toLowerCase();
  if (row.tipo === "Repuesto" || group.includes("repuesto")) return "Repuestos";
  if (group.includes("kilomet")) return "Kilometraje";
  if (group.includes("mano de obra")) return "Servicio";
  return "Otros";
}

function total(rows: Facturacion[]) {
  return rows.reduce((acc, row) => acc + Number(row.total_venta || 0), 0);
}

function compact(value: string, max = 34) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
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
  const [selectedWeekKey, setSelectedWeekKey] = useState(initialWeekStart);
  const [fSucursal, setFSucursal] = useState("all");
  const [q, setQ] = useState("");

  const weekStart = useMemo(() => startOfWeek(parseISO(weekStartInput), { weekStartsOn: 1 }), [weekStartInput]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const previousWeekStart = useMemo(() => subWeeks(weekStart, 1), [weekStart]);
  const previousWeekEnd = useMemo(() => endOfWeek(previousWeekStart, { weekStartsOn: 1 }), [previousWeekStart]);
  const monthStart = useMemo(() => startOfMonth(weekStart), [weekStart]);
  const monthEnd = useMemo(() => endOfMonth(weekStart), [weekStart]);
  const previousMonthStart = useMemo(() => startOfMonth(subMonths(weekStart, 1)), [weekStart]);
  const previousMonthEnd = useMemo(() => endOfMonth(subMonths(weekStart, 1)), [weekStart]);
  const firstComparisonWeek = useMemo(() => subWeeks(weekStart, 7), [weekStart]);
  const queryStart = useMemo(() => {
    const min = Math.min(firstComparisonWeek.getTime(), previousMonthStart.getTime());
    return new Date(min);
  }, [firstComparisonWeek, previousMonthStart]);
  const queryEnd = useMemo(() => {
    const max = Math.max(weekEnd.getTime(), monthEnd.getTime());
    return new Date(max);
  }, [monthEnd, weekEnd]);

  useEffect(() => {
    setSelectedWeekKey(dateKey(weekStart));
  }, [weekStart]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        let factQuery = supabase
          .from("facturacion")
          .select("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, grupo, grupo_fx, cod_factura")
          .gte("fecha", dateKey(queryStart))
          .lte("fecha", dateKey(queryEnd))
          .order("fecha", { ascending: false });
        if (fSucursal !== "all") factQuery = factQuery.eq("sucursal", fSucursal as Sucursal);

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
              .gte("fecha", dateKey(subWeeks(previousWeekStart, 8)))
              .lte("fecha", dateKey(weekEnd))
              .order("fecha", { ascending: true }),
          ),
          cargarTodo<Trabajo>(
            supabase
              .from("trabajos")
              .select("id, codigo, estado_general, legacy_servicio_id, sucursal, cliente_id, descripcion_problema, motivo_bloqueo"),
          ),
          cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal")),
          cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal")),
          cargarTodo<Facturacion>(factQuery),
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
  }, [fSucursal, previousWeekStart, queryEnd, queryStart, weekEnd]);

  const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);

  const query = q.trim().toLowerCase();
  const factFiltered = useMemo(
    () =>
      facturacion.filter((row) => {
        if (!query) return true;
        const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
        return (
          cliente.toLowerCase().includes(query) ||
          row.cod_factura.toLowerCase().includes(query) ||
          (row.grupo_fx ?? "").toLowerCase().includes(query) ||
          (row.grupo ?? "").toLowerCase().includes(query)
        );
      }),
    [clienteById, facturacion, query],
  );

  const scopedServicio = (servicio: Servicio | undefined | null) => {
    if (!servicio) return false;
    if (fSucursal !== "all" && servicio.sucursal !== fSucursal) return false;
    if (!query) return true;
    const cliente = servicio.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre ?? "" : "";
    return cliente.toLowerCase().includes(query) || servicio.trabajo_descripcion.toLowerCase().includes(query);
  };

  const scopedTrabajo = (trabajo: Trabajo) => {
    if (fSucursal !== "all" && trabajo.sucursal !== fSucursal) return false;
    if (!query) return true;
    const cliente = trabajo.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre ?? "" : "";
    return (
      cliente.toLowerCase().includes(query) ||
      trabajo.descripcion_problema.toLowerCase().includes(query) ||
      (trabajo.codigo ?? "").toLowerCase().includes(query)
    );
  };

  const weeklyRows = useMemo<WeekRow[]>(() => {
    const weeks = Array.from({ length: 8 }, (_, index) => subWeeks(weekStart, 7 - index));
    const rows = weeks.map((start) => {
      const end = endOfWeek(start, { weekStartsOn: 1 });
      const weekFacts = factFiltered.filter((row) => inRange(row.fecha, start, end));
      const byConcept = {
        Repuestos: 0,
        Servicio: 0,
        Kilometraje: 0,
        Otros: 0,
      };

      for (const row of weekFacts) byConcept[concept(row)] += Number(row.total_venta || 0);

      const clients = new Set(weekFacts.map((row) => row.cliente_id ?? row.entidad_nombre));
      const invoices = new Set(weekFacts.map((row) => row.cod_factura));
      return {
        key: dateKey(start),
        label: `${format(start, "dd/MM")} - ${format(end, "dd/MM")}`,
        start,
        end,
        total: total(weekFacts),
        repuestos: byConcept.Repuestos,
        servicio: byConcept.Servicio,
        kilometraje: byConcept.Kilometraje,
        otros: byConcept.Otros,
        facturas: invoices.size,
        clientes: clients.size,
        variacion: null,
        rows: weekFacts,
      };
    });

    return rows.map((row, index) => ({
      ...row,
      variacion: index === 0 ? null : pct(row.total, rows[index - 1].total),
    }));
  }, [factFiltered, weekStart]);

  const selectedWeek = weeklyRows.find((row) => row.key === selectedWeekKey) ?? weeklyRows[weeklyRows.length - 1];
  const selectedFacts = selectedWeek?.rows ?? [];

  const factMes = useMemo(() => factFiltered.filter((row) => inRange(row.fecha, monthStart, monthEnd)), [factFiltered, monthEnd, monthStart]);
  const factMesPrev = useMemo(() => factFiltered.filter((row) => inRange(row.fecha, previousMonthStart, previousMonthEnd)), [factFiltered, previousMonthEnd, previousMonthStart]);
  const totalMes = total(factMes);
  const trendMes = pct(totalMes, total(factMesPrev));

  const factBySucursal = useMemo(() => {
    return SUCURSALES.map((sucursal) => {
      const rows = selectedFacts.filter((row) => row.sucursal === sucursal);
      return { sucursal, total: total(rows), facturas: new Set(rows.map((row) => row.cod_factura)).size };
    }).sort((a, b) => b.total - a.total);
  }, [selectedFacts]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; facturas: number; rows: Facturacion[] }>();
    for (const row of selectedFacts) {
      const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      const current = map.get(nombre) ?? { nombre, total: 0, facturas: 0, rows: [] };
      current.total += Number(row.total_venta || 0);
      current.rows.push(row);
      current.facturas = new Set(current.rows.map((item) => item.cod_factura)).size;
      map.set(nombre, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [clienteById, selectedFacts]);

  const jornadasRealizadasPrev = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Completado" && inRange(jornada.fecha, previousWeekStart, previousWeekEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursal, jornadas, previousWeekEnd, previousWeekStart, query, servicioById],
  );

  const jornadasProgramadas = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, weekStart, weekEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursal, jornadas, query, servicioById, weekEnd, weekStart],
  );

  const jornadasPendientesCierre = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && jornada.fecha < todayStr && scopedServicio(servicio);
      }),
    [clienteById, fSucursal, jornadas, query, servicioById],
  );

  const trabajosScope = useMemo(() => trabajos.filter(scopedTrabajo), [clienteById, fSucursal, query, trabajos]);
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

  const trabajosPausados = trabajosScope.filter((trabajo) => {
    const estado = estadoTrabajoDesdeJornadas(jornadasByTrabajo.get(trabajo.id) ?? [], trabajo.estado_general);
    return estado === "pausado";
  });

  const cargaTecnicos = useMemo(() => {
    const map = new Map<string, number>();
    for (const jornada of jornadasProgramadas) {
      const ids = [jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])].filter((id): id is string => !!id);
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [jornadasProgramadas, profileById]);

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > 7);
  const selectedTrend = selectedWeek?.variacion ?? null;

  const alertas = [
    fueraTolerancia.length > 0
      ? { tone: "bad" as Tone, title: `${fueraTolerancia.length} jornadas +7d sin cierre`, detail: "Afecta estados y productividad.", to: "/?overdue=7" }
      : null,
    trabajosPausados.length > 0
      ? { tone: "warn" as Tone, title: `${trabajosPausados.length} trabajos pausados`, detail: "Revisar repuestos, cliente o aprobacion.", to: "/trabajos?estado=pausado" }
      : null,
    sinHorasPrev > 0
      ? { tone: "warn" as Tone, title: `${sinHorasPrev} jornadas realizadas sin horas`, detail: "Reporte semanal incompleto.", to: "/?estado=Completado&sin_horas=1" }
      : null,
    selectedTrend != null && selectedTrend < -20
      ? { tone: "bad" as Tone, title: `Facturacion cae ${Math.abs(selectedTrend)}%`, detail: `${money(selectedWeek.total)} en la semana seleccionada.`, to: "/parque-clientes" }
      : null,
  ].filter(Boolean) as Array<{ tone: Tone; title: string; detail: string; to: string }>;

  const limpiar = () => {
    setWeekStartInput(initialWeekStart);
    setSelectedWeekKey(initialWeekStart);
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
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard ejecutivo</h1>
          <p className="text-xs text-muted-foreground">
            Comparativo semanal, detalle de facturas y resumen operativo para reunion de direccion.
          </p>
        </div>
        <Badge variant="outline" className="w-fit text-[11px]">
          Facturacion desde importacion general, no desde OS
        </Badge>
      </div>

      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Cliente, factura o concepto..." }}
        activeCount={filtrosActivos}
        onClear={limpiar}
        meta={`${factFiltered.length} lineas facturacion cargadas en el rango`}
      >
        <FilterDate label="Semana base" value={weekStartInput} onChange={setWeekStartInput} width="w-[150px]" />
        <FilterSelect
          label="Sucursal"
          value={fSucursal}
          onChange={setFSucursal}
          placeholder="Sucursal"
          width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...SUCURSALES.map((s) => ({ value: s, label: s }))]}
        />
      </FiltersBar>

      <section className="grid gap-3 lg:grid-cols-[1.5fr_0.9fr]">
        <Card className="p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Facturacion por semana</h2>
              <p className="text-xs text-muted-foreground">Selecciona una semana para ver facturas, clientes y composicion.</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase text-muted-foreground">Mes seleccionado</div>
              <div className="text-lg font-semibold tabular-nums">{loading ? "..." : money(totalMes)}</div>
              <div className={cn("text-[11px]", trendMes != null && trendMes < 0 ? "text-destructive" : "text-muted-foreground")}>
                {trendMes == null ? "sin base previa" : `${trendMes > 0 ? "+" : ""}${trendMes}% vs mes anterior`}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[112px_108px_108px_108px_108px_92px_72px_72px_72px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <div>Semana</div>
                <div className="text-right">Total</div>
                <div className="text-right">Repuestos</div>
                <div className="text-right">Servicio</div>
                <div className="text-right">Km</div>
                <div className="text-right">Otros</div>
                <div className="text-right">Fact.</div>
                <div className="text-right">Clientes</div>
                <div className="text-right">Var.</div>
              </div>
              {weeklyRows.map((row) => {
                const active = row.key === selectedWeek?.key;
                return (
                  <button
                    key={row.key}
                    onClick={() => setSelectedWeekKey(row.key)}
                    className={cn(
                      "grid w-full grid-cols-[112px_108px_108px_108px_108px_92px_72px_72px_72px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent",
                      active && "bg-primary/5 outline outline-1 outline-primary/20",
                    )}
                  >
                    <div className="font-medium">{row.label}</div>
                    <div className="text-right font-semibold tabular-nums">{money(row.total)}</div>
                    <div className="text-right tabular-nums">{money(row.repuestos)}</div>
                    <div className="text-right tabular-nums">{money(row.servicio)}</div>
                    <div className="text-right tabular-nums">{money(row.kilometraje)}</div>
                    <div className="text-right tabular-nums">{money(row.otros)}</div>
                    <div className="text-right tabular-nums">{row.facturas}</div>
                    <div className="text-right tabular-nums">{row.clientes}</div>
                    <div className={cn("text-right tabular-nums", row.variacion != null && row.variacion < 0 && "text-destructive")}>
                      {row.variacion == null ? "-" : `${row.variacion > 0 ? "+" : ""}${row.variacion}%`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Semana seleccionada</h2>
            <p className="text-xs text-muted-foreground">{selectedWeek?.label ?? "-"} · detalle financiero.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Total" value={money(selectedWeek?.total ?? 0)} loading={loading} tone={selectedTrend != null && selectedTrend < -20 ? "bad" : "neutral"} />
            <Kpi label="Variacion" value={selectedTrend == null ? "-" : `${selectedTrend > 0 ? "+" : ""}${selectedTrend}%`} loading={loading} />
            <Kpi label="Facturas" value={selectedWeek?.facturas ?? 0} loading={loading} />
            <Kpi label="Clientes" value={selectedWeek?.clientes ?? 0} loading={loading} />
          </div>
          <div className="mt-3 space-y-1.5">
            <ConceptLine label="Repuestos" value={selectedWeek?.repuestos ?? 0} total={selectedWeek?.total ?? 0} />
            <ConceptLine label="Servicio" value={selectedWeek?.servicio ?? 0} total={selectedWeek?.total ?? 0} />
            <ConceptLine label="Kilometraje" value={selectedWeek?.kilometraje ?? 0} total={selectedWeek?.total ?? 0} />
            <ConceptLine label="Otros" value={selectedWeek?.otros ?? 0} total={selectedWeek?.total ?? 0} />
          </div>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Facturas de la semana</h2>
              <p className="text-xs text-muted-foreground">Detalle que explica la composicion del total seleccionado.</p>
            </div>
            <Badge variant="secondary" className="tabular-nums">{selectedFacts.length} lineas</Badge>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-md border">
            <div className="grid min-w-[860px] grid-cols-[96px_112px_1fr_120px_130px_112px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <div>Fecha</div>
              <div>Factura</div>
              <div>Cliente</div>
              <div>Concepto</div>
              <div>Sucursal</div>
              <div className="text-right">Importe</div>
            </div>
            {selectedFacts.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">Sin facturacion para esta semana.</div>
            ) : (
              selectedFacts.map((row, index) => {
                const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
                return (
                  <div key={`${row.cod_factura}-${index}`} className="grid min-w-[860px] grid-cols-[96px_112px_1fr_120px_130px_112px] items-center border-t px-3 py-2 text-xs">
                    <div className="tabular-nums">{format(parseISO(row.fecha), "dd/MM")}</div>
                    <div className="font-mono text-[11px]">{row.cod_factura}</div>
                    <div className="truncate font-medium">{cliente}</div>
                    <div>{concept(row)}</div>
                    <div>{row.sucursal ?? "-"}</div>
                    <div className="text-right font-semibold tabular-nums">{money(Number(row.total_venta || 0))}</div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Clientes y sucursales</h2>
            <p className="text-xs text-muted-foreground">Ranking de la semana seleccionada.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-xs font-semibold">Top clientes</div>
              {topClientes.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Sin datos.</div>
              ) : (
                topClientes.map((row) => (
                  <button key={row.nombre} onClick={() => setQ(row.nombre)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{compact(row.nombre)}</span>
                      <span className="text-[11px] text-muted-foreground">{row.facturas} factura{row.facturas !== 1 ? "s" : ""}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{money(row.total)}</span>
                  </button>
                ))
              )}
            </div>
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-xs font-semibold">Por sucursal</div>
              {factBySucursal.map((row) => (
                <button key={row.sucursal} onClick={() => setFSucursal(row.sucursal)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-accent">
                  <span>
                    <span className="block font-semibold">{row.sucursal}</span>
                    <span className="text-[11px] text-muted-foreground">{row.facturas} factura{row.facturas !== 1 ? "s" : ""}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{money(row.total)}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card className="p-3">
          <PanelTitle icon={CheckCircle2} title="Realizado semana anterior" subtitle={`${format(previousWeekStart, "dd/MM")} al ${format(previousWeekEnd, "dd/MM")}`} />
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Jornadas" value={jornadasRealizadasPrev.length} loading={loading} />
            <Kpi label="Horas" value={`${horasPrev.toFixed(1)} hs`} loading={loading} />
          </div>
          <div className="mt-2">
            <Kpi label="Sin horas cargadas" value={sinHorasPrev} loading={loading} tone={sinHorasPrev ? "warn" : "good"} />
          </div>
        </Card>

        <Card className="p-3">
          <PanelTitle icon={CalendarDays} title="Programado esta semana" subtitle={`${format(weekStart, "dd/MM")} al ${format(weekEnd, "dd/MM")}`} />
          <div className="grid grid-cols-2 gap-2">
            <Kpi label="Jornadas" value={jornadasProgramadas.length} loading={loading} />
            <Kpi label="Pausados" value={trabajosPausados.length} loading={loading} tone={trabajosPausados.length ? "warn" : "good"} />
          </div>
          <div className="mt-3 rounded-md border">
            {cargaTecnicos.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground">Sin carga por tecnico.</div>
            ) : (
              cargaTecnicos.map((row) => (
                <div key={row.id} className="flex items-center justify-between border-b px-3 py-2 text-xs last:border-b-0">
                  <span className="truncate font-medium">{row.nombre}</span>
                  <Badge variant="secondary">{row.count}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-3">
          <PanelTitle icon={AlertTriangle} title="Alertas ejecutivas" subtitle="Solo desvios accionables" />
          <div className="space-y-2">
            {alertas.length === 0 ? (
              <div className="rounded-md border bg-emerald-500/5 px-3 py-6 text-center text-xs text-emerald-700">Sin alertas criticas.</div>
            ) : (
              alertas.map((alerta) => (
                <button key={alerta.title} onClick={() => navigate(alerta.to)} className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", toneClasses[alerta.tone])}>
                    {alerta.tone === "bad" ? <AlertTriangle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{alerta.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{alerta.detail}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
}

function Kpi({ label, value, loading, tone = "neutral" }: { label: string; value: React.ReactNode; loading: boolean; tone?: Tone }) {
  return (
    <div className={cn("rounded-md border px-3 py-2", tone === "bad" && "border-destructive/30 bg-destructive/5", tone === "warn" && "border-amber-300 bg-amber-50/60")}>
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{loading ? <span className="inline-block h-6 w-14 animate-pulse rounded bg-muted" /> : value}</div>
    </div>
  );
}

function ConceptLine({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total > 0 ? Math.max(3, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{money(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-primary/10 text-primary",
  good: "bg-emerald-500/10 text-emerald-700",
  warn: "bg-amber-500/10 text-amber-700",
  bad: "bg-destructive/10 text-destructive",
};
