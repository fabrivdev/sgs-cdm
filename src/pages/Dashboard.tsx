import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterDate } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  PieChart,
  Receipt,
  Users,
} from "lucide-react";
import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getISOWeek,
  getISOWeekYear,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { MARCAS, SUCURSALES, type Marca, type Sucursal } from "@/lib/constants";
import { estadoTrabajoDesdeJornadas, type EstadoTrabajo } from "@/lib/trabajos";
import { clasificarMarcaFacturacion } from "@/lib/facturacionReglas";
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
  marca: Marca | null;
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
  tipo_tiempo: "Cliente" | "Garantia" | "Interno";
  origen_sistema?: string | null;
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
  const [baseLoading, setBaseLoading] = useState(true);
  const [jornadasLoading, setJornadasLoading] = useState(true);
  const [facturacionLoading, setFacturacionLoading] = useState(true);

  const [weekStartInput, setWeekStartInput] = useState(initialWeekStart);
  const [selectedWeekKey, setSelectedWeekKey] = useState(initialWeekStart);
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fRubros, setFRubros] = useState<string[]>([]);
  const [fMarcas, setFMarcas] = useState<string[]>([]);
  const [fTiposTiempo, setFTiposTiempo] = useState<string[]>([]);
  const [fEstadosTrabajo, setFEstadosTrabajo] = useState<string[]>([]);
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<"semana" | "mes" | "anio">("mes");
  const [q, setQ] = useState("");
  const [section, setSection] = useState("resumen");
  const [rangoEvolucion, setRangoEvolucion] = useState<"6" | "12" | "24" | "all">("12");
  const loading = baseLoading || jornadasLoading || facturacionLoading;
  const filtrosTrabajoActivos = section === "trabajos";

  const weekStart = useMemo(() => startOfWeek(parseISO(weekStartInput), { weekStartsOn: 1 }), [weekStartInput]);
  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const previousWeekStart = useMemo(() => subWeeks(weekStart, 1), [weekStart]);
  const previousWeekEnd = useMemo(() => endOfWeek(previousWeekStart, { weekStartsOn: 1 }), [previousWeekStart]);
  const monthStart = useMemo(() => startOfMonth(weekStart), [weekStart]);
  const monthEnd = useMemo(() => endOfMonth(weekStart), [weekStart]);
  const previousMonthStart = useMemo(() => startOfMonth(subMonths(weekStart, 1)), [weekStart]);
  const previousMonthEnd = useMemo(() => endOfMonth(subMonths(weekStart, 1)), [weekStart]);
  const yearStart = useMemo(() => startOfYear(weekStart), [weekStart]);
  const yearEnd = useMemo(() => endOfYear(weekStart), [weekStart]);
  const previousYearStart = useMemo(() => startOfYear(subYears(weekStart, 1)), [weekStart]);
  const previousYearEnd = useMemo(() => endOfYear(subYears(weekStart, 1)), [weekStart]);
  const periodStart = periodMode === "anio" ? yearStart : periodMode === "mes" ? monthStart : weekStart;
  const periodEnd = periodMode === "anio" ? yearEnd : periodMode === "mes" ? monthEnd : weekEnd;
  const previousPeriodStart = periodMode === "anio" ? previousYearStart : periodMode === "mes" ? previousMonthStart : previousWeekStart;
  const previousPeriodEnd = periodMode === "anio" ? previousYearEnd : periodMode === "mes" ? previousMonthEnd : previousWeekEnd;
  const firstComparisonWeek = useMemo(() => subWeeks(weekStart, 7), [weekStart]);
  const queryStart = useMemo(() => {
    if (periodMode === "anio") return subYears(yearStart, 4);
    if (periodMode === "mes") return subMonths(monthStart, 11);
    return firstComparisonWeek;
  }, [firstComparisonWeek, monthStart, periodMode, yearStart]);
  const queryEnd = useMemo(() => periodEnd, [periodEnd]);

  useEffect(() => {
    setSelectedWeekKey(dateKey(periodMode === "anio" ? yearStart : periodMode === "semana" ? weekStart : monthStart));
  }, [monthStart, periodMode, weekStart, yearStart]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setBaseLoading(true);
      try {
        const [serviciosRows, trabajosRows, clientesRows, profilesRows, roleRows] = await Promise.all([
          cargarTodo<Servicio>(
            supabase
              .from("servicios")
              .select("id, fecha_programada, tecnico_responsable_id, auxiliares, sucursal, marca, cliente_id, trabajo_descripcion"),
          ),
          cargarTodo<Trabajo>(
            supabase
              .from("trabajos")
              .select("id, codigo, estado_general, legacy_servicio_id, sucursal, marca, cliente_id, descripcion_problema, motivo_bloqueo, creado_en, actualizado_en"),
          ),
          cargarTodo<Cliente>(supabase.from("clientes").select("id, nombre, sucursal")),
          cargarTodo<Profile>(supabase.from("profiles").select("id, nombre, sucursal, activo")),
          cargarTodo<UserRole>(supabase.from("user_roles").select("user_id, role")),
        ]);

        if (!alive) return;
        setServicios(serviciosRows);
        setTrabajos(trabajosRows);
        setClientes(clientesRows);
        setProfiles(profilesRows);
        setUserRoles(roleRows);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setBaseLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      setJornadasLoading(true);
      try {
        const jornadasRows = await cargarTodo<Jornada>(
          supabase
            .from("servicio_jornadas")
            .select("id, servicio_id, fecha, estado, horas_trabajadas, tecnico_responsable_id, auxiliares")
            .gte("fecha", dateKey(new Date(Math.min(subWeeks(previousWeekStart, 8).getTime(), periodStart.getTime(), previousPeriodStart.getTime()))))
            .lte("fecha", dateKey(new Date(Math.max(weekEnd.getTime(), periodEnd.getTime()))))
            .order("fecha", { ascending: true }),
        );

        if (alive) setJornadas(jornadasRows);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setJornadasLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [previousWeekStart, weekEnd, periodStart, periodEnd, previousPeriodStart]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setFacturacionLoading(true);
      try {
        let factQuery = supabase
          .from("facturacion")
          .select("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, grupo, grupo_fx, cod_factura")
          .gte("fecha", dateKey(queryStart))
          .lte("fecha", dateKey(queryEnd))
          .order("fecha", { ascending: false });
        if (fSucursales.length > 0) factQuery = factQuery.in("sucursal", fSucursales as Sucursal[]);

        let gridQuery = (supabase
          .from("facturacion_lineas_importadas" as any)
          .select(
            "fecha_factura, sucursal, tipo_facturacion, entidad_nombre, total_venta, subgrupo_original, grupo_normalizado, factura, codigo_interno_factura, tipo_tiempo, origen_sistema",
          )
          .gte("fecha_factura", dateKey(queryStart))
          .lte("fecha_factura", `${dateKey(queryEnd)}T23:59:59`)
          .eq("origen_sistema", "grid_campos")
          .order("fecha_factura", { ascending: false }) as any);
        if (fSucursales.length > 0) gridQuery = gridQuery.in("sucursal", fSucursales as Sucursal[]);

        const [legacyRows, gridRowsRaw] = await Promise.all([
          cargarTodo<Facturacion>(factQuery),
          cargarTodo<any>(gridQuery),
        ]);

        const hasGridCampos = gridRowsRaw.length > 0;
        const legacyRowsNormalizados = legacyRows
          .filter((row) => !hasGridCampos || !row.entidad_nombre.toUpperCase().includes("CAMPOS DEL MA"))
          .map((row) => ({
            ...row,
            tipo_tiempo: "Cliente" as Facturacion["tipo_tiempo"],
            origen_sistema: "legacy",
          }));

        const gridRows: Facturacion[] = gridRowsRaw.map((row) => {
          const factura = String(row.factura ?? row.codigo_interno_factura ?? "").trim();
          const tipo = row.tipo_facturacion === "Servicio" ? "Servicio" : "Repuesto";
          return {
            fecha: String(row.fecha_factura ?? "").slice(0, 10),
            sucursal: row.sucursal,
            tipo,
            cliente_id: null,
            entidad_nombre: row.entidad_nombre ?? "CAMPOS DEL MANANA S.A.",
            total_venta: Number(row.total_venta || 0),
            grupo: row.subgrupo_original ?? row.grupo_normalizado ?? null,
            grupo_fx: row.grupo_normalizado ?? null,
            cod_factura: factura,
            tipo_tiempo: (row.tipo_tiempo ?? "Cliente") as Facturacion["tipo_tiempo"],
            origen_sistema: row.origen_sistema ?? "grid_campos",
          };
        });

        if (alive) setFacturacion([...legacyRowsNormalizados, ...gridRows]);
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setFacturacionLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fSucursales, queryEnd, queryStart]);

  const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  // Resuelve la cuadrilla efectiva de una jornada con herencia desde el servicio padre,
  // igual que Planificador: si la jornada no tiene principal/auxiliares propios, hereda
  // los del servicio.
  const jornadaCrewIds = (jornada: Jornada): string[] => {
    const servicio = servicioById.get(jornada.servicio_id);
    const principal = jornada.tecnico_responsable_id ?? servicio?.tecnico_responsable_id ?? null;
    const aux = (jornada.auxiliares && jornada.auxiliares.length > 0)
      ? jornada.auxiliares
      : (servicio?.auxiliares ?? []);
    return [principal, ...aux].filter(Boolean) as string[];
  };

  const activeTechnicianIds = useMemo(() => {
    const roleIds = new Set(userRoles.filter((row) => row.role === "tecnico").map((row) => row.user_id));
    const referencedTechIds = new Set<string>();
    for (const jornada of jornadas) {
      for (const id of jornadaCrewIds(jornada)) referencedTechIds.add(id);
    }
    for (const servicio of servicios) {
      if (servicio.tecnico_responsable_id) referencedTechIds.add(servicio.tecnico_responsable_id);
      for (const id of servicio.auxiliares ?? []) referencedTechIds.add(id);
    }
    return new Set(
      profiles
        .filter((profile) => {
          const name = profile.nombre.toLowerCase();
          const hasTecnicoRole = roleIds.has(profile.id);
          const referenced = referencedTechIds.has(profile.id);
          return profile.activo !== false && (hasTecnicoRole || referenced) && !name.includes("pasante");
        })
        .map((profile) => profile.id),
    );
  }, [jornadas, profiles, servicios, userRoles, servicioById]);


  const technicianOptions = useMemo(
    () =>
      Array.from(activeTechnicianIds)
        .map((id) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [activeTechnicianIds, profileById],
  );

  const validTechnicianIds = (ids: Array<string | null | undefined>) =>
    Array.from(new Set(ids.filter((id): id is string => !!id && activeTechnicianIds.has(id))));

  const validJornadaCrew = (jornada: Jornada) => validTechnicianIds(jornadaCrewIds(jornada));

  const query = q.trim().toLowerCase();
  const factFiltered = useMemo(
    () =>
      facturacion.filter((row) => {
        if (fRubros.length > 0 && !fRubros.includes(concept(row))) return false;
        if (fMarcas.length > 0 && !fMarcas.includes(clasificarMarcaFacturacion(row.grupo))) return false;
        if (fTiposTiempo.length > 0 && !fTiposTiempo.includes(row.tipo_tiempo)) return false;
        if (!query) return true;
        const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
        return (
          cliente.toLowerCase().includes(query) ||
          row.cod_factura.toLowerCase().includes(query) ||
          (row.grupo_fx ?? "").toLowerCase().includes(query) ||
          (row.grupo ?? "").toLowerCase().includes(query)
        );
      }),
    [clienteById, fMarcas, fRubros, fTiposTiempo, facturacion, query],
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
    const periods =
      periodMode === "semana"
        ? Array.from({ length: 8 }, (_, index) => {
            const start = subWeeks(weekStart, 7 - index);
            return { start, end: endOfWeek(start, { weekStartsOn: 1 }), label: `${format(start, "dd/MM")} - ${format(endOfWeek(start, { weekStartsOn: 1 }), "dd/MM")}` };
          })
        : periodMode === "mes"
          ? Array.from({ length: 12 }, (_, index) => {
              const start = startOfMonth(subMonths(monthStart, 11 - index));
              return { start, end: endOfMonth(start), label: format(start, "MM/yyyy") };
            })
          : Array.from({ length: 5 }, (_, index) => {
              const start = startOfYear(subYears(weekStart, 4 - index));
              return { start, end: endOfYear(start), label: format(start, "yyyy") };
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
        return jornada.estado === "Completado" && inRange(jornada.fecha, previousPeriodStart, previousPeriodEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, previousPeriodEnd, previousPeriodStart, query, servicioById],
  );

  const jornadasProgramadas = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, periodStart, periodEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, query, servicioById, periodEnd, periodStart],
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
      const ids = validJornadaCrew(jornada);
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin tecnico", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [activeTechnicianIds, jornadasProgramadas, profileById, servicioById]);

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > 7);
  const selectedTrend = selectedWeek?.variacion ?? null;
  const currentWeekRow = weeklyRows[weeklyRows.length - 1] ?? selectedWeek;
  const previousPeriodRow = weeklyRows[weeklyRows.length - 2];
  const clientesAtendidosSemana = currentWeekRow?.clientes ?? 0;
  const sucursalesConMovimiento = new Set((currentWeekRow?.rows ?? []).map((row) => row.sucursal).filter(Boolean)).size;
  const mixServicioRepuestoTotal = (currentWeekRow?.servicio ?? 0) + (currentWeekRow?.repuestos ?? 0);
  const pctServicio = mixServicioRepuestoTotal > 0 ? Math.round(((currentWeekRow?.servicio ?? 0) / mixServicioRepuestoTotal) * 100) : 0;
  const pctRepuesto = mixServicioRepuestoTotal > 0 ? 100 - pctServicio : 0;

  // KPIs enriquecidos para las cards superiores
  const facturasPeriodo = currentWeekRow?.facturas ?? 0;
  const totalPeriodo = currentWeekRow?.total ?? 0;
  const totalPrevPeriodo = previousPeriodRow?.total ?? 0;
  const variacionTotalPct = pct(totalPeriodo, totalPrevPeriodo);
  const ticketPromedio = facturasPeriodo > 0 ? Math.round(totalPeriodo / facturasPeriodo) : 0;
  const ticketPromedioPrev = (previousPeriodRow?.facturas ?? 0) > 0 ? (previousPeriodRow!.total / previousPeriodRow!.facturas) : 0;
  const variacionTicketPct = pct(ticketPromedio, ticketPromedioPrev);
  const facturasPorCliente = clientesAtendidosSemana > 0 ? facturasPeriodo / clientesAtendidosSemana : 0;
  const tipoFactBreakdown = (() => {
    const groups = { Cliente: 0, Garantia: 0, Interno: 0 } as Record<"Cliente" | "Garantia" | "Interno", number>;
    for (const row of selectedFacts) {
      const k = (row.tipo_tiempo ?? "Cliente") as keyof typeof groups;
      groups[k] = (groups[k] ?? 0) + Number(row.total_venta || 0);
    }
    const totalTF = groups.Cliente + groups.Garantia + groups.Interno;
    const p = (n: number) => (totalTF > 0 ? Math.round((n / totalTF) * 100) : 0);
    return { ...groups, total: totalTF, pctCliente: p(groups.Cliente), pctGarantia: p(groups.Garantia), pctInterno: p(groups.Interno) };
  })();
  const tipoFactDominante = tipoFactBreakdown.pctCliente >= tipoFactBreakdown.pctGarantia && tipoFactBreakdown.pctCliente >= tipoFactBreakdown.pctInterno
    ? { label: "Cliente", value: tipoFactBreakdown.pctCliente }
    : tipoFactBreakdown.pctGarantia >= tipoFactBreakdown.pctInterno
      ? { label: "Garantía", value: tipoFactBreakdown.pctGarantia }
      : { label: "Interno", value: tipoFactBreakdown.pctInterno };
  const top5ClientesPct = (() => {
    const t = topClientes.slice(0, 5).reduce((a, r) => a + r.total, 0);
    return totalPeriodo > 0 ? Math.round((t / totalPeriodo) * 100) : 0;
  })();
  const topSucursalesPct = (() => {
    const top2 = [...factBySucursal].sort((a, b) => b.total - a.total).slice(0, 2).reduce((a, r) => a + r.total, 0);
    return totalPeriodo > 0 ? Math.round((top2 / totalPeriodo) * 100) : 0;
  })();

  const periodoLabel = periodMode === "semana" ? "semanal" : periodMode === "mes" ? "mensual" : "anual";
  const T = useMemo(() => {
    const isSemana = periodMode === "semana";
    const periodoNombre = periodMode === "anio" ? "año" : periodMode;
    return {
      seleccionado: isSemana ? "semana seleccionada" : "periodo seleccionado",
      facturacion: isSemana ? "Facturacion de la semana" : "Facturacion del periodo",
      facturas: isSemana ? "Facturas de la semana" : "Facturas del periodo",
      comparativoFacturacion: `Facturacion por ${periodoNombre}`,
      seleccionaPeriodo: `Selecciona un ${periodoNombre} para ver facturas, clientes y composicion.`,
      periodoSeleccionado: `${periodoNombre.charAt(0).toUpperCase()}${periodoNombre.slice(1)} seleccionado`,
      sinFacturacion: `Sin facturacion para este ${periodoNombre}.`,
      columnaPeriodo: periodMode === "semana" ? "Semana" : periodMode === "mes" ? "Mes" : "Año",
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
      const jornadasPeriodo = trabajoJornadas.filter((j) => inRange(j.fecha, periodStart, periodEnd));
      const realizadasPeriodo = jornadasPeriodo.filter((j) => j.estado === "Completado");
      const pendientesPeriodo = jornadasPeriodo.filter((j) => j.estado === "Pendiente");
      const participantes = new Set<string>();
      for (const jornada of trabajoJornadas) {
        for (const id of validJornadaCrew(jornada)) {
          participantes.add(id);
        }
      }
      const tecnicoIds = Array.from(participantes);
      const horas = realizadas.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
      const horasPeriodo = realizadas
        .filter((row) => inRange(row.fecha, periodStart, periodEnd))
        .reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
      const estado = estadoTrabajoDesdeJornadas(trabajoJornadas, trabajo.estado_general);
      const ultimaFecha = trabajoJornadas.reduce((max, row) => (row.fecha > max ? row.fecha : max), "");
      const ultimaFechaPeriodo = jornadasPeriodo.reduce((max, row) => (row.fecha > max ? row.fecha : max), "");
      const fechaCierre = realizadas.reduce((max, row) => (row.fecha > max ? row.fecha : max), "");
      const pendientesVencidas = pendientes.filter((row) => row.fecha < todayStr).length;
      const pendientesSemana = pendientes.filter((row) => inRange(row.fecha, weekStart, weekEnd)).length;
      const pendientesPeriodoVencidas = pendientesPeriodo.filter((row) => row.fecha < todayStr).length;
      return {
        id: trabajo.id,
        ref: trabajo.codigo ?? "TR",
        cliente,
        descripcion: trabajo.descripcion_problema,
        sucursal: trabajo.sucursal,
        marca: (trabajo.marca ?? servicio?.marca ?? "OTROS") as Marca,
        estado,
        realizadas: realizadas.length,
        pendientes: pendientes.length,
        totalJornadas: trabajoJornadas.length,
        realizadasPeriodo: realizadasPeriodo.length,
        pendientesPeriodo: pendientesPeriodo.length,
        totalJornadasPeriodo: jornadasPeriodo.length,
        participantes: participantes.size,
        tecnicoIds,
        horas,
        horasPeriodo,
        ultimaFecha,
        ultimaFechaPeriodo,
        fechaCierre,
        pendientesVencidas,
        pendientesSemana,
        pendientesPeriodoVencidas,
        tipo: servicio?.marca ?? "",
        creadoEn: (trabajo as any).creado_en ?? null,
        actualizadoEn: (trabajo as any).actualizado_en ?? null,
        jornadaFechas: trabajoJornadas.map((j) => j.fecha).filter(Boolean) as string[],
      };
    });
  }, [activeTechnicianIds, clienteById, jornadasByTrabajo, periodEnd, periodStart, servicioById, trabajosScope, weekEnd, weekStart]);

  const trabajosResumen = useMemo(() => {
    return trabajosBase.filter((row) => {
      if (filtrosTrabajoActivos && fEstadosTrabajo.length > 0 && !fEstadosTrabajo.includes(row.estado)) return false;
      if (filtrosTrabajoActivos && fTecnicos.length > 0 && !row.tecnicoIds.some((id) => fTecnicos.includes(id))) return false;
      if (fMarcas.length > 0 && !fMarcas.includes(row.marca)) return false;
      return true;
    }).sort((a, b) => {
      const order: Record<string, number> = { pausado: 0, iniciado: 1, programado: 2, pendiente: 3, completado: 4 };
      return (order[a.estado] ?? 9) - (order[b.estado] ?? 9) || b.ultimaFecha.localeCompare(a.ultimaFecha);
    });
  }, [trabajosBase, fEstadosTrabajo, fTecnicos, fMarcas, filtrosTrabajoActivos]);


  const trabajosActivos = trabajosResumen.filter((row) => row.estado !== "completado");
  const trabajosConCierre = trabajosResumen.filter((row) => row.estado === "completado").length;
  const tecnicosConActividad = new Set(
    [...jornadasRealizadasPrev, ...jornadasProgramadas].flatMap((j) => validJornadaCrew(j)),
  );
  const tecnicosTotales = activeTechnicianIds.size;

  // Estadísticas de "flujo operativo" basadas en trabajosResumen (respeta los filtros activos de la pestaña Trabajos).
  const flujo = useMemo(() => {
    const total = trabajosResumen.length;
    const culminados = trabajosResumen.filter((r) => r.estado === "completado").length;
    const pausados = trabajosResumen.filter((r) => r.estado === "pausado").length;
    const pendiente = trabajosResumen.filter((r) => r.estado === "pendiente").length;
    const programado = trabajosResumen.filter((r) => r.estado === "programado").length;
    const iniciado = trabajosResumen.filter((r) => r.estado === "iniciado").length;
    const abiertos = total - culminados - pausados;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return { total, culminados, abiertos, pausados, pendiente, programado, iniciado, pct };
  }, [trabajosResumen]);

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

  // Carga por sucursal: clasifica trabajos según lo que ocurrió DENTRO del período.
  // - cerrados: trabajos hoy completados cuya fecha de cierre cae en el período
  // - pausados: trabajos hoy pausados con actividad (jornada/actualizacion) en el período
  // - abiertos: trabajos con actividad en el período que no son cerrados-en-período ni pausados
  const cargaSucursal = useMemo(() => {
    const tieneActividad = (r: typeof trabajosBase[number]) => {
      if (r.creadoEn && inRange(r.creadoEn, periodStart, periodEnd)) return true;
      if (r.actualizadoEn && inRange(r.actualizadoEn, periodStart, periodEnd)) return true;
      if (r.jornadaFechas.some((f) => inRange(f, periodStart, periodEnd))) return true;
      return false;
    };
    const cerradoEnPeriodo = (r: typeof trabajosBase[number]) =>
      r.estado === "completado" && !!r.fechaCierre && inRange(r.fechaCierre, periodStart, periodEnd);

    type Row = { sucursal: Sucursal; cerrados: number; abiertos: number; pausados: number; total: number; pct: number };
    const totalGral = trabajosResumen.reduce((acc, r) => {
      const c = cerradoEnPeriodo(r);
      const enP = tieneActividad(r);
      return acc + (c || enP ? 1 : 0);
    }, 0);

    return SUCURSALES.map<Row>((sucursal) => {
      const rows = trabajosResumen.filter((r) => r.sucursal === sucursal);
      let cerrados = 0, pausados = 0, abiertos = 0;
      for (const r of rows) {
        const cerrEnP = cerradoEnPeriodo(r);
        const actEnP = tieneActividad(r);
        if (cerrEnP) { cerrados++; continue; }
        if (!actEnP) continue;
        if (r.estado === "pausado") pausados++;
        else abiertos++;
      }
      const total = cerrados + pausados + abiertos;
      const pct = totalGral > 0 ? Math.round((total / totalGral) * 100) : 0;
      return { sucursal, cerrados, abiertos, pausados, total, pct };
    })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [trabajosResumen, periodStart, periodEnd]);

  // Distribución por marca en el período (reemplaza "Lectura operativa")
  const cargaMarca = useMemo(() => {
    const tieneActividad = (r: typeof trabajosBase[number]) => {
      if (r.creadoEn && inRange(r.creadoEn, periodStart, periodEnd)) return true;
      if (r.actualizadoEn && inRange(r.actualizadoEn, periodStart, periodEnd)) return true;
      if (r.jornadaFechas.some((f) => inRange(f, periodStart, periodEnd))) return true;
      return false;
    };
    const cerradoEnPeriodo = (r: typeof trabajosBase[number]) =>
      r.estado === "completado" && !!r.fechaCierre && inRange(r.fechaCierre, periodStart, periodEnd);

    const totalGral = trabajosResumen.reduce((acc, r) => acc + (cerradoEnPeriodo(r) || tieneActividad(r) ? 1 : 0), 0);

    return MARCAS.map((marca) => {
      const rows = trabajosResumen.filter((r) => r.marca === marca);
      let cerrados = 0, pausados = 0, abiertos = 0, horas = 0;
      for (const r of rows) {
        const cerrEnP = cerradoEnPeriodo(r);
        const actEnP = tieneActividad(r);
        if (!cerrEnP && !actEnP) continue;
        horas += r.horasPeriodo;
        if (cerrEnP) { cerrados++; continue; }
        if (r.estado === "pausado") pausados++;
        else abiertos++;
      }
      const total = cerrados + pausados + abiertos;
      const pct = totalGral > 0 ? Math.round((total / totalGral) * 100) : 0;
      return { marca, cerrados, abiertos, pausados, total, horas, pct };
    }).sort((a, b) => b.total - a.total);
  }, [trabajosResumen, periodStart, periodEnd]);



  const productividadMatriz = useMemo(() => {
    const bucketMode: "semana" | "mes" = periodMode === "anio" ? "mes" : "semana";
    const bucketKey = (iso: string) => {
      const d = parseISO(iso);
      if (bucketMode === "mes") return format(d, "yyyy-MM");
      return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
    };
    const bucketLabel = (key: string) => {
      if (bucketMode === "mes") {
        const [y, m] = key.split("-");
        return format(new Date(Number(y), Number(m) - 1, 1), "MMM yy");
      }
      const w = key.split("-W")[1];
      return `Sem ${Number(w)}`;
    };

    const bucketsSet = new Set<string>();
    const map = new Map<string, { id: string; nombre: string; porBucket: Record<string, { jornadas: number; horas: number }>; totalJornadas: number; totalHoras: number; trabajos: Set<string> }>();

    // Scope: trabajos visibles tras aplicar filtros de la pestaña Trabajos (estado/técnico/marca).
    const trabajoIdsEnScope = new Set(trabajosResumen.map((t) => t.id));
    // Mapa inverso: servicio_id -> trabajo_id (mismo criterio que jornadasByTrabajo)
    const servicioATrabajo = new Map<string, string>();
    for (const trabajo of trabajos) {
      if (trabajo.legacy_servicio_id) servicioATrabajo.set(trabajo.legacy_servicio_id, trabajo.id);
    }

    for (const jornada of jornadas) {
      // Cancelada no cuenta; Pendiente y Completado sí (jornadas asignadas)
      if (jornada.estado !== "Pendiente" && jornada.estado !== "Completado") continue;
      if (!inRange(jornada.fecha, periodStart, periodEnd)) continue;
      const trabajoId = servicioATrabajo.get(jornada.servicio_id);
      if (!trabajoId || !trabajoIdsEnScope.has(trabajoId)) continue;

      const key = bucketKey(jornada.fecha);
      bucketsSet.add(key);
      // Solo Completado aporta horas reales
      const horasJ = jornada.estado === "Completado" ? Number(jornada.horas_trabajadas || 0) : 0;
      for (const id of validJornadaCrew(jornada)) {
        const current = map.get(id) ?? {
          id,
          nombre: profileById.get(id)?.nombre ?? "Sin tecnico",
          porBucket: {},
          totalJornadas: 0,
          totalHoras: 0,
          trabajos: new Set<string>(),
        };
        const cell = current.porBucket[key] ?? { jornadas: 0, horas: 0 };
        cell.jornadas += 1;
        cell.horas += horasJ;
        current.porBucket[key] = cell;
        current.totalJornadas += 1;
        current.totalHoras += horasJ;
        current.trabajos.add(trabajoId);
        map.set(id, current);
      }
    }

    const buckets = Array.from(bucketsSet).sort();
    const tecnicoFilterSet = filtrosTrabajoActivos && fTecnicos.length > 0 ? new Set(fTecnicos) : null;
    const rowsAll = Array.from(map.values())
      .map((row) => ({
        id: row.id,
        nombre: row.nombre,
        porBucket: row.porBucket,
        totalJornadas: row.totalJornadas,
        totalHoras: row.totalHoras,
        trabajos: row.trabajos.size,
      }))
      .sort((a, b) => b.totalJornadas - a.totalJornadas || b.totalHoras - a.totalHoras);
    const rows = tecnicoFilterSet ? rowsAll.filter((r) => tecnicoFilterSet.has(r.id)) : rowsAll;

    const totalesPorBucket: Record<string, { jornadas: number; horas: number }> = {};
    for (const k of buckets) totalesPorBucket[k] = { jornadas: 0, horas: 0 };
    for (const r of rows) {
      for (const k of buckets) {
        const cell = r.porBucket[k];
        if (cell) {
          totalesPorBucket[k].jornadas += cell.jornadas;
          totalesPorBucket[k].horas += cell.horas;
        }
      }
    }

    return { buckets, rows, totalesPorBucket, bucketLabel, bucketMode };
  }, [jornadas, trabajos, trabajosResumen, fTecnicos, filtrosTrabajoActivos, periodMode, periodStart, periodEnd, profileById]);

  const limpiar = () => {
    setWeekStartInput(initialWeekStart);
    setSelectedWeekKey(initialWeekStart);
    setFSucursales([]);
    setFRubros([]);
    setFMarcas([]);
    setFTiposTiempo([]);
    setFEstadosTrabajo([]);
    setFTecnicos([]);
    setPeriodMode("mes");
    setQ("");
  };

  const filtrosActivos =
    (weekStartInput !== initialWeekStart ? 1 : 0) +
    (fSucursales.length > 0 ? 1 : 0) +
    (fRubros.length > 0 ? 1 : 0) +
    (fMarcas.length > 0 ? 1 : 0) +
    (fTiposTiempo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fEstadosTrabajo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fTecnicos.length > 0 ? 1 : 0) +
    (periodMode !== "mes" ? 1 : 0) +
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
        
      >
        <PeriodSelector value={periodMode} onChange={setPeriodMode} />
        <FilterDate label={periodMode === "anio" ? "Año base" : periodMode === "mes" ? "Mes base" : "Semana base"} value={weekStartInput} onChange={setWeekStartInput} width="w-[150px]" />
        <FilterMultiSelect
          label="Sucursal"
          values={fSucursales}
          onChange={setFSucursales}
          placeholder="Todas"
          width="w-[170px]"
          options={SUCURSALES.map((s) => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Marca"
          values={fMarcas}
          onChange={setFMarcas}
          placeholder="Todas"
          width="w-[170px]"
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
        <FilterMultiSelect
          label="Rubro"
          values={fRubros}
          onChange={setFRubros}
          placeholder="Todos"
          width="w-[170px]"
          options={[
            { value: "Servicio", label: "Servicios" },
            { value: "Repuestos", label: "Repuestos" },
            { value: "Kilometraje", label: "Kilometraje" },
            { value: "Otros", label: "Otros" },
          ]}
        />
        <FilterMultiSelect
          label="Tipo tiempo"
          values={fTiposTiempo}
          onChange={setFTiposTiempo}
          placeholder="Todos"
          width="w-[180px]"
          options={[
            { value: "Cliente", label: "Cliente" },
            { value: "Garantia", label: "Garantia" },
            { value: "Interno", label: "Interno" },
          ]}
        />
        {section === "trabajos" && (
          <>
            <FilterMultiSelect
              label="Estado"
              values={fEstadosTrabajo}
              onChange={setFEstadosTrabajo}
              placeholder="Todos"
              width="w-[170px]"
              options={[
                { value: "pendiente", label: "Pendiente" },
                { value: "programado", label: "Programado" },
                { value: "iniciado", label: "Iniciado" },
                { value: "pausado", label: "Pausado" },
                { value: "completado", label: "Completado" },
              ]}
            />
            <FilterMultiSelect
              label="Tecnico o cuadrilla"
              values={fTecnicos}
              onChange={setFTecnicos}
              placeholder="Todos"
              width="w-[230px]"
              options={technicianOptions.map((row) => ({ value: row.id, label: row.nombre }))}
            />
          </>
        )}
      </FiltersBar>

      <section className="grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={DollarSign}
          title="Facturación del período"
          value={money(totalPeriodo)}
          trend={{ value: variacionTotalPct }}
          footer={`${facturasPeriodo} facturas · ${clientesAtendidosSemana} clientes`}
          tone={(variacionTotalPct ?? 0) < -20 ? "bad" : "neutral"}
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={Users}
          title="Clientes atendidos"
          value={clientesAtendidosSemana}
          detail={`${facturasPorCliente.toFixed(1).replace(".", ",")} facturas por cliente`}
          footer={`Top 5 concentran ${top5ClientesPct}%`}
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={Receipt}
          title="Ticket promedio"
          value={money(ticketPromedio)}
          trend={{ value: variacionTicketPct }}
          footer="Promedio por factura"
          tone={(variacionTicketPct ?? 0) < -10 ? "bad" : "neutral"}
          onClick={() => setSection("facturacion")}
        />
        <SummaryCard
          icon={PieChart}
          title="Tipo de facturación"
          value={`${tipoFactDominante.label} ${tipoFactDominante.value}%`}
          detail={
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Garantía {tipoFactBreakdown.pctGarantia}%</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Interno {tipoFactBreakdown.pctInterno}%</span>
            </span>
          }
          onClick={() => setSection("facturacion")}
        >
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${tipoFactBreakdown.pctCliente}%` }} />
            <div className="h-full bg-blue-500" style={{ width: `${tipoFactBreakdown.pctGarantia}%` }} />
            <div className="h-full bg-amber-500" style={{ width: `${tipoFactBreakdown.pctInterno}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground">Base: {money(tipoFactBreakdown.total)}</div>
        </SummaryCard>
        <SummaryCard
          icon={CheckCircle2}
          title="Flujo operativo"
          value={flujo.total}
          detail="trabajos gestionados"
          footer={`${flujo.culminados} Culminados · ${flujo.abiertos} Abiertos · ${flujo.pausados} Pausados`}
          tone={flujo.pausados > 0 ? "warn" : "neutral"}
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

          <section className="grid auto-rows-fr gap-3 xl:grid-cols-3">
            <Card className="flex h-full flex-col p-3 xl:col-span-2">
              <PanelTitle icon={BarChart3} title="Evolucion de facturacion" subtitle={`Comparativo ${periodoLabel} con seleccion directa.`} />
              <WeeklyBars rows={weeklyRows} activeKey={selectedWeek?.key} onSelect={(key) => { setSelectedWeekKey(key); setSection("facturacion"); }} />
              <div className="mt-2 border-t pt-2">
                <MixRubros
                  row={currentWeekRow}
                  rubroFiltro={fRubros.length === 1 ? fRubros[0] : "all"}
                  onSelect={(rubro) => { setFRubros([rubro]); setSection("facturacion"); }}
                />
              </div>
              <EvolucionKpis rows={weeklyRows} currentKey={currentWeekRow?.key} />
            </Card>

            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Facturacion por sucursal" subtitle="Participacion del periodo seleccionado." />
              <SucursalBars rows={factBySucursal} totalValue={currentWeekRow?.total ?? 0} onSelect={(sucursal) => { setFSucursales([sucursal]); setSection("facturacion"); }} />
            </Card>
          </section>

          <section className="grid auto-rows-fr gap-3 xl:grid-cols-2">
            <Card className="flex h-full flex-col p-3">
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
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={CalendarDays} title={periodMode === "semana" ? "Carga tecnica" : "Carga tecnica del periodo"} subtitle="" />
              <CargaTecnicaMatriz data={productividadMatriz} onClick={() => setSection("trabajos")} />
            </Card>
          </section>

          <section className="grid auto-rows-fr gap-3 xl:grid-cols-2">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Users} title="Clientes atendidos" subtitle="" />
              <ClientesCompacto
                rows={topClientes}
                totalValue={currentWeekRow?.total ?? 0}
                totalFacturas={currentWeekRow?.facturas ?? 0}
                totalClientes={currentWeekRow?.clientes ?? 0}
                onSelect={(nombre) => { setQ(nombre); setSection("facturacion"); }}
              />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="Cerrados, abiertos y pausados dentro del período." />

              <CargaSucursalTabla rows={cargaSucursal} onSelect={(sucursal) => { setFSucursales([sucursal]); setSection("trabajos"); }} />
            </Card>
          </section>

        </TabsContent>

        <TabsContent value="facturacion" className="space-y-3">
          <Card className="flex flex-col p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{T.comparativoFacturacion}</h2>
                <p className="text-xs text-muted-foreground">{T.seleccionaPeriodo}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">{T.periodoSeleccionado}</div>
                <div className="text-lg font-semibold tabular-nums">{loading ? "..." : money(selectedWeek?.total ?? 0)}</div>
                <div className={cn("text-[11px]", selectedTrend != null && selectedTrend < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {selectedTrend == null ? "sin base previa" : `${selectedTrend > 0 ? "+" : ""}${selectedTrend}% vs anterior`}
                </div>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-[88px_repeat(5,minmax(0,1fr))_52px_60px_60px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <div>{T.columnaPeriodo}</div>
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
                      "grid w-full grid-cols-[88px_repeat(5,minmax(0,1fr))_52px_60px_60px] items-center border-t px-3 py-2 text-left text-xs hover:bg-accent",
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
          </Card>

          <Card className="flex flex-col p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{T.facturas}</h2>
              </div>
              <Badge variant="secondary" className="tabular-nums">{selectedFacts.length} lineas</Badge>
            </div>
            <div className="max-h-[420px] overflow-y-auto overflow-x-hidden rounded-md border">
              <div className="grid grid-cols-[72px_minmax(0,1.4fr)_minmax(0,1fr)_110px] md:grid-cols-[72px_104px_minmax(0,1.4fr)_minmax(0,1fr)_110px_104px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <div>Fecha</div>
                <div className="hidden md:block">Factura</div>
                <div>Cliente</div>
                <div>Concepto</div>
                <div className="hidden md:block">Sucursal</div>
                <div className="text-right">Importe</div>
              </div>
              {selectedFacts.length === 0 ? (
                <div className="px-3 py-10 text-center text-xs text-muted-foreground">{T.sinFacturacion}</div>
              ) : (
                selectedFacts.map((row, index) => {
                  const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
                  return (
                    <div key={`${row.cod_factura}-${index}`} className="grid grid-cols-[72px_minmax(0,1.4fr)_minmax(0,1fr)_110px] md:grid-cols-[72px_104px_minmax(0,1.4fr)_minmax(0,1fr)_110px_104px] items-center border-t px-3 py-2 text-xs">
                      <div className="tabular-nums">{format(parseISO(row.fecha), "dd/MM")}</div>
                      <div className="hidden truncate font-mono text-[11px] md:block" title={row.cod_factura}>{row.cod_factura}</div>
                      <div className="truncate font-medium" title={cliente ?? ""}>{cliente}</div>
                      <div className="truncate" title={concept(row)}>{concept(row)}</div>
                      <div className="hidden truncate md:block" title={row.sucursal ?? ""}>{row.sucursal ?? "-"}</div>
                      <div className="text-right font-semibold tabular-nums">{money(Number(row.total_venta || 0))}</div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="trabajos" className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TrabajoChip label="Activos" value={trabajosActivos.length} onClick={() => setFEstadosTrabajo([])} />
            <TrabajoChip label="Cerrados" value={trabajosConCierre} tone="good" onClick={() => setFEstadosTrabajo(["completado"])} />
            <TrabajoChip label="Pausados" value={trabajosPausados.length} tone={trabajosPausados.length ? "warn" : "neutral"} onClick={() => setFEstadosTrabajo(["pausado"])} />
            <TrabajoChip label="Jornadas" value={jornadasRealizadasPrev.length} onClick={() => setFEstadosTrabajo([])} />
            <TrabajoChip label="Tecnicos" value={`${tecnicosConActividad.size}/${tecnicosTotales || "-"}`} onClick={() => setFEstadosTrabajo([])} />
            <span className="ml-1 text-[11px] text-muted-foreground">{trabajosResumen.length} en lista</span>
          </div>

          <section className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={BarChart3} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto flujo={flujo} onSelect={(estado) => setFEstadosTrabajo([estado])} />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="" />
              <CargaSucursalTabla rows={cargaSucursal} onSelect={(sucursal) => setFSucursales([sucursal])} />
            </Card>
          </section>

          <Card className="flex h-full flex-col p-3">
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
                      <div className="text-right tabular-nums">{row.realizadasPeriodo}/{row.totalJornadasPeriodo}</div>
                      <div className="text-right tabular-nums">{row.participantes}</div>
                      <div className="text-right tabular-nums">{row.horasPeriodo.toFixed(1)}</div>
                      <div className="text-right tabular-nums">{row.ultimaFechaPeriodo ? format(parseISO(row.ultimaFechaPeriodo), "dd/MM") : "-"}</div>
                      <div className="text-right text-[11px] text-muted-foreground">
                        {row.pendientesPeriodoVencidas > 0
                          ? `${row.pendientesPeriodoVencidas} vencida${row.pendientesPeriodoVencidas !== 1 ? "s" : ""}`
                          : row.pendientesPeriodo > 0
                            ? `${row.pendientesPeriodo} pendiente${row.pendientesPeriodo !== 1 ? "s" : ""}`
                            : row.totalJornadasPeriodo === 0
                              ? "Sin jornadas"
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
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Users} title="Productividad tecnica" subtitle="" />
              <CargaTecnicaMatriz data={productividadMatriz} />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={BarChart3} title="Distribucion por marca" subtitle="Trabajos con actividad en el periodo" />
              <DistribucionMarca
                data={cargaMarca}
                onSelect={(marca) =>
                  setFMarcas((prev) => (prev.length === 1 && prev[0] === marca ? [] : [marca]))
                }
                selected={fMarcas}
              />
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
  trend,
  children,
  footer,
}: {
  icon: React.ElementType;
  title: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
  onClick: () => void;
  trend?: { value: number | null; suffix?: string } | null;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <button className="h-full rounded-lg text-left" onClick={onClick}>
      <Card className={cn("flex h-full min-h-[128px] flex-col gap-2 p-3 transition-colors hover:bg-accent/50", tone === "bad" && "border-destructive/40 bg-destructive/5", tone === "warn" && "border-amber-300 bg-amber-50/60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
            <div className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</div>
            {trend !== undefined && trend !== null && trend.value !== null ? (
              <div className={cn("mt-1 truncate text-[11px] font-medium tabular-nums", trend.value >= 0 ? "text-emerald-600" : "text-destructive")}>
                {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.suffix ?? "vs período anterior"}
              </div>
            ) : null}
            {detail ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div> : null}
          </div>
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {children ? <div className="mt-auto">{children}</div> : null}
        {footer ? <div className="truncate text-[11px] text-muted-foreground">{footer}</div> : null}
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
          { value: "anio", label: "Año" },
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
              <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{row.total ? money(row.total) : "$ 0"}</span>
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
        Facturacion ($)
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

function MixRubros({
  row,
  rubroFiltro,
  onSelect,
}: {
  row: WeekRow | undefined;
  rubroFiltro: string;
  onSelect?: (rubro: string) => void;
}) {
  if (!row) return <div className="text-xs text-muted-foreground">Sin datos.</div>;
  if (rubroFiltro !== "all") {
    const valor = rubroFiltro === "Repuestos" ? row.repuestos
      : rubroFiltro === "Servicio" ? row.servicio
      : rubroFiltro === "Kilometraje" ? row.kilometraje
      : row.otros;
    return (
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Rubro</div>
            <div className="text-sm font-semibold">{rubroFiltro}</div>
          </div>
          <div className="text-base font-bold tabular-nums">{money(valor)}</div>
        </div>
      </div>
    );
  }
  const items: Array<{ label: string; value: number; bar: string; dot: string }> = [
    { label: "Repuestos", value: row.repuestos, bar: "bg-primary", dot: "bg-primary" },
    { label: "Servicios", value: row.servicio, bar: "bg-sky-500/80", dot: "bg-sky-500" },
    { label: "Kilometraje", value: row.kilometraje, bar: "bg-amber-500/80", dot: "bg-amber-500" },
    { label: "Otros", value: row.otros, bar: "bg-slate-400/80", dot: "bg-slate-400" },
  ];
  const total = row.total || 1;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground">
        <span>Mix del periodo</span>
        <span className="tabular-nums normal-case text-foreground/70">{money(row.total)}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {items.map((it) => it.value > 0 && (
          <button
            key={it.label}
            onClick={() => onSelect?.(it.label === "Servicios" ? "Servicio" : it.label)}
            className={cn("h-full transition-opacity hover:opacity-80", it.bar)}
            style={{ width: `${(it.value / total) * 100}%` }}
            title={`${it.label}: ${money(it.value)} (${Math.round((it.value / total) * 100)}%)`}
            aria-label={`${it.label} ${it.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((it) => {
          const pct = Math.round((it.value / total) * 100);
          return (
            <button
              key={it.label}
              onClick={() => onSelect?.(it.label === "Servicios" ? "Servicio" : it.label)}
              className="flex items-center gap-1.5 text-[11px] hover:text-primary"
            >
              <span className={cn("h-2 w-2 rounded-full", it.dot)} />
              <span className="font-medium">{it.label}</span>
              <span className="tabular-nums text-muted-foreground">{money(it.value)}</span>
              <span className="tabular-nums text-muted-foreground">({pct}%)</span>
            </button>
          );
        })}
      </div>
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

  // Donut SVG geometry
  const size = 132;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const activeSegs = segs.filter((s) => s.value > 0);
  const segColors: Record<string, string> = {
    completado: "hsl(var(--primary))",
    iniciado: "hsl(199 89% 48%)",
    pausado: "hsl(38 92% 50%)",
  };
  let offsetAcc = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
            {activeSegs.map((s) => {
              const frac = s.value / flujo.total;
              const dash = circumference * frac;
              const gap = circumference - dash;
              const el = (
                <circle
                  key={s.key}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={segColors[s.key]}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={-offsetAcc}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onClick={() => onSelect(s.key)}
                >
                  <title>{`${s.label}: ${s.value} (${s.pct}%)`}</title>
                </circle>
              );
              offsetAcc += dash;
              return el;
            })}
          </svg>
          <button
            onClick={() => onSelect("all")}
            className="absolute inset-0 flex flex-col items-center justify-center hover:text-primary"
          >
            <span className="text-2xl font-bold tabular-nums leading-none">{flujo.total}</span>
            <span className="mt-0.5 text-[10px] uppercase text-muted-foreground">gestionados</span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {segs.map((s) => (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/60"
            >
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                <span className="font-medium">{s.label}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="font-semibold">{s.value}</span>
                <span className="w-9 text-right text-[11px] text-muted-foreground">{s.pct}%</span>
              </span>
            </button>
          ))}
        </div>
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

function DistribucionMarca({
  data,
  onSelect,
  selected,
}: {
  data: Array<{ marca: Marca; cerrados: number; abiertos: number; pausados: number; total: number; horas: number; pct: number }>;
  onSelect: (marca: Marca) => void;
  selected: string[];
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const totales = data.reduce(
    (acc, d) => ({
      cerrados: acc.cerrados + d.cerrados,
      abiertos: acc.abiertos + d.abiertos,
      pausados: acc.pausados + d.pausados,
      total: acc.total + d.total,
      horas: acc.horas + d.horas,
    }),
    { cerrados: 0, abiertos: 0, pausados: 0, total: 0, horas: 0 },
  );
  if (totales.total === 0) {
    return <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin actividad por marca en el periodo.</div>;
  }
  const PALETAS: Record<Marca, { abiertos: string; pausados: string; cerrados: string; dot: string }> = {
    CLAAS: { abiertos: "#7BC58A", pausados: "#2E9F4F", cerrados: "#00853E", dot: "#00853E" },
    HORSCH: { abiertos: "#F4A6A6", pausados: "#E64545", cerrados: "#E2001A", dot: "#E2001A" },
    OTROS: { abiertos: "#9CA3AF", pausados: "#6B7280", cerrados: "#374151", dot: "#6B7280" },
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {data.map((d) => {
          const isActive = selected.length === 1 && selected[0] === d.marca;
          const widthAbiertos = d.total > 0 ? (d.abiertos / max) * 100 : 0;
          const widthPausados = d.total > 0 ? (d.pausados / max) * 100 : 0;
          const widthCerrados = d.total > 0 ? (d.cerrados / max) * 100 : 0;
          const pal = PALETAS[d.marca] ?? PALETAS.OTROS;
          return (
            <button
              key={d.marca}
              onClick={() => onSelect(d.marca)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition hover:bg-accent",
                isActive && "border-primary bg-accent/40",
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pal.dot }} />
                  <span className="font-semibold">{d.marca}</span>
                  <span className="text-[11px] text-muted-foreground">{d.pct}%</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums text-[11px] text-muted-foreground">
                  <span>{d.horas.toFixed(1)} h</span>
                  <span className="font-semibold text-foreground">{d.total}</span>
                </div>
              </div>
              <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full" style={{ width: `${widthAbiertos}%`, backgroundColor: pal.abiertos }} title={`Abiertos: ${d.abiertos}`} />
                <div className="h-full" style={{ width: `${widthPausados}%`, backgroundColor: pal.pausados }} title={`Pausados: ${d.pausados}`} />
                <div className="h-full" style={{ width: `${widthCerrados}%`, backgroundColor: pal.cerrados }} title={`Cerrados: ${d.cerrados}`} />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-muted-foreground tabular-nums">
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.abiertos }} />Abiertos {d.abiertos}</span>
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.pausados }} />Pausados {d.pausados}</span>
                <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ backgroundColor: pal.cerrados }} />Cerrados {d.cerrados}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">Total periodo</span>
        <div className="flex items-center gap-3">
          <span>Abiertos {totales.abiertos}</span>
          <span>Pausados {totales.pausados}</span>
          <span>Cerrados {totales.cerrados}</span>
          <span>{totales.horas.toFixed(1)} h</span>
          <span className="font-semibold text-foreground">{totales.total}</span>
        </div>
      </div>
    </div>
  );
}

function CargaTecnicaMatriz({
  data, onClick,
}: {
  data: {
    buckets: string[];
    rows: Array<{ id: string; nombre: string; porBucket: Record<string, { jornadas: number; horas: number }>; totalJornadas: number; totalHoras: number; trabajos: number }>;
    totalesPorBucket: Record<string, { jornadas: number; horas: number }>;
    bucketLabel: (k: string) => string;
    bucketMode: "semana" | "mes";
  };
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [metrica, setMetrica] = useState<"servicios" | "horas">("servicios");
  const { buckets, rows, totalesPorBucket, bucketLabel, bucketMode } = data;

  const fmt = (v: number) => metrica === "horas" ? (v ? v.toFixed(1) : "-") : (v ? String(v) : "-");
  const getVal = (cell: { jornadas: number; horas: number } | undefined) =>
    cell ? (metrica === "horas" ? cell.horas : cell.jornadas) : 0;

  const COLLAPSED = 6;
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);

  const totalGeneral = rows.reduce((acc, r) => acc + (metrica === "horas" ? r.totalHoras : r.totalJornadas), 0);

  // Grid: nombre flexible | columnas semana/mes | total
  const colWidth = 56;
  const gridCols = `minmax(120px,1fr) repeat(${buckets.length}, ${colWidth}px) 64px`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
          <button
            type="button"
            onClick={() => setMetrica("servicios")}
            className={cn("px-2 py-1", metrica === "servicios" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
          >
            Servicios asignados

          </button>
          <button
            type="button"
            onClick={() => setMetrica("horas")}
            className={cn("px-2 py-1 border-l", metrica === "horas" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
          >
            Horas trabajadas
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Total: {metrica === "horas" ? `${totalGeneral.toFixed(1)} hs` : `${totalGeneral} serv.`}
        </div>
      </div>

      {rows.length === 0 || buckets.length === 0 ? (
        <div className="rounded-md border px-3 py-6 text-center text-xs text-muted-foreground">Sin datos para los filtros seleccionados.</div>
      ) : (
        <>
          <div className={cn("overflow-auto rounded-md border", expanded ? "max-h-[440px]" : "max-h-[280px]")}>
            <div
              className="sticky top-0 z-10 grid bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div>Tecnico</div>
              {buckets.map((k) => (
                <div key={k} className="text-right tabular-nums">{bucketLabel(k)}</div>
              ))}
              <div className="text-right">Total</div>
            </div>
            {visible.map((r) => (
              <button
                key={r.id}
                onClick={onClick}
                className="grid w-full items-center border-t px-3 py-2 text-left text-xs hover:bg-accent"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="truncate font-medium">{r.nombre}</div>
                {buckets.map((k) => (
                  <div key={k} className="text-right tabular-nums text-foreground/80">
                    {fmt(getVal(r.porBucket[k]))}
                  </div>
                ))}
                <div className="text-right font-semibold tabular-nums">
                  {metrica === "horas" ? r.totalHoras.toFixed(1) : r.totalJornadas}
                </div>
              </button>
            ))}
            <div
              className="grid border-t bg-muted/40 px-3 py-2 text-[11px] font-semibold"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="text-muted-foreground">Total</div>
              {buckets.map((k) => (
                <div key={k} className="text-right tabular-nums">
                  {metrica === "horas" ? (totalesPorBucket[k]?.horas ?? 0).toFixed(1) : (totalesPorBucket[k]?.jornadas ?? 0)}
                </div>
              ))}
              <div className="text-right tabular-nums">
                {metrica === "horas" ? totalGeneral.toFixed(1) : totalGeneral}
              </div>
            </div>
          </div>
          {rows.length > COLLAPSED && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="w-full rounded-md border px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent"
            >
              {expanded ? "Ver menos" : `Ver todos (${rows.length})`}
            </button>
          )}
          <div className="text-[10px] text-muted-foreground">
            Agrupado por {bucketMode === "mes" ? "mes" : "semana ISO"} · servicios = jornadas asignadas (pendientes + completadas); horas = solo completadas
          </div>
        </>
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


