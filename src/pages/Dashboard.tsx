import { startTransition, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterDate } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  Activity,
  PieChart,
  Receipt,
  Users,
} from "lucide-react";
import {
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import { MARCAS, SUCURSALES, DIAS_JORNADA_VENCIDA, MAX_TOP_RANKING, type Marca, type Sucursal } from "@/lib/constants";
import { estadoTrabajoDesdeJornadas, estadoTrabajoLabel, type EstadoTrabajo } from "@/lib/trabajos";
import { clasificarMarcaFacturacion } from "@/lib/facturacionReglas";
import { cn } from "@/lib/utils";
import { DashboardKPISkeleton } from "@/components/LoadingSkeletons";
import { pageTitle } from "@/lib/ui-classes";
import { TrabajoEstadoBadge } from "@/components/StatusBadges";
import type { WeekRow, Facturacion, FactMetric, OSMetric, OSImpactRow, OSRubro } from "@/components/dashboard/types";
import { money, pct, concept, total, weekMetric, comparisonWeekMetric, metricUnavailable, formatWeekMetric, factMetricLabel, formatOSMetric, osMetricValue, osRubroValue, summarizeOSImpact } from "@/components/dashboard/utils";
import { SummaryCard, FactPeriodsMobile, FacturasMobile, PanelTitle, FactMetricSwitch, OSMetricSwitch, PeriodSelector } from "@/components/dashboard/DashboardPanels";
import { WeeklyBars, SucursalBars, MixRubros, EvolucionKpis, EstadoCompacto, CargaSucursalTabla, CargaTecnicaMatriz, ClientesCompacto, OSImpactSection, TrabajoChip, DistribucionMarca } from "@/components/dashboard/DashboardCharts";

const PAGE = 1000;
const MAX_FACTURAS_RENDER = 350;
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

interface OrdenServicioImportada {
  os_numero: string;
  trabajo_id: string | null;
  cliente_nombre: string | null;
  fecha_abierta_os: string | null;
  factura: string | null;
  marca: string | null;
  problema: string | null;
  tipo_tiempo: string | null;
  servicios_cantidad: number | null;
  servicios_valor: number | null;
  repuesto_valor: number | null;
  km_cantidad: number | null;
  kilometro_valor: number | null;
  terceros_valor: number | null;
  situacion_os: string | null;
  situacion_facturacion: string | null;
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
  if (!date) return false;
  const key = date.slice(0, 10);
  return key >= dateKey(start) && key <= dateKey(end);
}

function parseQuantity(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function rawQuantity(rawData: Record<string, unknown> | null | undefined) {
  if (!rawData) return 0;
  return parseQuantity(
    rawData["Cant. Unit."] ??
      rawData["Cant Unit"] ??
      rawData["Cantidad"] ??
      rawData["cantidad"],
  );
}

function applyOSRubros(row: OSImpactRow, rubros: OSRubro[]): OSImpactRow {
  if (rubros.length === 0) return row;
  const includeServicio = rubros.includes("Servicio");
  const includeRepuestos = rubros.includes("Repuestos");
  const includeKilometraje = rubros.includes("Kilometraje");
  const servicios = includeServicio ? row.servicios : 0;
  const repuestos = includeRepuestos ? row.repuestos : 0;
  const kilometraje = includeKilometraje ? row.kilometraje : 0;
  return {
    ...row,
    servicios,
    repuestos,
    kilometraje,
    horas: includeServicio ? row.horas : 0,
    km: includeKilometraje ? row.km : 0,
    total: servicios + repuestos + kilometraje,
  };
}

function osEstaCerrada(row: OrdenServicioImportada) {
  return String(row.situacion_os ?? "").toUpperCase().includes("CERRAD");
}

function normalizeOSLookup(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function osTipoAbsorbido(row: OrdenServicioImportada): OSImpactRow["tipo"] | null {
  const tipoTiempo = normalizeOSLookup(row.tipo_tiempo);
  if (tipoTiempo.includes("GARANT")) return "Garantia";
  if (
    tipoTiempo.includes("INTERNO") ||
    tipoTiempo.includes("ABSOR") ||
    tipoTiempo.includes("ABZOR") ||
    tipoTiempo.includes("CDM")
  ) {
    return "Interno";
  }
  return null;
}

function marcaDesdeOS(marca: string | null | undefined): Marca {
  const normalized = String(marca ?? "").toUpperCase();
  if (normalized.includes("CLAAS")) return "CLAAS";
  if (normalized.includes("HORSCH")) return "HORSCH";
  return "OTROS";
}

function normalizeClienteKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\bS\.?A\.?(C\.?I\.?)?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const [ordenesServicio, setOrdenesServicio] = useState<OrdenServicioImportada[]>([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [jornadasLoading, setJornadasLoading] = useState(true);
  const [facturacionLoading, setFacturacionLoading] = useState(true);
  const [ordenesLoading, setOrdenesLoading] = useState(true);

  const [weekStartInput, setWeekStartInput] = useState(initialWeekStart);
  const [selectedWeekKey, setSelectedWeekKey] = useState(initialWeekStart);
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fRubros, setFRubros] = useState<string[]>([]);
  const [fOSRubros, setFOSRubros] = useState<OSRubro[]>([]);
  const [fMarcas, setFMarcas] = useState<string[]>([]);
  const [fTiposTiempo, setFTiposTiempo] = useState<string[]>([]);
  const [fEstadosTrabajo, setFEstadosTrabajo] = useState<string[]>([]);
  const [fTecnicos, setFTecnicos] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<"semana" | "mes" | "anio">("mes");
  const [q, setQ] = useState("");
  const [section, setSection] = useState("resumen");
  const [rangoEvolucion, setRangoEvolucion] = useState<"4" | "6" | "8" | "12" | "24" | "all">("12");
  const [factMetric, setFactMetric] = useState<FactMetric>("usd");
  const [osMetric, setOsMetric] = useState<OSMetric>("usd");
  const [osDetailMode, setOsDetailMode] = useState<"os" | "cliente">("os");
  const [showAllMobileTrabajos, setShowAllMobileTrabajos] = useState(false);
  const loading = baseLoading || jornadasLoading || facturacionLoading;
  const filtrosTrabajoActivos = section === "trabajos";
  const filtrosOSActivos = section === "os";
  const goSection = (value: string) =>
    startTransition(() => {
      setSection(value);
      if (value === "os") {
        setFRubros([]);
      } else {
        setFOSRubros([]);
      }
    });

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
  const nextPeriodStart = useMemo(() => {
    if (periodMode === "anio") return startOfYear(addYears(weekStart, 1));
    if (periodMode === "mes") return startOfMonth(addMonths(weekStart, 1));
    return startOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 });
  }, [periodMode, weekStart]);
  const nextPeriodEnd = useMemo(() => {
    if (periodMode === "anio") return endOfYear(nextPeriodStart);
    if (periodMode === "mes") return endOfMonth(nextPeriodStart);
    return endOfWeek(nextPeriodStart, { weekStartsOn: 1 });
  }, [nextPeriodStart, periodMode]);
  const evolutionPeriods = useMemo(() => {
    if (periodMode === "anio") return 5;
    if (rangoEvolucion === "all") return periodMode === "semana" ? 26 : 60;
    return Number(rangoEvolucion);
  }, [periodMode, rangoEvolucion]);
  const firstComparisonWeek = useMemo(() => subWeeks(weekStart, Math.max(evolutionPeriods - 1, 0)), [evolutionPeriods, weekStart]);
  const visibleQueryStart = useMemo(() => {
    if (periodMode === "anio") return subYears(yearStart, 4);
    if (periodMode === "mes") return subMonths(monthStart, Math.max(evolutionPeriods - 1, 0));
    return firstComparisonWeek;
  }, [evolutionPeriods, firstComparisonWeek, monthStart, periodMode, yearStart]);
  const queryStart = useMemo(() => subYears(visibleQueryStart, 1), [visibleQueryStart]);
  const queryEnd = useMemo(() => periodEnd, [periodEnd]);

  useEffect(() => {
    setSelectedWeekKey(dateKey(periodMode === "anio" ? yearStart : periodMode === "semana" ? weekStart : monthStart));
  }, [monthStart, periodMode, weekStart, yearStart]);

  useEffect(() => {
    if (periodMode === "semana" && !["4", "8", "12", "all"].includes(rangoEvolucion)) {
      setRangoEvolucion("8");
    }
    if (periodMode === "mes" && !["6", "12", "24", "all"].includes(rangoEvolucion)) {
      setRangoEvolucion("12");
    }
  }, [periodMode, rangoEvolucion]);

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
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Error cargando datos del dashboard: ${msg}`);
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
            .lte("fecha", dateKey(new Date(Math.max(weekEnd.getTime(), periodEnd.getTime(), nextPeriodEnd.getTime()))))
            .order("fecha", { ascending: true }),
        );

        if (alive) setJornadas(jornadasRows);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Error cargando jornadas: ${msg}`);
      } finally {
        if (alive) setJornadasLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [nextPeriodEnd, previousWeekStart, weekEnd, periodStart, periodEnd, previousPeriodStart]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setFacturacionLoading(true);
      try {
        const cargarFacturacionHistorica = async () => {
          const build = (cols: string) =>
            supabase
              .from("facturacion")
              .select(cols)
              .gte("fecha", dateKey(queryStart))
              .lte("fecha", dateKey(queryEnd))
              .order("fecha", { ascending: false });

          try {
            return await cargarTodo<Facturacion>(
              build("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, cantidad, grupo, grupo_fx, cod_factura") as any,
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes("cantidad")) throw error;
            const rows = await cargarTodo<Omit<Facturacion, "cantidad">>(
              build("fecha, sucursal, tipo, cliente_id, entidad_nombre, total_venta, grupo, grupo_fx, cod_factura") as any,
            );
            return rows.map((row) => ({ ...row, cantidad: 0 }));
          }
        };


        const gridQuery = (supabase
          .from("facturacion_lineas_importadas" as any)
          .select(
            "fecha_factura, sucursal, tipo_facturacion, entidad_nombre, total_venta, cantidad, raw_data, subgrupo_original, grupo_normalizado, factura, codigo_interno_factura, tipo_tiempo, origen_sistema",
          )
          .gte("fecha_factura", dateKey(queryStart))
          .lte("fecha_factura", `${dateKey(queryEnd)}T23:59:59`)
          .eq("origen_sistema", "grid_campos")
          .order("fecha_factura", { ascending: false }) as any);

        const [legacyRows, gridRowsRaw] = await Promise.all([
          cargarFacturacionHistorica(),
          cargarTodo<any>(gridQuery),
        ]);

        const gridCamposYears = new Set(
          gridRowsRaw
            .map((row) => String(row.fecha_factura ?? "").slice(0, 4))
            .filter(Boolean),
        );
        const legacyRowsNormalizados = legacyRows
          .filter((row) => {
            const esCampos = row.entidad_nombre.toUpperCase().includes("CAMPOS DEL MA");
            const year = row.fecha.slice(0, 4);
            return !esCampos || !gridCamposYears.has(year);
          })
          .map((row) => ({
            ...row,
            cantidad: Number((row as any).cantidad || 0),
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
            cantidad: Number(row.cantidad || 0) || rawQuantity(row.raw_data),
            grupo: row.subgrupo_original ?? row.grupo_normalizado ?? null,
            grupo_fx: row.grupo_normalizado ?? null,
            cod_factura: factura,
            tipo_tiempo: (row.tipo_tiempo ?? "Cliente") as Facturacion["tipo_tiempo"],
            origen_sistema: row.origen_sistema ?? "grid_campos",
            raw_data: row.raw_data ?? null,
          };
        });

        if (alive) setFacturacion([...legacyRowsNormalizados, ...gridRows]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Error cargando facturación: ${msg}`);
      } finally {
        if (alive) setFacturacionLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [queryEnd, queryStart]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setOrdenesLoading(true);
      try {
        const rows = await cargarTodo<OrdenServicioImportada>(
          (supabase
            .from("ordenes_servicio_importadas" as any)
            .select("os_numero, trabajo_id, cliente_nombre, fecha_abierta_os, factura, marca, problema, tipo_tiempo, servicios_cantidad, servicios_valor, repuesto_valor, km_cantidad, kilometro_valor, terceros_valor, situacion_os, situacion_facturacion")
            .gte("fecha_abierta_os", dateKey(queryStart))
            .lte("fecha_abierta_os", `${dateKey(queryEnd)}T23:59:59`)
            .order("fecha_abierta_os", { ascending: false }) as any),
        );
        if (alive) setOrdenesServicio(rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("ordenes_servicio_importadas")) {
          toast.error(`Error cargando órdenes de servicio: ${message}`);
        }
        if (alive) setOrdenesServicio([]);
      } finally {
        if (alive) setOrdenesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [queryEnd, queryStart]);

  const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);
  const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);
  const clienteByName = useMemo(() => new Map(clientes.map((item) => [normalizeClienteKey(item.nombre), item])), [clientes]);
  const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const trabajoById = useMemo(() => new Map(trabajos.map((item) => [item.id, item])), [trabajos]);
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
        if (fSucursales.length > 0 && (!row.sucursal || !fSucursales.includes(row.sucursal))) return false;
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
    [clienteById, fMarcas, fRubros, fSucursales, fTiposTiempo, facturacion, query],
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

  const osImpactRows = useMemo<OSImpactRow[]>(() => {
    return ordenesServicio
      .map((row) => {
        if (!row.fecha_abierta_os || !osEstaCerrada(row)) return null;
        const tipo = osTipoAbsorbido(row);
        if (!tipo) return null;
        const trabajo = row.trabajo_id ? trabajoById.get(row.trabajo_id) : null;
        const clienteTrabajo = trabajo?.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre : null;
        const cliente = clienteTrabajo ?? row.cliente_nombre ?? "Sin cliente";
        const clienteMatched = clienteByName.get(normalizeClienteKey(cliente));
        const sucursal = trabajo?.sucursal ?? clienteMatched?.sucursal ?? null;
        const marca = (trabajo?.marca ?? marcaDesdeOS(row.marca)) as Marca;
        const servicios = Number(row.servicios_valor || 0);
        const repuestos = Number(row.repuesto_valor || 0);
        const kilometraje = Number(row.kilometro_valor || 0);
        const terceros = Number(row.terceros_valor || 0);
        return {
          os: row.os_numero,
          cliente,
          fecha: String(row.fecha_abierta_os).slice(0, 10),
          sucursal,
          marca,
          tipo,
          situacionFacturacion: row.situacion_facturacion ?? "",
          problema: row.problema ?? trabajo?.descripcion_problema ?? "",
          factura: row.factura ?? "",
          horas: Number(row.servicios_cantidad || 0),
          km: Number(row.km_cantidad || 0),
          servicios,
          repuestos,
          kilometraje,
          terceros,
          total: servicios + repuestos + kilometraje,
        };
      })
      .filter((row): row is OSImpactRow => {
        if (!row) return false;
        if (fSucursales.length > 0 && (!row.sucursal || !fSucursales.includes(row.sucursal))) return false;
        if (fMarcas.length > 0 && !fMarcas.includes(row.marca)) return false;
        if (fTiposTiempo.length > 0) {
          const tipoFiltro = row.tipo;
          if (!fTiposTiempo.includes(tipoFiltro) && !fTiposTiempo.includes(row.tipo)) return false;
        }
        if (fOSRubros.length > 0) {
          const hasRubro = fOSRubros.some((rubro) => osRubroValue(row, rubro) > 0);
          if (!hasRubro) return false;
        }
        if (!query) return true;
        const hay = [
          row.os,
          row.factura,
          row.cliente,
          row.problema,
          row.sucursal ?? "",
          row.marca,
          row.tipo,
          row.situacionFacturacion,
        ].join(" ").toLowerCase();
        return hay.includes(query);
      })
      .map((row) => applyOSRubros(row, fOSRubros));
  }, [clienteById, clienteByName, fMarcas, fOSRubros, fSucursales, fTiposTiempo, ordenesServicio, query, trabajoById]);

  const weeklyRows = useMemo<WeekRow[]>(() => {
    const periods =
      periodMode === "semana"
        ? Array.from({ length: evolutionPeriods }, (_, index) => {
            const start = subWeeks(weekStart, evolutionPeriods - 1 - index);
            return { start, end: endOfWeek(start, { weekStartsOn: 1 }), label: `${format(start, "dd/MM")} - ${format(endOfWeek(start, { weekStartsOn: 1 }), "dd/MM")}` };
          })
        : periodMode === "mes"
          ? Array.from({ length: evolutionPeriods }, (_, index) => {
              const start = startOfMonth(subMonths(monthStart, evolutionPeriods - 1 - index));
              return { start, end: endOfMonth(start), label: format(start, "MM/yyyy") };
            })
          : Array.from({ length: 5 }, (_, index) => {
              const start = startOfYear(subYears(weekStart, 4 - index));
              return { start, end: endOfYear(start), label: format(start, "yyyy") };
            });

    const comparisonForPeriod = (start: Date, end: Date) => {
      if (periodMode === "anio") {
        const comparisonStart = startOfYear(subYears(start, 1));
        const comparisonEnd = new Date(start.getFullYear() - 1, weekStart.getMonth(), weekStart.getDate());
        return {
          start: comparisonStart,
          end: comparisonEnd > endOfYear(comparisonStart) ? endOfYear(comparisonStart) : comparisonEnd,
        };
      }
      return { start: subYears(start, 1), end: subYears(end, 1) };
    };

    const rows = periods.map(({ start, end, label }) => {
      const weekFacts = factFiltered.filter((row) => inRange(row.fecha, start, end));
      const comparisonRange = comparisonForPeriod(start, end);
      const comparisonFacts = factFiltered.filter((row) => inRange(row.fecha, comparisonRange.start, comparisonRange.end));
      const byConcept = {
        Repuestos: 0,
        Servicio: 0,
        Kilometraje: 0,
        Otros: 0,
      };
      let horasServicio = 0;
      let kmFacturados = 0;
      let comparisonHorasServicio = 0;
      let comparisonKmFacturados = 0;

      for (const row of weekFacts) {
        const rowConcept = concept(row);
        byConcept[rowConcept] += Number(row.total_venta || 0);
        if (rowConcept === "Servicio") horasServicio += Number(row.cantidad || 0);
        if (rowConcept === "Kilometraje") kmFacturados += Number(row.cantidad || 0);
      }

      for (const row of comparisonFacts) {
        const rowConcept = concept(row);
        if (rowConcept === "Servicio") comparisonHorasServicio += Number(row.cantidad || 0);
        if (rowConcept === "Kilometraje") comparisonKmFacturados += Number(row.cantidad || 0);
      }

      const clients = new Set(weekFacts.map((row) => {
        const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
        return normalizeClienteKey(nombre);
      }));
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
        horasServicio,
        kmFacturados,
        facturas: invoices.size,
        clientes: clients.size,
        comparisonTotal: total(comparisonFacts),
        comparisonHorasServicio,
        comparisonKmFacturados,
        comparisonLabel: periodMode === "anio"
          ? `${format(comparisonRange.start, "yyyy")} acum. ${format(comparisonRange.end, "dd/MM")}`
          : periodMode === "mes"
            ? format(comparisonRange.start, "MM/yyyy")
            : `${format(comparisonRange.start, "dd/MM")} - ${format(comparisonRange.end, "dd/MM/yyyy")}`,
        variacion: null,
        rows: weekFacts,
      };
    });

    return rows.map((row, index) => ({
      ...row,
      variacion: index === 0 ? null : pct(row.total, rows[index - 1].total),
    }));
  }, [evolutionPeriods, factFiltered, monthStart, periodMode, weekStart]);

  const selectedWeek = weeklyRows.find((row) => row.key === selectedWeekKey) ?? weeklyRows[weeklyRows.length - 1];
  const selectedFacts = selectedWeek?.rows ?? [];
  const visibleSelectedFacts = useMemo(() => selectedFacts.slice(0, MAX_FACTURAS_RENDER), [selectedFacts]);

  const comparisonRange = useMemo(() => {
    if (!selectedWeek) return null;
    if (periodMode === "anio") {
      const start = startOfYear(subYears(selectedWeek.start, 1));
      const cut = new Date(selectedWeek.start.getFullYear() - 1, weekStart.getMonth(), weekStart.getDate());
      const end = cut > endOfYear(start) ? endOfYear(start) : cut;
      return { start, end };
    }
    return {
      start: subYears(selectedWeek.start, 1),
      end: subYears(selectedWeek.end, 1),
    };
  }, [periodMode, selectedWeek, weekStart]);

  const comparisonFacts = useMemo(
    () => comparisonRange ? factFiltered.filter((row) => inRange(row.fecha, comparisonRange.start, comparisonRange.end)) : [],
    [comparisonRange, factFiltered],
  );

  const comparisonLabel = comparisonRange
    ? periodMode === "anio"
      ? `${format(comparisonRange.start, "yyyy")} acum. ${format(comparisonRange.end, "dd/MM")}`
      : periodMode === "mes"
        ? format(comparisonRange.start, "MM/yyyy")
        : `${format(comparisonRange.start, "dd/MM")} - ${format(comparisonRange.end, "dd/MM/yyyy")}`
    : undefined;

  const osEvolutionRows = useMemo(
    () => weeklyRows.map((period) => summarizeOSImpact(
      osImpactRows.filter((row) => inRange(row.fecha, period.start, period.end)),
      period.key,
      period.label,
      period.start,
      period.end,
    )),
    [osImpactRows, weeklyRows],
  );
  const osSelectedPeriod = useMemo(() => {
    const current = osEvolutionRows.find((row) => row.key === selectedWeekKey);
    if (current && current.osCount > 0) return current;
    return [...osEvolutionRows].reverse().find((row) => row.osCount > 0) ?? current ?? osEvolutionRows[osEvolutionRows.length - 1];
  }, [osEvolutionRows, selectedWeekKey]);
  const osComparisonRange = useMemo(() => {
    if (!osSelectedPeriod) return null;
    if (periodMode === "anio") {
      const start = startOfYear(subYears(osSelectedPeriod.start, 1));
      const cut = new Date(osSelectedPeriod.start.getFullYear() - 1, weekStart.getMonth(), weekStart.getDate());
      const end = cut > endOfYear(start) ? endOfYear(start) : cut;
      return { start, end };
    }
    return { start: subYears(osSelectedPeriod.start, 1), end: subYears(osSelectedPeriod.end, 1) };
  }, [osSelectedPeriod, periodMode, weekStart]);
  const osSelectedRows = useMemo(
    () => (osSelectedPeriod ? osImpactRows.filter((row) => inRange(row.fecha, osSelectedPeriod.start, osSelectedPeriod.end)) : []),
    [osImpactRows, osSelectedPeriod],
  );
  const osComparisonRows = useMemo(
    () => osComparisonRange ? osImpactRows.filter((row) => inRange(row.fecha, osComparisonRange.start, osComparisonRange.end)) : [],
    [osComparisonRange, osImpactRows],
  );
  const osSelectedSummary = useMemo(
    () => summarizeOSImpact(
      osSelectedRows,
      osSelectedPeriod?.key ?? "",
      osSelectedPeriod?.label ?? "",
      osSelectedPeriod?.start ?? periodStart,
      osSelectedPeriod?.end ?? periodEnd,
    ),
    [osSelectedRows, osSelectedPeriod, periodEnd, periodStart],
  );
  const osAccumulatedSummary = useMemo(() => {
    const first = osEvolutionRows[0];
    const last = osEvolutionRows[osEvolutionRows.length - 1];
    if (!first || !last) return summarizeOSImpact([], "acumulado", "Acumulado", periodStart, periodEnd);
    const rows = osImpactRows.filter((row) => inRange(row.fecha, first.start, last.end));
    return summarizeOSImpact(rows, "acumulado", "Acumulado visible", first.start, last.end);
  }, [osEvolutionRows, osImpactRows, periodEnd, periodStart]);
  const osBySucursal = useMemo(() => {
    return SUCURSALES.map((sucursal) => {
      const rows = osSelectedRows.filter((row) => row.sucursal === sucursal);
      const previousRows = osComparisonRows.filter((row) => row.sucursal === sucursal);
      return {
        sucursal,
        rows: rows.length,
        total: rows.reduce((acc, row) => acc + row.total, 0),
        horas: rows.reduce((acc, row) => acc + row.horas, 0),
        km: rows.reduce((acc, row) => acc + row.km, 0),
        previousTotal: previousRows.reduce((acc, row) => acc + row.total, 0),
      };
    }).sort((a, b) => b.total - a.total);
  }, [osComparisonRows, osSelectedRows]);

  const factMes = useMemo(() => factFiltered.filter((row) => inRange(row.fecha, monthStart, monthEnd)), [factFiltered, monthEnd, monthStart]);
  const factMesPrev = useMemo(() => factFiltered.filter((row) => inRange(row.fecha, previousMonthStart, previousMonthEnd)), [factFiltered, previousMonthEnd, previousMonthStart]);
  const totalMes = total(factMes);
  const trendMes = pct(totalMes, total(factMesPrev));

  const factBySucursal = useMemo(() => {
    return SUCURSALES.map((sucursal) => {
      const rows = selectedFacts.filter((row) => row.sucursal === sucursal);
      const previousRows = comparisonFacts.filter((row) => row.sucursal === sucursal);
      return {
        sucursal,
        total: total(rows),
        previousTotal: total(previousRows),
        facturas: new Set(rows.map((row) => row.cod_factura)).size,
      };
    }).sort((a, b) => b.total - a.total);
  }, [comparisonFacts, selectedFacts]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; facturas: number; rows: Facturacion[] }>();
    for (const row of selectedFacts) {
      const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      const key = normalizeClienteKey(nombre);
      const current = map.get(key) ?? { nombre, total: 0, facturas: 0, rows: [] };
      current.total += Number(row.total_venta || 0);
      current.rows.push(row);
      current.facturas = new Set(current.rows.map((item) => item.cod_factura)).size;
      // Keep the longest/most descriptive display name
      if (nombre.length > current.nombre.length) current.nombre = nombre;
      map.set(key, current);
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

  const jornadasProximoPeriodo = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        const periodoEnCurso = todayStr >= dateKey(periodStart) && todayStr <= dateKey(periodEnd);
        const planStart = periodoEnCurso ? periodStart : nextPeriodStart;
        const planEnd = periodoEnCurso ? periodEnd : nextPeriodEnd;
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, planStart, planEnd) && scopedServicio(servicio);
      }),
    [clienteById, fSucursales, jornadas, nextPeriodEnd, nextPeriodStart, periodEnd, periodStart, query, servicioById],
  );

  const periodoSeleccionadoEnCurso = todayStr >= dateKey(periodStart) && todayStr <= dateKey(periodEnd);
  const jornadasPlanificacion = periodoSeleccionadoEnCurso ? jornadasProgramadas : jornadasProximoPeriodo;
  const planificacionRango = periodoSeleccionadoEnCurso
    ? `${format(periodStart, "dd/MM")} - ${format(periodEnd, "dd/MM")}`
    : `${format(nextPeriodStart, "dd/MM")} - ${format(nextPeriodEnd, "dd/MM")}`;

  const trabajosPlanificadosProximoPeriodo = useMemo(() => {
    const servicioATrabajo = new Map<string, string>();
    for (const trabajo of trabajos) {
      if (trabajo.legacy_servicio_id) servicioATrabajo.set(trabajo.legacy_servicio_id, trabajo.id);
    }
    return new Set(jornadasPlanificacion.map((j) => servicioATrabajo.get(j.servicio_id) ?? j.servicio_id)).size;
  }, [jornadasPlanificacion, trabajos]);

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
      .slice(0, MAX_TOP_RANKING);
  }, [activeTechnicianIds, jornadasProgramadas, profileById, servicioById]);

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const tecnicosProximoPeriodo = new Set(jornadasPlanificacion.flatMap((j) => validJornadaCrew(j))).size;
  const tecnicosCierreAnterior = new Set(jornadasRealizadasPrev.flatMap((j) => validJornadaCrew(j))).size;
  const jornadasOperativasPeriodo = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return (
          (jornada.estado === "Pendiente" || jornada.estado === "Completado") &&
          inRange(jornada.fecha, periodStart, periodEnd) &&
          scopedServicio(servicio)
        );
      }),
    [clienteById, fSucursales, jornadas, periodEnd, periodStart, query, servicioById],
  );
  const tecnicosConActividadPeriodo = useMemo(
    () => new Set(jornadasOperativasPeriodo.flatMap((j) => validJornadaCrew(j))),
    [activeTechnicianIds, jornadasOperativasPeriodo, servicioById],
  );
  const cierreAnteriorRango = `${format(previousPeriodStart, "dd/MM")} - ${format(previousPeriodEnd, "dd/MM")}`;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > DIAS_JORNADA_VENCIDA);
  const selectedTrend = selectedWeek?.variacion ?? null;
  const selectedMetricValue = weekMetric(selectedWeek, factMetric);
  const selectedMetricPrevValue = (() => {
    if (!selectedWeek) return 0;
    const selectedIndex = weeklyRows.findIndex((row) => row.key === selectedWeek.key);
    return selectedIndex > 0 ? weekMetric(weeklyRows[selectedIndex - 1], factMetric) : 0;
  })();
  const selectedMetricTrend = factMetric === "usd" ? selectedTrend : pct(selectedMetricValue, selectedMetricPrevValue);
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
    const t = topClientes.slice(0, MAX_TOP_RANKING).reduce((a, r) => a + r.total, 0);
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
      if (fEstadosTrabajo.length > 0 && !fEstadosTrabajo.includes(row.estado)) return false;
      if (fTecnicos.length > 0 && !row.tecnicoIds.some((id) => fTecnicos.includes(id))) return false;
      if (fMarcas.length > 0 && !fMarcas.includes(row.marca)) return false;
      return true;
    }).sort((a, b) => {
      const order: Record<string, number> = { pausado: 0, iniciado: 1, programado: 2, pendiente: 3, completado: 4 };
      return (order[a.estado] ?? 9) - (order[b.estado] ?? 9) || b.ultimaFecha.localeCompare(a.ultimaFecha);
    });
  }, [trabajosBase, fEstadosTrabajo, fTecnicos, fMarcas]);


  const trabajosActivos = trabajosResumen.filter((row) => row.estado !== "completado");
  const trabajosConCierre = trabajosResumen.filter((row) => row.estado === "completado").length;
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
      label: estadoTrabajoLabel(estado),
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

    const ensureTecnicoRow = (id: string) => {
      if (map.has(id)) return;
      map.set(id, {
        id,
        nombre: profileById.get(id)?.nombre ?? "Sin tecnico",
        porBucket: {},
        totalJornadas: 0,
        totalHoras: 0,
        trabajos: new Set<string>(),
      });
    };

    for (const id of activeTechnicianIds) ensureTecnicoRow(id);

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
        ensureTecnicoRow(id);
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

    if (bucketsSet.size === 0) {
      if (periodMode === "semana") {
        const start = startOfWeek(periodStart, { weekStartsOn: 1 });
        const end = endOfWeek(periodEnd, { weekStartsOn: 1 });
        let cursor = start;
        while (cursor <= end) {
          bucketsSet.add(`${getISOWeekYear(cursor)}-W${String(getISOWeek(cursor)).padStart(2, "0")}`);
          cursor = addWeeks(cursor, 1);
        }
      } else {
        let cursor = startOfMonth(periodStart);
        const end = startOfMonth(periodEnd);
        while (cursor <= end) {
          bucketsSet.add(format(cursor, "yyyy-MM"));
          cursor = addMonths(cursor, 1);
        }
      }
    }

    const buckets = Array.from(bucketsSet).sort();
    const tecnicoFilterSet = fTecnicos.length > 0 ? new Set(fTecnicos) : null;
    const rowsAll = Array.from(map.values())
      .map((row) => ({
        id: row.id,
        nombre: row.nombre,
        porBucket: row.porBucket,
        totalJornadas: row.totalJornadas,
        totalHoras: row.totalHoras,
        trabajos: row.trabajos.size,
      }))
      .sort((a, b) => b.totalJornadas - a.totalJornadas || b.totalHoras - a.totalHoras || a.nombre.localeCompare(b.nombre));
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
  }, [activeTechnicianIds, jornadas, trabajos, trabajosResumen, fTecnicos, periodMode, periodStart, periodEnd, profileById]);

  const limpiar = () => {
    setWeekStartInput(initialWeekStart);
    setSelectedWeekKey(initialWeekStart);
    setFSucursales([]);
    setFRubros([]);
    setFOSRubros([]);
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
    (!filtrosOSActivos && fRubros.length > 0 ? 1 : 0) +
    (filtrosOSActivos && fOSRubros.length > 0 ? 1 : 0) +
    (fMarcas.length > 0 ? 1 : 0) +
    (fTiposTiempo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fEstadosTrabajo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fTecnicos.length > 0 ? 1 : 0) +
    (periodMode !== "mes" ? 1 : 0) +
    (q.trim() ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-[1440px] overflow-x-hidden px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-6 sm:py-4">
      <div className="space-y-2.5 sm:space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h1 className={pageTitle}>Dashboard ejecutivo</h1>
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
          placeholder="Todos"
          width="w-[170px]"
          options={SUCURSALES.map((s) => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Marca"
          values={fMarcas}
          onChange={setFMarcas}
          placeholder="Todos"
          width="w-[170px]"
          options={MARCAS.map((m) => ({ value: m, label: m }))}
        />
        {section === "os" ? (
          <FilterMultiSelect
            label="Concepto OS"
            values={fOSRubros}
            onChange={(values) => setFOSRubros(values as OSRubro[])}
            placeholder="Todos"
            width="w-[180px]"
            options={[
              { value: "Servicio", label: "Servicio" },
              { value: "Repuestos", label: "Repuestos" },
              { value: "Kilometraje", label: "Kilometraje" },
            ]}
          />
        ) : (
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
        )}
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

      {loading ? <DashboardKPISkeleton count={5} /> : <section className="grid auto-rows-fr grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          icon={DollarSign}
          title="Facturación del período"
          value={money(totalPeriodo)}
          trend={{ value: variacionTotalPct }}
          footer={`${facturasPeriodo} facturas · ${clientesAtendidosSemana} clientes`}
          tone={(variacionTotalPct ?? 0) < -20 ? "bad" : "neutral"}
          onClick={() => goSection("facturacion")}
        />
        <SummaryCard
          icon={Users}
          title="Clientes atendidos"
          value={clientesAtendidosSemana}
          detail={`${facturasPorCliente.toFixed(1).replace(".", ",")} facturas por cliente`}
          footer={`Top 5 concentran ${top5ClientesPct}%`}
          onClick={() => goSection("facturacion")}
        />
        <SummaryCard
          icon={Receipt}
          title="Ticket promedio"
          value={money(ticketPromedio)}
          trend={{ value: variacionTicketPct }}
          footer="Promedio por factura"
          tone={(variacionTicketPct ?? 0) < -10 ? "bad" : "neutral"}
          onClick={() => goSection("facturacion")}
        />
        <SummaryCard
          icon={PieChart}
          title="Tipo de facturación"
          value={`${tipoFactDominante.label} ${tipoFactDominante.value}%`}
          detail={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Garantía {tipoFactBreakdown.pctGarantia}%</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Interno {tipoFactBreakdown.pctInterno}%</span>
            </span>
          }
          onClick={() => goSection("facturacion")}
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
          onClick={() => goSection("trabajos")}
        />
      </section>}


      <Tabs value={section} onValueChange={goSection} className="space-y-3">
        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <TabsList className="inline-flex h-auto min-w-max sm:grid sm:w-fit sm:grid-cols-4">
          <TabsTrigger value="resumen" className="whitespace-nowrap">Vista general</TabsTrigger>
          <TabsTrigger value="facturacion" className="whitespace-nowrap">Facturacion</TabsTrigger>
          <TabsTrigger value="trabajos" className="whitespace-nowrap">Trabajos</TabsTrigger>
          <TabsTrigger value="os" className="whitespace-nowrap">OS absorbidas</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="resumen" className="space-y-3">

          <section className="grid auto-rows-fr gap-3 xl:grid-cols-3">
            <Card className="flex h-full flex-col p-3 xl:col-span-2">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">Evolución de facturación</h2>
                  <p className="truncate text-xs text-muted-foreground">Comparativo {periodoLabel} con selección directa.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <FactMetricSwitch value={factMetric} onChange={setFactMetric} />
                  {periodMode !== "anio" && (
                    <Select value={rangoEvolucion} onValueChange={(v) => setRangoEvolucion(v as typeof rangoEvolucion)}>
                      <SelectTrigger className="h-8 w-[150px] flex-1 text-xs sm:flex-none">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periodMode === "semana" ? (
                          <>
                            <SelectItem value="4">Ultimas 4 semanas</SelectItem>
                            <SelectItem value="8">Ultimas 8 semanas</SelectItem>
                            <SelectItem value="12">Ultimas 12 semanas</SelectItem>
                            <SelectItem value="all">Todos</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="6">Ultimos 6 meses</SelectItem>
                            <SelectItem value="12">Ultimos 12 meses</SelectItem>
                            <SelectItem value="24">Ultimos 24 meses</SelectItem>
                            <SelectItem value="all">Todos</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </div>
              </div>
              <WeeklyBars
                rows={weeklyRows}
                activeKey={selectedWeek?.key}
                metric={factMetric}
                onSelect={(key) => { setSelectedWeekKey(key); goSection("facturacion"); }}
              />
              <div className="mt-2 border-t pt-2">
                <MixRubros
                  row={currentWeekRow}
                  rubroFiltro={fRubros.length === 1 ? fRubros[0] : "all"}
                  onSelect={(rubro) => { setFRubros([rubro]); goSection("facturacion"); }}
                />
              </div>
              <EvolucionKpis rows={weeklyRows} currentKey={currentWeekRow?.key} metric={factMetric} />
            </Card>

            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Facturación por sucursal" subtitle="Participación del período seleccionado." />
              <SucursalBars rows={factBySucursal} totalValue={selectedWeek?.total ?? 0} comparisonLabel={comparisonLabel} onSelect={(sucursal) => { setFSucursales([sucursal]); goSection("facturacion"); }} />
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold tabular-nums">{sucursalesConMovimiento} / {SUCURSALES.length}</div>
                    <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">sucursales con movimiento</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Top 2</div>
                    <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">concentran {topSucursalesPct}% del total</div>
                  </div>
                </div>
              </div>
            </Card>
          </section>


          <section className="grid auto-rows-fr gap-3 xl:grid-cols-2">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={CheckCircle2} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto
                flujo={flujo}
                onSelect={(estado) => { setFEstadosTrabajo([estado]); goSection("trabajos"); }}
                planificados={trabajosPlanificadosProximoPeriodo}
                tecnicosAsignados={tecnicosProximoPeriodo}
                jornadasPlanificadas={jornadasPlanificacion.length}
                planificacionRango={planificacionRango}
                jornadasPrev={jornadasRealizadasPrev.length}
                horasPrev={horasPrev}
                tecnicosCierreAnterior={tecnicosCierreAnterior}
                cierreAnteriorRango={cierreAnteriorRango}
              />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={CalendarDays} title={periodMode === "semana" ? "Carga tecnica" : "Carga tecnica del periodo"} subtitle="" />
              <CargaTecnicaMatriz data={productividadMatriz} onClick={() => goSection("trabajos")} />
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
                onSelect={(nombre) => { setQ(nombre); goSection("facturacion"); }}
              />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="Cerrados, abiertos y pausados dentro del período." />

              <CargaSucursalTabla rows={cargaSucursal} onSelect={(sucursal) => { setFSucursales([sucursal]); goSection("trabajos"); }} />
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
                <div className="text-lg font-semibold tabular-nums">{loading ? "..." : formatWeekMetric(selectedWeek, "usd")}</div>
                <div className={cn("text-[11px]", selectedTrend != null && selectedTrend < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {selectedTrend == null ? "sin base previa" : `${selectedTrend > 0 ? "+" : ""}${selectedTrend}% vs anterior`}
                </div>
              </div>
            </div>

            <FactPeriodsMobile
              rows={weeklyRows}
              selectedKey={selectedWeek?.key}
              onSelect={setSelectedWeekKey}
            />
            <div className="hidden rounded-md border md:block">
              <div className="grid grid-cols-[88px_repeat(5,minmax(0,1fr))_52px_60px_60px] bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                <div>{T.columnaPeriodo}</div>
                <div className="text-right">{factMetricLabel("usd")}</div>
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
                const metricTrend = row.variacion;
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
                    <div className="text-right font-semibold tabular-nums">{formatWeekMetric(row, "usd")}</div>
                    <div className="text-right tabular-nums">{money(row.repuestos)}</div>
                    <div className="text-right tabular-nums">{money(row.servicio)}</div>
                    <div className="text-right tabular-nums">{money(row.kilometraje)}</div>
                    <div className="text-right tabular-nums">{money(row.otros)}</div>
                    <div className="text-right tabular-nums">{row.facturas}</div>
                    <div className="text-right tabular-nums">{row.clientes}</div>
                    <div className={cn("text-right tabular-nums", metricTrend != null && metricTrend < 0 && "text-destructive")}>
                      {metricTrend == null ? "-" : `${metricTrend > 0 ? "+" : ""}${metricTrend}%`}
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
                {selectedFacts.length > MAX_FACTURAS_RENDER && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando {MAX_FACTURAS_RENDER} de {selectedFacts.length} lineas para mantener fluida la vista.
                  </p>
                )}
              </div>
              <Badge variant="secondary" className="tabular-nums">{selectedFacts.length} lineas</Badge>
            </div>
            <FacturasMobile rows={selectedFacts} visibleRows={visibleSelectedFacts} />
            <div className="hidden max-h-[420px] overflow-y-auto overflow-x-hidden rounded-md border md:block">
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
                visibleSelectedFacts.map((row, index) => {
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

        <TabsContent value="os" className="space-y-3">
          <Card className="flex flex-col p-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">Detalle OS absorbidas</h2>
                <p className="truncate text-xs text-muted-foreground">Garantia e Interno separados de la facturacion vendida.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <OSMetricSwitch value={osMetric} onChange={setOsMetric} />
                {periodMode !== "anio" && (
                  <Select value={rangoEvolucion} onValueChange={(v) => setRangoEvolucion(v as typeof rangoEvolucion)}>
                    <SelectTrigger className="h-8 w-[150px] flex-1 text-xs sm:flex-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {periodMode === "semana" ? (
                        <>
                          <SelectItem value="4">Ultimas 4 semanas</SelectItem>
                          <SelectItem value="8">Ultimas 8 semanas</SelectItem>
                          <SelectItem value="12">Ultimas 12 semanas</SelectItem>
                          <SelectItem value="all">Todos</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="6">Ultimos 6 meses</SelectItem>
                          <SelectItem value="12">Ultimos 12 meses</SelectItem>
                          <SelectItem value="24">Ultimos 24 meses</SelectItem>
                          <SelectItem value="all">Todos</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <OSImpactSection
              loading={ordenesLoading}
              evolutionRows={osEvolutionRows}
              activeKey={osSelectedPeriod?.key}
              metric={osMetric}
              selectedSummary={osSelectedSummary}
              accumulatedSummary={osAccumulatedSummary}
              sucursalRows={osBySucursal}
              detailRows={osSelectedRows}
              detailMode={osDetailMode}
              selectedRubros={fOSRubros}
              comparisonLabel={comparisonLabel}
              onSelectPeriod={setSelectedWeekKey}
              onSelectSucursal={(sucursal) => setFSucursales([sucursal])}
              onSelectRubro={(rubro) => setFOSRubros((prev) => (prev.length === 1 && prev[0] === rubro ? [] : [rubro]))}
              onClearRubros={() => setFOSRubros([])}
              onDetailModeChange={setOsDetailMode}
              onSelectOS={(os) => setQ(os)}
            />
          </Card>
        </TabsContent>

        <TabsContent value="trabajos" className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TrabajoChip label="Activos" value={trabajosActivos.length} onClick={() => setFEstadosTrabajo([])} />
            <TrabajoChip label="Cerrados" value={trabajosConCierre} tone="good" onClick={() => setFEstadosTrabajo(["completado"])} />
            <TrabajoChip label="Pausados" value={trabajosPausados.length} tone={trabajosPausados.length ? "warn" : "neutral"} onClick={() => setFEstadosTrabajo(["pausado"])} />
            <TrabajoChip label="Jornadas" value={jornadasOperativasPeriodo.length} onClick={() => setFEstadosTrabajo([])} />
            <TrabajoChip label="Tecnicos" value={`${tecnicosConActividadPeriodo.size}/${tecnicosTotales || "-"}`} onClick={() => setFEstadosTrabajo([])} />
            <span className="ml-1 text-[11px] text-muted-foreground">{trabajosResumen.length} en lista</span>
          </div>

          <section className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={BarChart3} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto
                flujo={flujo}
                onSelect={(estado) => setFEstadosTrabajo([estado])}
                planificados={trabajosPlanificadosProximoPeriodo}
                tecnicosAsignados={tecnicosProximoPeriodo}
                jornadasPlanificadas={jornadasPlanificacion.length}
                planificacionRango={planificacionRango}
                jornadasPrev={jornadasRealizadasPrev.length}
                horasPrev={horasPrev}
                tecnicosCierreAnterior={tecnicosCierreAnterior}
                cierreAnteriorRango={cierreAnteriorRango}
              />
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
            <div className="space-y-2 md:hidden">
              {trabajosResumen.length === 0 ? (
                <div className="rounded-md border px-3 py-8 text-center text-xs text-muted-foreground">Sin trabajos para los filtros actuales.</div>
              ) : (
                <>
                {(showAllMobileTrabajos ? trabajosResumen : trabajosResumen.slice(0, 5)).map((row) => (
                  <button
                    key={row.id}
                    onClick={() => navigate(`/trabajos?q=${encodeURIComponent(row.ref)}`)}
                    className="w-full rounded-md border bg-background px-3 py-2.5 text-left shadow-sm"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-semibold text-muted-foreground">{row.ref}</div>
                        <div className="truncate text-sm font-semibold">{row.cliente}</div>
                      </div>
                      <TrabajoEstadoBadge estado={row.estado as any} className="shrink-0 text-[10px]" />
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{row.descripcion}</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-md bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">Jornadas</div>
                        <div className="font-semibold tabular-nums">{row.realizadasPeriodo}/{row.totalJornadasPeriodo}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">Técnicos</div>
                        <div className="font-semibold tabular-nums">{row.participantes}</div>
                      </div>
                      <div className="rounded-md bg-muted/50 px-2 py-1">
                        <div className="text-muted-foreground">Horas</div>
                        <div className="font-semibold tabular-nums">{row.horasPeriodo.toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{row.sucursal}</span>
                      <span className="shrink-0">
                        {row.pendientesPeriodoVencidas > 0
                          ? `${row.pendientesPeriodoVencidas} vencida${row.pendientesPeriodoVencidas !== 1 ? "s" : ""}`
                          : row.pendientesPeriodo > 0
                            ? `${row.pendientesPeriodo} pendiente${row.pendientesPeriodo !== 1 ? "s" : ""}`
                            : row.totalJornadasPeriodo === 0
                              ? "Sin jornadas"
                              : "Sin pendientes"}
                      </span>
                    </div>
                  </button>
                ))}
                {trabajosResumen.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMobileTrabajos((v) => !v)}
                    className="w-full rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
                  >
                    {showAllMobileTrabajos ? "Ver menos" : `Ver todos (${trabajosResumen.length})`}
                  </button>
                )}
                </>
              )}
            </div>
            <div className="hidden overflow-x-auto rounded-md border md:block">
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
                        <TrabajoEstadoBadge estado={row.estado as any} className="text-[10px]" />
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
    </div>
  );
}

