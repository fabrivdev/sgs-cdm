import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterDate, FilterSelect } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Users,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
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
  activo: boolean | null;
}

interface UserRole {
  user_id: string;
  role: "admin" | "cabecilla" | "tecnico";
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
  const formatted = new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
  }).format(value || 0);
  return `$ ${formatted}`;
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
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [facturacion, setFacturacion] = useState<Facturacion[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekStartInput, setWeekStartInput] = useState(initialWeekStart);
  const [selectedWeekKey, setSelectedWeekKey] = useState(initialWeekStart);
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fRubros, setFRubros] = useState<string[]>([]);
  const [fEstadosTrabajo, setFEstadosTrabajo] = useState<string[]>([]);
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<"semana" | "mes" | "anio">("mes");
  const [q, setQ] = useState("");
  const [section, setSection] = useState("resumen");

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
    const min = Math.min(firstComparisonWeek.getTime(), previousMonthStart.getTime(), subMonths(monthStart, 11).getTime());
    return new Date(min);
  }, [firstComparisonWeek, monthStart, previousMonthStart]);
  const queryEnd = useMemo(() => {
    const max = Math.max(weekEnd.getTime(), monthEnd.getTime());
    return new Date(max);
  }, [monthEnd, weekEnd]);

  useEffect(() => {
    setSelectedWeekKey(dateKey(periodMode === "semana" ? weekStart : monthStart));
  }, [monthStart, periodMode, weekStart]);

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
        if (fSucursales.length > 0) factQuery = factQuery.in("sucursal", fSucursales);

        const [serviciosRows, jornadasRows, trabajosRows, clientesRows, profilesRows, roleRows, factRows] = await Promise.all([
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
          cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal, activo")),
          cargarTodo<UserRole>(supabase.from("user_roles").select("user_id, role")),
          cargarTodo<Facturacion>(factQuery),
        ]);

        if (!alive) return;
        setServicios(serviciosRows);
        setJornadas(jornadasRows);
        setTrabajos(trabajosRows);
        setClientes(clientesRows);
        setProfiles(profilesRows);
        setUserRoles(roleRows);
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
  }, [fSucursales, previousWeekStart, queryEnd, queryStart, weekEnd]);

  const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const activeTechnicianIds = useMemo(() => {
    const roleIds = new Set(userRoles.filter((row) => row.role === "tecnico").map((row) => row.user_id));
    const referencedTechIds = new Set(
      jornadas.flatMap((jornada) => [jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])].filter(Boolean) as string[]),
    );
    return new Set(
      profiles
        .filter((profile) => {
          const name = profile.nombre.toLowerCase();
          const hasTecnicoRole = roleIds.has(profile.id);
          const fallbackReferenced = roleIds.size === 0 && referencedTechIds.has(profile.id);
          return profile.activo !== false && (hasTecnicoRole || fallbackReferenced) && !name.includes("pasante");
        })
        .map((profile) => profile.id),
    );
  }, [jornadas, profiles, userRoles]);

  const technicianOptions = useMemo(
    () =>
      Array.from(activeTechnicianIds)
        .map((id) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [activeTechnicianIds, profileById],
  );

  const validTechnicianIds = (ids: Array<string | null | undefined>) =>
    Array.from(new Set(ids.filter((id): id is string => !!id && activeTechnicianIds.has(id))));

  const query = q.trim().toLowerCase();
  const factFiltered = useMemo(
    () =>
      facturacion.filter((row) => {
        if (fRubros.length > 0 && !fRubros.includes(concept(row))) return false;
        if (!query) return true;
        const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
        return (
          cliente.toLowerCase().includes(query) ||
          row.cod_factura.toLowerCase().includes(query) ||
          (row.grupo_fx ?? "").toLowerCase().includes(query) ||
          (row.grupo ?? "").toLowerCase().includes(query)
        );
      }),
    [clienteById, fRubros, facturacion, query],
  );

  const scopedServicio = (servicio: Servicio | undefined | null) => {
    if (!servicio) return false;
    if (fSucursales.length > 0 && !fSucursales.includes(servicio.sucursal)) return false;
    if (!query) return true;
    const cliente = servicio.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre ?? "" : "";
    return cliente.toLowerCase().includes(query) || servicio.trabajo_descripcion.toLowerCase().includes(query);
  };

  const scopedTrabajo = (trabajo: Trabajo) => {
    if (fSucursales.length > 0 && !fSucursales.includes(trabajo.sucursal)) return false;
    if (!query) return true;
    const cliente = trabajo.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre ?? "" : "";
    return (
      cliente.toLowerCase().includes(query) ||
      trabajo.descripcion_problema.toLowerCase().includes(query) ||
      (trabajo.codigo ?? "").toLowerCase().includes(query)
    );
  };

  const weeklyRows = useMemo<WeekRow[]>(() => {
    const periods = periodMode === "semana"
      ? Array.from({ length: 8 }, (_, index) => {
          const start = subWeeks(weekStart, 7 - index);
          return { start, end: endOfWeek(start, { weekStartsOn: 1 }), label: `${format(start, "dd/MM")} - ${format(endOfWeek(start, { weekStartsOn: 1 }), "dd/MM")}` };
        })
      : Array.from({ length: periodMode === "mes" ? 8 : 12 }, (_, index) => {
          const start = startOfMonth(subMonths(monthStart, (periodMode === "mes" ? 7 : 11) - index));
          return { start, end: endOfMonth(start), label: format(start, "MM/yyyy") };
        });

    const rows = periods.map(({ start, end, label }) => {
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
        label,
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
  }, [factFiltered, monthStart, periodMode, weekStart]);

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
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 30);
  }, [clienteById, selectedFacts]);

  const jornadasRealizadasPrev = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Completado" && inRange(jornada.fecha, previousWeekStart, previousWeekEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, previousWeekEnd, previousWeekStart, query, servicioById],
  );

  const jornadasProgramadas = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, weekStart, weekEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, query, servicioById, weekEnd, weekStart],
  );

  const jornadasPendientesCierre = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && jornada.fecha < todayStr && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, query, servicioById],
  );

  const trabajosScope = useMemo(() => trabajos.filter(scopedTrabajo), [clienteById, fSucursales, query, trabajos]);
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
      const ids = validTechnicianIds([jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])]);
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeTechnicianIds, jornadasProgramadas, profileById]);

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > 7);
  const selectedTrend = selectedWeek?.variacion ?? null;
  const currentWeekRow = weeklyRows[weeklyRows.length - 1] ?? selectedWeek;
  const clientesAtendidosSemana = currentWeekRow?.clientes ?? 0;
  const sucursalesConMovimiento = new Set((currentWeekRow?.rows ?? []).map((row) => row.sucursal).filter(Boolean)).size;
  const mixServicioRepuestoTotal = (currentWeekRow?.servicio ?? 0) + (currentWeekRow?.repuestos ?? 0);
  const pctServicio = mixServicioRepuestoTotal > 0 ? Math.round(((currentWeekRow?.servicio ?? 0) / mixServicioRepuestoTotal) * 100) : 0;
  const pctRepuesto = mixServicioRepuestoTotal > 0 ? 100 - pctServicio : 0;
  const periodoLabel = periodMode === "semana" ? "semanal" : periodMode === "mes" ? "mensual" : "anual";
  const T = useMemo(() => {
    const isSemana = periodMode === "semana";
    return {
      seleccionado: isSemana ? "semana seleccionada" : "periodo seleccionado",
      facturacion: isSemana ? "Facturacion de la semana" : "Facturacion del periodo",
      facturas: isSemana ? "Facturas de la semana" : "Facturas del periodo",
      carga: isSemana ? "Carga semanal" : "Carga tecnica",
      lectura: isSemana ? "Lectura semanal" : "Lectura operativa",
      plan: isSemana ? "Plan semana" : "Proximo periodo",
    };
  }, [periodMode]);


  const trabajosBase = useMemo(() => {
    return trabajosScope.map((trabajo) => {
      const trabajoJornadas = jornadasByTrabajo.get(trabajo.id) ?? [];
      const servicio = trabajo.legacy_servicio_id ? servicioById.get(trabajo.legacy_servicio_id) : null;
      const cliente = trabajo.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre ?? "Sin cliente" : "Sin cliente";
      const realizadas = trabajoJornadas.filter((j) => j.estado === "Completado");
      const pendientes = trabajoJornadas.filter((j) => j.estado === "Pendiente");
      const participantes = new Set<string>();
      for (const jornada of trabajoJornadas) {
        for (const id of validTechnicianIds([jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])])) {
          participantes.add(id);
        }
      }
      const tecnicoIds = Array.from(participantes);
      const horas = realizadas.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
      const estado = estadoTrabajoDesdeJornadas(trabajoJornadas, trabajo.estado_general);
      const ultimaFecha = trabajoJornadas.reduce((max, row) => (row.fecha > max ? row.fecha : max), "");
      const pendientesVencidas = pendientes.filter((row) => row.fecha < todayStr).length;
      const pendientesSemana = pendientes.filter((row) => inRange(row.fecha, weekStart, weekEnd)).length;
      return {
        id: trabajo.id,
        ref: trabajo.codigo ?? "TR",
        cliente,
        descripcion: trabajo.descripcion_problema,
        sucursal: trabajo.sucursal,
        estado,
        realizadas: realizadas.length,
        pendientes: pendientes.length,
        totalJornadas: trabajoJornadas.length,
        participantes: participantes.size,
        tecnicoIds,
        horas,
        ultimaFecha,
        pendientesVencidas,
        pendientesSemana,
        tipo: servicio?.marca ?? "",
      };
    });
  }, [activeTechnicianIds, clienteById, jornadasByTrabajo, servicioById, trabajosScope, weekEnd, weekStart]);

  const trabajosResumen = useMemo(() => {
    return trabajosBase.filter((row) => {
      if (fEstadosTrabajo.length > 0 && !fEstadosTrabajo.includes(row.estado)) return false;
      if (fTecnicos.length > 0 && !row.tecnicoIds.some((id) => fTecnicos.includes(id))) return false;
      return true;
    }).sort((a, b) => {
      const order: Record<string, number> = { pausado: 0, iniciado: 1, programado: 2, pendiente: 3, completado: 4 };
      return (order[a.estado] ?? 9) - (order[b.estado] ?? 9) || b.ultimaFecha.localeCompare(a.ultimaFecha);
    });
  }, [trabajosBase, fEstadosTrabajo, fTecnicos]);


  const trabajosActivos = trabajosResumen.filter((row) => row.estado !== "completado");
  const trabajosConCierre = trabajosResumen.filter((row) => row.estado === "completado").length;
  const tecnicosConActividad = new Set(
    [...jornadasRealizadasPrev, ...jornadasProgramadas].flatMap((j) => validTechnicianIds([j.tecnico_responsable_id, ...(j.auxiliares ?? [])])),
  );
  const tecnicosTotales = activeTechnicianIds.size;

  // Estadísticas de "flujo operativo" basadas en trabajosBase (no se ven afectadas
  // por los filtros de estado/técnico de la pestaña Trabajos).
  const flujo = useMemo(() => {
    const total = trabajosBase.length;
    const culminados = trabajosBase.filter((r) => r.estado === "completado").length;
    const pausados = trabajosBase.filter((r) => r.estado === "pausado").length;
    const pendiente = trabajosBase.filter((r) => r.estado === "pendiente").length;
    const programado = trabajosBase.filter((r) => r.estado === "programado").length;
    const iniciado = trabajosBase.filter((r) => r.estado === "iniciado").length;
    const abiertos = total - culminados - pausados;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return { total, culminados, abiertos, pausados, pendiente, programado, iniciado, pct };
  }, [trabajosBase]);

  const trabajosPorEstado = useMemo(() => {
    const estados: Array<EstadoTrabajo | "pendiente" | "programado" | "iniciado" | "pausado" | "completado"> = [
      "pendiente",
      "programado",
      "iniciado",
      "pausado",
      "completado",
    ];
    return estados.map((estado) => ({
      estado,
      label: estadoLabel(estado),
      count: trabajosResumen.filter((row) => row.estado === estado).length,
    }));
  }, [trabajosResumen]);

  // Carga por sucursal: tabla con cerrados/abiertos/pausados/total/% usando trabajosBase.
  const cargaSucursal = useMemo(() => {
    const totalGral = trabajosBase.length;
    return SUCURSALES.map((sucursal) => {
      const rows = trabajosBase.filter((r) => r.sucursal === sucursal);
      const cerrados = rows.filter((r) => r.estado === "completado").length;
      const pausados = rows.filter((r) => r.estado === "pausado").length;
      const total = rows.length;
      const abiertos = total - cerrados - pausados;
      const pct = totalGral > 0 ? Math.round((total / totalGral) * 100) : 0;
      return { sucursal, cerrados, abiertos, pausados, total, pct };
    })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [trabajosBase]);


  const productividadTecnica = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; jornadas: number; horas: number; trabajos: Set<string> }>();
    for (const trabajo of trabajosResumen) {
      const trabajoJornadas = jornadasByTrabajo.get(trabajo.id) ?? [];
      for (const jornada of trabajoJornadas) {
        if (!inRange(jornada.fecha, previousWeekStart, weekEnd)) continue;
        for (const id of validTechnicianIds([jornada.tecnico_responsable_id, ...(jornada.auxiliares ?? [])])) {
          const current = map.get(id) ?? { id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico", jornadas: 0, horas: 0, trabajos: new Set<string>() };
          current.jornadas += 1;
          current.horas += Number(jornada.horas_trabajadas || 0);
          current.trabajos.add(trabajo.id);
          map.set(id, current);
        }
      }
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, trabajos: row.trabajos.size }))
      .sort((a, b) => b.jornadas - a.jornadas || b.horas - a.horas)
      .slice(0, 20);
  }, [activeTechnicianIds, jornadasByTrabajo, previousWeekStart, profileById, trabajosResumen, weekEnd]);

  const limpiar = () => {
    setWeekStartInput(initialWeekStart);
    setSelectedWeekKey(initialWeekStart);
    setFSucursales([]);
    setFRubros([]);
    setFEstadosTrabajo([]);
    setFTecnicos([]);
    setPeriodMode("semana");
    setQ("");
  };

  const filtrosActivos =
    (weekStartInput !== initialWeekStart ? 1 : 0) +
    (fSucursal !== "all" ? 1 : 0) +
    (fRubro !== "all" ? 1 : 0) +
    (fEstadoTrabajo !== "all" ? 1 : 0) +
    (fTecnico !== "all" ? 1 : 0) +
    (periodMode !== "semana" ? 1 : 0) +
    (q.trim() ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 px-3 py-3 sm:px-4 sm:py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Dashboard ejecutivo</h1>
      </div>


      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Cliente, factura o concepto..." }}
        activeCount={filtrosActivos}
        onClear={limpiar}
        meta={`${factFiltered.length} lineas facturacion - ${trabajosResumen.length} trabajos`}
      >
        <PeriodSelector value={periodMode} onChange={setPeriodMode} />
        <FilterDate label="Semana base" value={weekStartInput} onChange={setWeekStartInput} width="w-[150px]" />
        <FilterSelect
          label="Sucursal"
          value={fSucursal}
          onChange={setFSucursal}
          placeholder="Sucursal"
          width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...SUCURSALES.map((s) => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Rubro"
          value={fRubro}
          onChange={setFRubro}
          placeholder="Rubro"
          width="w-[150px]"
          options={[
            { value: "all", label: "Todos" },
            { value: "Servicio", label: "Servicios" },
            { value: "Repuestos", label: "Repuestos" },
            { value: "Kilometraje", label: "Kilometraje" },
            { value: "Otros", label: "Otros" },
          ]}
        />
      </FiltersBar>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={DollarSign}
          title="Facturacion del periodo"
          value={money(currentWeekRow?.total ?? 0)}
          detail={`${currentWeekRow?.facturas ?? 0} facturas - ${currentWeekRow?.clientes ?? 0} clientes`}
          tone={(currentWeekRow?.variacion ?? 0) < -20 ? "bad" : "neutral"}
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={Users}
          title="Clientes atendidos"
          value={clientesAtendidosSemana}
          detail={`Distintos en ${T.seleccionado}`}
          tone="neutral"
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={Building2}
          title="Sucursales con movimiento"
          value={sucursalesConMovimiento}
          detail={`de ${SUCURSALES.length} sucursales`}
          tone="neutral"
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={BarChart3}
          title="Servicios / Repuestos"
          value={`${pctServicio}% / ${pctRepuesto}%`}
          detail=""
          tone="neutral"
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={ClipboardList}
          title="Actividad operativa"
          value={trabajosActivos.length}
          detail={`${jornadasRealizadasPrev.length} jornadas cerradas · ${jornadasProgramadas.length} planificadas`}
          tone={trabajosPausados.length ? "warn" : "neutral"}
          onClick={() => setSection("trabajos")}
        />

      </section>

      <Tabs value={section} onValueChange={setSection} className="space-y-3">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="resumen">Vista general</TabsTrigger>
          <TabsTrigger value="facturacion">Facturacion</TabsTrigger>
          <TabsTrigger value="trabajos">Trabajos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-3">
          <Card className="border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Resumen gerencial</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Facturacion {periodoLabel} <strong className="text-foreground">{money(currentWeekRow?.total ?? 0)}</strong>, con{" "}
                  <strong className="text-foreground">{clientesAtendidosSemana}</strong> clientes atendidos y{" "}
                  <strong className="text-foreground">{sucursalesConMovimiento}</strong> sucursales con movimiento. En operacion hay{" "}
                  <strong className="text-foreground">{trabajosActivos.length}</strong> trabajos activos,{" "}
                  <strong className="text-foreground">{trabajosPausados.length}</strong> pausados y{" "}
                  <strong className="text-foreground">{jornadasProgramadas.length}</strong> jornadas planificadas para la semana.
                </p>
              </div>
            </div>
          </Card>

          <section className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
            <Card className="p-3">
              <PanelTitle icon={BarChart3} title="Evolucion de facturacion" subtitle={`Comparativo ${periodoLabel} con seleccion directa.`} />
              <WeeklyBars rows={weeklyRows} activeKey={selectedWeek?.key} onSelect={(key) => { setSelectedWeekKey(key); setSection("facturacion"); }} />
              <EvolucionKpis rows={weeklyRows} currentKey={currentWeekRow?.key} />
            </Card>

            <div className="grid gap-3">
              <Card className="p-3">
                <PanelTitle icon={Building2} title="Facturacion por sucursal" subtitle="Participacion del periodo seleccionado." />
                <SucursalBars rows={factBySucursal} totalValue={currentWeekRow?.total ?? 0} onSelect={(sucursal) => { setFSucursales([sucursal]); setSection("facturacion"); }} />
              </Card>
              <Card className="p-3">
                <PanelTitle icon={DollarSign} title="Mix del negocio" subtitle="" />
                <MixRubros row={currentWeekRow} rubroFiltro={fRubro} />
              </Card>

            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-2">
            <Card className="p-3">
              <PanelTitle icon={CheckCircle2} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto
                flujo={flujo}
                onSelect={(estado) => { setFEstadosTrabajo([estado]); setSection("trabajos"); }}
                planificados={jornadasProgramadas.length}
                tecnicosActivos={tecnicosConActividad.size}
                jornadasPrev={jornadasRealizadasPrev.length}
                horasPrev={horasPrev}
                planLabel={T.plan}
              />
            </Card>
            <Card className="p-3">
              <PanelTitle icon={CalendarDays} title={periodMode === "semana" ? "Carga tecnica" : "Carga tecnica del periodo"} subtitle="" />
              <CargaTecnicaTabla rows={productividadTecnica} onClick={() => setSection("trabajos")} />
            </Card>
          </section>

          <section className="grid gap-3 xl:grid-cols-2">
            <Card className="p-3">
              <PanelTitle icon={Users} title="Clientes atendidos" subtitle="" />
              <ClientesCompacto
                rows={topClientes}
                totalValue={currentWeekRow?.total ?? 0}
                totalFacturas={currentWeekRow?.facturas ?? 0}
                totalClientes={currentWeekRow?.clientes ?? 0}
                onSelect={(nombre) => { setQ(nombre); setSection("facturacion"); }}
              />
            </Card>
            <Card className="p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="" />
              <CargaSucursalTabla rows={cargaSucursal} onSelect={(sucursal) => { setFSucursales([sucursal]); setSection("trabajos"); }} />
            </Card>
          </section>

        </TabsContent>

        <TabsContent value="facturacion" className="space-y-3">
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
            <h2 className="text-base font-semibold">{periodMode === "semana" ? "Semana seleccionada" : "Periodo seleccionado"}</h2>
            <p className="text-xs text-muted-foreground">{selectedWeek?.label ?? "-"}</p>
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
              <h2 className="text-base font-semibold">{T.facturas}</h2>
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
                <button key={row.sucursal} onClick={() => setFSucursales([row.sucursal])} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-accent">
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
        </TabsContent>

        <TabsContent value="trabajos" className="space-y-3">
          <FiltersBar
            activeCount={(fEstadoTrabajo !== "all" ? 1 : 0) + (fTecnico !== "all" ? 1 : 0)}
            onClear={() => {
              setFEstadosTrabajo([]);
              setFTecnicos([]);
            }}
            meta={
              <div className="flex flex-wrap items-center gap-1.5">
                <TrabajoChip label="Activos" value={trabajosActivos.length} onClick={() => setFEstadosTrabajo([])} />
                <TrabajoChip label="Cerrados" value={trabajosConCierre} tone="good" onClick={() => setFEstadosTrabajo(["completado"])} />
                <TrabajoChip label="Pausados" value={trabajosPausados.length} tone={trabajosPausados.length ? "warn" : "neutral"} onClick={() => setFEstadosTrabajo(["pausado"])} />
                <TrabajoChip label="Jornadas" value={jornadasRealizadasPrev.length} onClick={() => setFEstadosTrabajo([])} />
                <TrabajoChip label="Tecnicos" value={`${tecnicosConActividad.size}/${tecnicosTotales || "-"}`} onClick={() => setFEstadosTrabajo([])} />
                <span className="ml-1 text-[11px] text-muted-foreground">{trabajosResumen.length} en lista</span>
              </div>
            }
          >
            <FilterSelect
              label="Estado"
              value={fEstadoTrabajo}
              onChange={setFEstadoTrabajo}
              placeholder="Estado"
              width="w-[150px]"
              options={[
                { value: "all", label: "Todos" },
                { value: "pendiente", label: "Pendiente" },
                { value: "programado", label: "Programado" },
                { value: "iniciado", label: "Iniciado" },
                { value: "pausado", label: "Pausado" },
                { value: "completado", label: "Completado" },
              ]}
            />
            <FilterSelect
              label="Tecnico o cuadrilla"
              value={fTecnico}
              onChange={setFTecnico}
              placeholder="Tecnico"
              width="w-[220px]"
              options={[{ value: "all", label: "Todos" }, ...technicianOptions.map((row) => ({ value: row.id, label: row.nombre }))]}
            />
          </FiltersBar>

          <section className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
            <Card className="p-3">
              <PanelTitle icon={BarChart3} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto flujo={flujo} onSelect={setFEstadoTrabajo} />
            </Card>
            <Card className="p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="" />
              <CargaSucursalTabla rows={cargaSucursal} onSelect={(sucursal) => setFSucursales([sucursal])} />
            </Card>
          </section>

          <Card className="p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Seguimiento por OS/TR</h2>
              </div>
              <Badge variant="secondary">{trabajosResumen.length} trabajos</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <div className="min-w-[980px] max-h-[420px] overflow-y-auto">
                <div className="sticky top-0 grid grid-cols-[96px_1.2fr_0.7fr_96px_84px_78px_108px_120px_110px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                  <div>OS/TR</div>
                  <div>Cliente / trabajo</div>
                  <div>Sucursal</div>
                  <div className="text-right">Jornadas</div>
                  <div className="text-right">Tecnicos</div>
                  <div className="text-right">Horas</div>
                  <div className="text-right">Ultima fecha</div>
                  <div className="text-right">Cierre</div>
                  <div className="text-right">Estado</div>
                </div>
                {trabajosResumen.length === 0 ? (
                  <div className="px-3 py-10 text-center text-xs text-muted-foreground">Sin trabajos para los filtros actuales.</div>
                ) : (
                  trabajosResumen.slice(0, 80).map((row) => (
                    <button
                      key={row.id}
                      onClick={() => navigate(`/trabajos?q=${encodeURIComponent(row.ref)}`)}
                      className="grid w-full grid-cols-[96px_1.2fr_0.7fr_96px_84px_78px_108px_120px_110px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <div className="font-mono text-[11px] font-semibold">{row.ref}</div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{row.cliente}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{row.descripcion}</div>
                      </div>
                      <div className="truncate">{row.sucursal}</div>
                      <div className="text-right tabular-nums">{row.realizadas}/{row.totalJornadas}</div>
                      <div className="text-right tabular-nums">{row.participantes}</div>
                      <div className="text-right tabular-nums">{row.horas.toFixed(1)}</div>
                      <div className="text-right tabular-nums">{row.ultimaFecha ? format(parseISO(row.ultimaFecha), "dd/MM") : "-"}</div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        {row.pendientesVencidas > 0
                          ? `${row.pendientesVencidas} vencida${row.pendientesVencidas !== 1 ? "s" : ""}`
                          : row.pendientesSemana > 0
                            ? `${row.pendientesSemana} esta semana`
                            : row.pendientes > 0
                              ? `${row.pendientes} pendiente${row.pendientes !== 1 ? "s" : ""}`
                              : "Sin pendientes"}
                      </div>
                      <div className="text-right">
                        <Badge variant={row.estado === "pausado" ? "default" : "secondary"} className={cn("text-[10px]", row.estado === "pausado" && "bg-amber-600 text-white")}>
                          {estadoLabel(row.estado)}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>

          <section className="grid gap-3 xl:grid-cols-[1fr_0.9fr]">
            <Card className="p-3">
              <PanelTitle icon={Users} title="Productividad tecnica" subtitle="" />
              <CargaTecnicaTabla rows={productividadTecnica} />
            </Card>
            <Card className="p-3">
              <PanelTitle icon={CalendarDays} title={T.lectura} subtitle="" />
              <div className="grid grid-cols-2 gap-2">
                <Kpi label="Cierre anterior" value={`${format(previousWeekStart, "dd/MM")} - ${format(previousWeekEnd, "dd/MM")}`} loading={loading} />
                <Kpi label={T.plan} value={`${format(weekStart, "dd/MM")} - ${format(weekEnd, "dd/MM")}`} loading={loading} />
                <Kpi label="Sin horas" value={sinHorasPrev} loading={loading} tone={sinHorasPrev ? "warn" : "good"} />
                <Kpi label="+7d sin cierre" value={fueraTolerancia.length} loading={loading} tone={fueraTolerancia.length ? "bad" : "good"} />
              </div>
            </Card>

          </section>

        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
  detail,
  tone = "neutral",
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  value: React.ReactNode;
  detail: string;
  tone?: Tone;
  onClick: () => void;
}) {
  return (
    <button className="rounded-lg text-left" onClick={onClick}>
      <Card className={cn("p-3 transition-colors hover:bg-accent/50", tone === "bad" && "border-destructive/40 bg-destructive/5", tone === "warn" && "border-amber-300 bg-amber-50/60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>
          </div>
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </Card>
    </button>
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

function PeriodSelector({ value, onChange }: { value: "semana" | "mes" | "anio"; onChange: (value: "semana" | "mes" | "anio") => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 max-sm:!w-full sm:w-[180px]">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Periodo</span>
      <div className="grid h-9 grid-cols-3 overflow-hidden rounded-md border bg-background text-xs">
        {[
          { value: "semana", label: "Semana" },
          { value: "mes", label: "Mes" },
          { value: "anio", label: "Ano" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value as "semana" | "mes" | "anio")}
            className={cn("border-r px-2 last:border-r-0 hover:bg-accent", value === option.value && "bg-primary text-primary-foreground hover:bg-primary")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WeeklyBars({ rows, activeKey, onSelect }: { rows: WeekRow[]; activeKey?: string; onSelect: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <div className="overflow-x-auto">
      <div className="flex min-h-[260px] min-w-[720px] items-end gap-3 border-b px-2 pt-4">
        {rows.map((row) => {
          const height = Math.max(8, Math.round((row.total / max) * 180));
          const active = row.key === activeKey;
          return (
            <button key={row.key} onClick={() => onSelect(row.key)} className="flex flex-1 flex-col items-center gap-2 text-center">
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{row.total ? money(row.total).replace("USD", "").trim() : "0"}</span>
              <span
                className={cn(
                  "w-full max-w-[42px] rounded-t-md bg-primary/80 transition-all hover:bg-primary",
                  active && "bg-primary ring-2 ring-primary/20",
                )}
                style={{ height }}
              />
              <span className="min-h-8 text-[10px] leading-4 text-muted-foreground">{row.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
        Facturacion semanal (USD)
      </div>
    </div>
  );
}

function SucursalBars({
  rows,
  totalValue,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; total: number; facturas: number }>;
  totalValue: number;
  onSelect: (sucursal: Sucursal) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin movimiento por sucursal.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const isZero = row.total <= 0;
        const width = isZero ? 0 : Math.max(4, Math.round((row.total / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.sucursal} onClick={() => !isZero && onSelect(row.sucursal)} className={cn("w-full rounded-md px-2 py-1.5 text-left", !isZero && "hover:bg-accent", isZero && "opacity-60 cursor-default")}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className={cn("font-medium", isZero && "text-muted-foreground")}>{row.sucursal}</span>
              <span className="tabular-nums text-muted-foreground">{money(row.total)} - {participation}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ClientesRanking({
  rows,
  totalValue,
  onSelect,
}: {
  rows: Array<{ nombre: string; total: number; facturas: number }>;
  totalValue: number;
  onSelect: (nombre: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.total));

  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin clientes en el periodo.</div>;
  }

  return (
    <div className="space-y-2">
      {rows.slice(0, 6).map((row, index) => {
        const width = Math.max(4, Math.round((row.total / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.total / totalValue) * 100) : 0;
        return (
          <button key={row.nombre} onClick={() => onSelect(row.nombre)} className="w-full rounded-md border px-3 py-2 text-left hover:bg-accent">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 font-semibold">
                <span className="mr-2 text-muted-foreground">{index + 1}</span>
                <span className="truncate">{row.nombre}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{money(row.total)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 min-w-0 flex-1 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
              <span className="w-10 text-right text-[10px] tabular-nums text-muted-foreground">{participation}%</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{row.facturas} factura{row.facturas !== 1 ? "s" : ""}</div>
          </button>
        );
      })}
    </div>
  );
}

function EstadoBars({
  rows,
  totalValue,
  onSelect,
}: {
  rows: Array<{ estado: string; label: string; count: number }>;
  totalValue: number;
  onSelect: (estado: string) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const width = Math.max(row.count > 0 ? 4 : 0, Math.round((row.count / max) * 100));
        const participation = totalValue > 0 ? Math.round((row.count / totalValue) * 100) : 0;
        return (
          <button key={row.estado} onClick={() => onSelect(row.estado)} className="grid w-full grid-cols-[96px_1fr_72px_52px] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
            <span className="font-medium">{row.label}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className={cn("block h-full rounded-full", row.estado === "pausado" ? "bg-amber-500" : "bg-primary")} style={{ width: `${width}%` }} />
            </span>
            <span className="text-right tabular-nums">{row.count}</span>
            <span className="text-right tabular-nums text-muted-foreground">{participation}%</span>
          </button>
        );
      })}
    </div>
  );
}

function TrabajoSucursalBars({
  rows,
  onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; activos: number; cerrados: number }>;
  onSelect: (sucursal: Sucursal) => void;
}) {
  const max = Math.max(1, ...rows.map((row) => row.activos + row.cerrados));
  const visibleRows = rows.filter((row) => row.activos + row.cerrados > 0);

  if (visibleRows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin trabajos por sucursal.</div>;
  }

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const totalRow = row.activos + row.cerrados;
        const width = Math.max(4, Math.round((totalRow / max) * 100));
        return (
          <button key={row.sucursal} onClick={() => onSelect(row.sucursal)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent">
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="font-medium">{row.sucursal}</span>
              <span className="tabular-nums text-muted-foreground">{row.activos} activos - {row.cerrados} cerrados</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TecnicoProductividad({ rows }: { rows: Array<{ id: string; nombre: string; jornadas: number; horas: number; trabajos: number }> }) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin actividad tecnica en el periodo seleccionado.</div>;
  }

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[1fr_74px_74px_74px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <div>Tecnico</div>
        <div className="text-right">Jorn.</div>
        <div className="text-right">Horas</div>
        <div className="text-right">Trab.</div>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="grid grid-cols-[1fr_74px_74px_74px] items-center border-t px-3 py-2 text-xs">
          <div className="truncate font-medium">{row.nombre}</div>
          <div className="text-right tabular-nums">{row.jornadas}</div>
          <div className="text-right tabular-nums">{row.horas.toFixed(1)}</div>
          <div className="text-right tabular-nums">{row.trabajos}</div>
        </div>
      ))}
    </div>
  );
}


function estadoLabel(estado: string) {
  switch (estado) {
    case "programado":
      return "Programado";
    case "iniciado":
      return "Iniciado";
    case "pausado":
      return "Pausado";
    case "completado":
      return "Completado";
    default:
      return "Pendiente";
  }
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-primary/10 text-primary",
  good: "bg-emerald-500/10 text-emerald-700",
  warn: "bg-amber-500/10 text-amber-700",
  bad: "bg-destructive/10 text-destructive",
};

/* --------- Nuevos componentes compactos --------- */

function MixRubros({ row, rubroFiltro }: { row: WeekRow | undefined; rubroFiltro: string }) {
  if (!row) return <div className="text-xs text-muted-foreground">Sin datos.</div>;
  if (rubroFiltro !== "all") {
    const valor = rubroFiltro === "Repuestos" ? row.repuestos
      : rubroFiltro === "Servicio" ? row.servicio
      : rubroFiltro === "Kilometraje" ? row.kilometraje
      : row.otros;
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-3">
        <div className="text-[10px] uppercase text-muted-foreground">Rubro seleccionado</div>
        <div className="mt-0.5 text-sm font-semibold">{rubroFiltro}</div>
        <div className="mt-1 text-lg font-bold tabular-nums">{money(valor)}</div>
      </div>
    );
  }
  const items: Array<{ label: string; value: number }> = [
    { label: "Repuestos", value: row.repuestos },
    { label: "Servicios", value: row.servicio },
    { label: "Kilometraje", value: row.kilometraje },
    { label: "Otros", value: row.otros },
  ];
  const total = row.total || 1;
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const pct = Math.round((it.value / total) * 100);
        return (
          <div key={it.label} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs">
            <span className="font-medium">{it.label}</span>
            <span className="flex items-center gap-3 tabular-nums">
              <span>{money(it.value)}</span>
              <span className="w-10 text-right text-muted-foreground">{pct}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EstadoCompacto({
  flujo, onSelect, planificados, tecnicosActivos, jornadasPrev, horasPrev, planLabel,
}: {
  flujo: { total: number; culminados: number; abiertos: number; pausados: number; pendiente: number; programado: number; iniciado: number; pct: (n: number) => number };
  onSelect: (estado: string) => void;
  planificados?: number;
  tecnicosActivos?: number;
  jornadasPrev?: number;
  horasPrev?: number;
  planLabel?: string;
}) {
  if (flujo.total === 0) {
    return (
      <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">
        Sin trabajos en el periodo seleccionado.
      </div>
    );
  }

  const segs = [
    { key: "completado", label: "Culminados", value: flujo.culminados, pct: flujo.pct(flujo.culminados), bar: "bg-primary", dot: "bg-primary" },
    { key: "iniciado", label: "Abiertos", value: flujo.abiertos, pct: flujo.pct(flujo.abiertos), bar: "bg-sky-500/80", dot: "bg-sky-500" },
    { key: "pausado", label: "Pausados", value: flujo.pausados, pct: flujo.pct(flujo.pausados), bar: "bg-amber-500/80", dot: "bg-amber-500" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">Total gestionados</span>
        <button onClick={() => onSelect("all")} className="text-lg font-bold tabular-nums hover:text-primary">
          {flujo.total}
        </button>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((s) => s.value > 0 && (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={cn("h-full transition-opacity hover:opacity-80", s.bar)}
            style={{ width: `${s.pct}%` }}
            title={`${s.label}: ${s.value} (${s.pct}%)`}
            aria-label={`${s.label} ${s.value}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segs.map((s) => (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className="flex items-center gap-1.5 text-xs hover:text-primary"
          >
            <span className={cn("h-2 w-2 rounded-full", s.dot)} />
            <span className="font-medium">{s.label}</span>
            <span className="tabular-nums font-semibold">{s.value}</span>
            <span className="text-[11px] text-muted-foreground">({s.pct}%)</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="font-medium">Pipeline:</span>
        <button className="hover:text-foreground" onClick={() => onSelect("pendiente")}>Pendiente <span className="tabular-nums font-semibold">{flujo.pendiente}</span></button>
        <span>·</span>
        <button className="hover:text-foreground" onClick={() => onSelect("programado")}>Programado <span className="tabular-nums font-semibold">{flujo.programado}</span></button>
        <span>·</span>
        <button className="hover:text-foreground" onClick={() => onSelect("iniciado")}>Iniciado <span className="tabular-nums font-semibold">{flujo.iniciado}</span></button>
      </div>

      {(planificados != null || tecnicosActivos != null || jornadasPrev != null) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {planificados != null && (
            <span><span className="font-medium text-foreground/80">{planLabel ?? "Planificados"}:</span> <span className="tabular-nums font-semibold">{planificados}</span></span>
          )}
          {tecnicosActivos != null && (<>
            <span>·</span>
            <span><span className="font-medium text-foreground/80">Tecnicos activos:</span> <span className="tabular-nums font-semibold">{tecnicosActivos}</span></span>
          </>)}
          {jornadasPrev != null && (<>
            <span>·</span>
            <span><span className="font-medium text-foreground/80">Cierre anterior:</span> <span className="tabular-nums font-semibold">{jornadasPrev}</span> jornadas{horasPrev != null ? ` / ${horasPrev.toFixed(1)} hs` : ""}</span>
          </>)}
        </div>
      )}
    </div>
  );
}


function CargaSucursalTabla({
  rows, onSelect,
}: {
  rows: Array<{ sucursal: Sucursal; cerrados: number; abiertos: number; pausados: number; total: number; pct: number }>;
  onSelect: (sucursal: Sucursal) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin trabajos por sucursal.</div>;
  }
  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-[1fr_70px_70px_70px_60px_56px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <div>Sucursal</div>
        <div className="text-right">Cerrados</div>
        <div className="text-right">Abiertos</div>
        <div className="text-right">Pausados</div>
        <div className="text-right">Total</div>
        <div className="text-right">%</div>
      </div>
      {rows.map((r) => (
        <button
          key={r.sucursal}
          onClick={() => onSelect(r.sucursal)}
          className="grid w-full grid-cols-[1fr_70px_70px_70px_60px_56px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
        >
          <div className="truncate font-medium">{r.sucursal}</div>
          <div className="text-right tabular-nums">{r.cerrados}</div>
          <div className="text-right tabular-nums">{r.abiertos}</div>
          <div className="text-right tabular-nums">{r.pausados}</div>
          <div className="text-right font-semibold tabular-nums">{r.total}</div>
          <div className="text-right tabular-nums text-muted-foreground">{r.pct}%</div>
        </button>
      ))}
    </div>
  );
}

function CargaTecnicaTabla({
  rows, onClick,
}: {
  rows: Array<{ id: string; nombre: string; jornadas: number; horas: number; trabajos: number }>;
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin datos para los filtros seleccionados.</div>;
  }
  const COLLAPSED = 6;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  return (
    <div>
      <div className={cn("overflow-y-auto rounded-md border", expanded ? "max-h-[440px]" : "max-h-[260px]")}>
        <div className="sticky top-0 grid grid-cols-[1fr_70px_70px_72px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>Tecnico</div>
          <div className="text-right">Jornadas</div>
          <div className="text-right">Trabajos</div>
          <div className="text-right">Horas</div>
        </div>
        {visible.map((r) => (
          <button
            key={r.id}
            onClick={onClick}
            className="grid w-full grid-cols-[1fr_70px_70px_72px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
          >
            <div className="truncate font-medium">{r.nombre}</div>
            <div className="text-right tabular-nums">{r.jornadas}</div>
            <div className="text-right tabular-nums">{r.trabajos}</div>
            <div className="text-right tabular-nums">{r.horas.toFixed(1)} hs</div>
          </button>
        ))}
      </div>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="mt-2 w-full rounded-md border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}

function ClientesCompacto({
  rows, totalValue, totalFacturas, totalClientes, onSelect,
}: {
  rows: Array<{ nombre: string; total: number; facturas: number }>;
  totalValue: number;
  totalFacturas: number;
  totalClientes: number;
  onSelect: (nombre: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin clientes en el periodo.</div>;
  }
  const top5 = rows.slice(0, 5).reduce((a, r) => a + r.total, 0);
  const pctTop5 = totalValue > 0 ? Math.round((top5 / totalValue) * 100) : 0;
  const COLLAPSED = 5;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  return (
    <div>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {totalClientes} clientes · {totalFacturas} facturas · Top 5 concentra {pctTop5}%
      </div>
      <div className={cn("overflow-y-auto rounded-md border", expanded ? "max-h-[440px]" : "max-h-[260px]")}>
        <div className="sticky top-0 grid grid-cols-[1fr_60px_96px_48px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
          <div>Cliente</div>
          <div className="text-right">Fact.</div>
          <div className="text-right">Facturacion</div>
          <div className="text-right">%</div>
        </div>
        {visible.map((r) => {
          const pct = totalValue > 0 ? Math.round((r.total / totalValue) * 100) : 0;
          return (
            <button
              key={r.nombre}
              onClick={() => onSelect(r.nombre)}
              className="grid w-full grid-cols-[1fr_60px_96px_48px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
            >
              <div className="truncate font-medium">{r.nombre}</div>
              <div className="text-right tabular-nums">{r.facturas}</div>
              <div className="text-right font-semibold tabular-nums">{money(r.total)}</div>
              <div className="text-right tabular-nums text-muted-foreground">{pct}%</div>
            </button>
          );
        })}
      </div>
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-md border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
        >
          {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
        </button>
      )}
    </div>
  );
}

function TrabajoChip({
  label, value, tone = "neutral", onClick,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] hover:bg-accent",
        tone === "good" && "border-primary/30 bg-primary/5 text-primary",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </button>
  );
}

function EvolucionKpis({ rows, currentKey }: { rows: WeekRow[]; currentKey?: string }) {
  if (!rows.length) return null;
  const totals = rows.map((r) => r.total);
  const sum = totals.reduce((a, b) => a + b, 0);
  const promedio = sum / rows.length;
  const currentIdx = currentKey ? rows.findIndex((r) => r.key === currentKey) : rows.length - 1;
  const idx = currentIdx >= 0 ? currentIdx : rows.length - 1;
  const actual = rows[idx]?.total ?? 0;
  const prev = idx > 0 ? rows[idx - 1].total : 0;
  const variacion = pct(actual, prev);
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total acumulado</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums">{money(sum)}</div>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Promedio por periodo</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums">{money(promedio)}</div>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Var. vs anterior</div>
        <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", variacion == null ? "text-muted-foreground" : variacion >= 0 ? "text-primary" : "text-destructive")}>
          {variacion == null ? "—" : `${variacion >= 0 ? "+" : ""}${variacion}%`}
        </div>
      </div>
    </div>
  );
}


