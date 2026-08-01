import { startTransition, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FiltersBar, FilterCustom, FilterDate } from "@/components/filters/FiltersBar";
import { FilterMultiSelect } from "@/components/filters/FilterMultiSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  XCircle,
  DollarSign,
  FileText,
  Activity,
  PieChart,
  Receipt,
  Shield,
  SlidersHorizontal,
  User,
  Users,
  Wrench,
} from "lucide-react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
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
import { DEFAULT_MONTHLY_PRODUCTIVITY_GOAL, loadMonthlyProductivityGoal } from "@/lib/appSettings";
import {
  displayImportedTechnicianName,
  importedServiceOrderParticipants,
  matchTechnicianProfile,
} from "@/lib/technicianMatching";
import { attributeServiceOrderMetrics, calculateTeamCapacity } from "@/lib/serviceOrderMetrics";
import { DashboardKPISkeleton } from "@/components/LoadingSkeletons";
import { pageTitle } from "@/lib/ui-classes";
import { TrabajoEstadoBadge } from "@/components/StatusBadges";
import type { WeekRow, Facturacion, FactMetric, OSMetric, OSImpactRow, OSRubro, PeriodMode, ServiciosDashboardData } from "@/components/dashboard/types";
import { money, pct, concept, total, weekMetric, comparisonWeekMetric, metricUnavailable, formatWeekMetric, factMetricLabel, formatOSMetric, osMetricValue, osRubroValue, summarizeOSImpact } from "@/components/dashboard/utils";
import { SummaryCard, FactPeriodsMobile, FacturasMobile, PanelTitle, FactMetricSwitch, OSMetricSwitch, PeriodSelector } from "@/components/dashboard/DashboardPanels";
import {
  WeeklyBars,
  SucursalBars,
  MixRubros,
  EstadoCompacto,
  CargaSucursalTabla,
  CargaEquipoChart,
  ClientesCompacto,
  OSImpactSection,
  TrabajoChip,
  DistribucionMarca,
  FacturacionExplorer,
  MatrizTécnicosDías,
  TrabajosAbiertosList,
  CumplimientoAgendaChart,
  TecnicosNoRealizadosRanking,
} from "@/components/dashboard/DashboardCharts";
import { ServiciosDashboard } from "@/components/dashboard/ServiciosDashboard";
import { useAssistantPageContext } from "@/contexts/AssistantPageContext";

const PAGE = 1000;
const MAX_FACTURAS_RENDER = 350;
const today = new Date();
const todayStr = format(today, "yyyy-MM-dd");
const initialDateFrom = format(startOfMonth(subMonths(today, 11)), "yyyy-MM-dd");
const initialDateTo = format(today, "yyyy-MM-dd");
const DASHBOARD_FILTERS_STORAGE_KEY = "sgs-cdm.dashboard.filters.v1";
const DEFAULT_FACTURACION_RUBROS = ["Servicio", "Repuestos", "Kilometraje"] as const;

function createDefaultFacturacionRubros() {
  return [...DEFAULT_FACTURACION_RUBROS];
}

function isDefaultFacturacionRubros(rubros: string[]) {
  return rubros.length === DEFAULT_FACTURACION_RUBROS.length &&
    DEFAULT_FACTURACION_RUBROS.every((rubro) => rubros.includes(rubro));
}

type DashboardStoredFilters = {
  dateFrom?: string;
  dateTo?: string;
  periodMode?: PeriodMode;
};

type DashboardDatePresetKey =
  | "current-week"
  | "previous-week"
  | "previous-current-week"
  | "current-month"
  | "last-6-months"
  | "last-12-months"
  | "current-year";

type DashboardDatePreset = {
  key: DashboardDatePresetKey;
  label: string;
  from: Date;
  to: Date;
  mode: PeriodMode;
};

function isValidDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime());
}

function getInitialDashboardFilters(): Required<DashboardStoredFilters> {
  if (typeof window === "undefined") {
    return { dateFrom: initialDateFrom, dateTo: initialDateTo, periodMode: "mes" };
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(DASHBOARD_FILTERS_STORAGE_KEY) ?? "{}") as DashboardStoredFilters;
    const savedFrom = isValidDateKey(saved.dateFrom) ? saved.dateFrom : initialDateFrom;
    const savedTo = isValidDateKey(saved.dateTo) ? saved.dateTo : initialDateTo;
    const from = savedFrom <= savedTo ? savedFrom : initialDateFrom;
    const to = savedFrom <= savedTo ? savedTo : initialDateTo;
    const mode: PeriodMode = saved.periodMode === "dia" || saved.periodMode === "semana" || saved.periodMode === "anio" ? saved.periodMode : "mes";
    return { dateFrom: from, dateTo: to, periodMode: mode };
  } catch {
    return { dateFrom: initialDateFrom, dateTo: initialDateTo, periodMode: "mes" };
  }
}

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

interface DisponibilidadTecnico {
  id: string;
  tecnico_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string | null;
  observacion: string | null;
}

interface OrdenServicioImportada {
  os_numero: string;
  trabajo_id: string | null;
  cliente_nombre: string | null;
  fecha_abierta_os: string | null;
  fecha_emision_factura: string | null;
  factura: string | null;
  responsable: string | null;
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
  raw_data: Record<string, unknown> | null;
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

function agendaBucketKey(iso: string, mode: PeriodMode) {
  if (mode === "dia") return iso.slice(0, 10);
  const date = parseISO(iso.slice(0, 10));
  if (mode === "mes") return format(date, "yyyy-MM");
  if (mode === "anio") return format(date, "yyyy");
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

function agendaBucketLabel(key: string, mode: PeriodMode) {
  if (mode === "dia") {
    const date = parseISO(key);
    const weekday = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][getDay(date)];
    return `${weekday} ${format(date, "dd/MM")}`;
  }
  if (mode === "mes") {
    const [year, month] = key.split("-").map(Number);
    const monthLabel = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][month - 1];
    return `${monthLabel} ${String(year).slice(-2)}`;
  }
  if (mode === "anio") return key;
  const [year, week] = key.split("-W");
  return `Sem ${Number(week)} · ${String(year).slice(-2)}`;
}

function agendaBuckets(start: Date, end: Date, mode: PeriodMode) {
  const keys: string[] = [];
  if (mode === "dia") {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      keys.push(format(cursor, "yyyy-MM-dd"));
    }
    return keys;
  }
  if (mode === "semana") {
    const rangeStart = startOfWeek(start, { weekStartsOn: 1 });
    const rangeEnd = startOfWeek(end, { weekStartsOn: 1 });
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addWeeks(cursor, 1)) {
      keys.push(`${getISOWeekYear(cursor)}-W${String(getISOWeek(cursor)).padStart(2, "0")}`);
    }
    return keys;
  }
  if (mode === "mes") {
    const rangeStart = startOfMonth(start);
    const rangeEnd = startOfMonth(end);
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addMonths(cursor, 1)) {
      keys.push(format(cursor, "yyyy-MM"));
    }
    return keys;
  }
  const rangeStart = startOfYear(start);
  const rangeEnd = startOfYear(end);
  for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addYears(cursor, 1)) {
    keys.push(format(cursor, "yyyy"));
  }
  return keys;
}

function servicePeriodBuckets(start: Date, end: Date, mode: PeriodMode) {
  const cursors: Date[] = [];

  if (mode === "dia") {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) cursors.push(cursor);
  } else if (mode === "semana") {
    const rangeStart = startOfWeek(start, { weekStartsOn: 1 });
    const rangeEnd = startOfWeek(end, { weekStartsOn: 1 });
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addWeeks(cursor, 1)) cursors.push(cursor);
  } else if (mode === "mes") {
    const rangeStart = startOfMonth(start);
    const rangeEnd = startOfMonth(end);
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addMonths(cursor, 1)) cursors.push(cursor);
  } else {
    const rangeStart = startOfYear(start);
    const rangeEnd = startOfYear(end);
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addYears(cursor, 1)) cursors.push(cursor);
  }

  return cursors.map((cursor) => {
    const rawStart = mode === "dia"
      ? cursor
      : mode === "semana"
        ? startOfWeek(cursor, { weekStartsOn: 1 })
        : mode === "mes"
          ? startOfMonth(cursor)
          : startOfYear(cursor);
    const rawEnd = mode === "dia"
      ? cursor
      : mode === "semana"
        ? endOfWeek(cursor, { weekStartsOn: 1 })
        : mode === "mes"
          ? endOfMonth(cursor)
          : endOfYear(cursor);
    const iso = format(cursor, "yyyy-MM-dd");
    const key = agendaBucketKey(iso, mode);

    return {
      key,
      label: agendaBucketLabel(key, mode),
      dateFrom: format(rawStart < start ? start : rawStart, "yyyy-MM-dd"),
      dateTo: format(rawEnd > end ? end : rawEnd, "yyyy-MM-dd"),
    };
  });
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

function canonicalTipoTiempo(value: string | null | undefined) {
  const normalized = normalizeOSLookup(value);
  if (!normalized) return "Sin tipo";
  if (normalized.includes("GARANT")) return "Garantia";
  if (normalized.includes("CLIENTE") || normalized.includes("FACTURAR")) return "Cliente";
  if (
    normalized.includes("INTERNO") ||
    normalized.includes("ABSOR") ||
    normalized.includes("ABZOR") ||
    normalized.includes("CDM")
  ) return "Interno";
  if (normalized.includes("MIXTO")) return "Mixto";
  return String(value ?? "Sin tipo").trim() || "Sin tipo";
}

function tiposTiempoOS(row: OrdenServicioImportada) {
  const raw = row.raw_data ?? {};
  const rawTypes = Array.isArray(raw.tipos_tiempo)
    ? raw.tipos_tiempo
    : raw.totales_por_tipo && typeof raw.totales_por_tipo === "object"
      ? Object.keys(raw.totales_por_tipo as Record<string, unknown>)
      : [];
  const candidates = rawTypes.length > 0
    ? rawTypes
    : String(row.tipo_tiempo ?? "").split(/[;,|/+]/).filter(Boolean);
  const canonical = Array.from(new Set(candidates.map((value) => canonicalTipoTiempo(String(value)))));
  const withoutMixed = canonical.filter((value) => value !== "Mixto" && value !== "Sin tipo");
  if (withoutMixed.length > 0) return withoutMixed;
  if (canonical.includes("Mixto")) return ["Cliente", "Garantia", "Interno"];
  return canonical.length > 0 ? canonical : ["Sin tipo"];
}

function canonicalSituacion(value: string | null | undefined) {
  const normalized = normalizeOSLookup(value);
  if (!normalized) return "Sin estado";
  if (normalized.includes("CERRAD")) return "Cerrada";
  if (normalized.includes("ABIERT")) return "Abierta";
  if (normalized.includes("CANCEL")) return "Cancelada";
  if (normalized.includes("ANUL")) return "Anulada";
  if (normalized.includes("FACTUR")) return "Facturada";
  return normalized
    .toLocaleLowerCase("es")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
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

function sucursalDesdeNombreCliente(name: string): Sucursal | null {
  const normalized = normalizeOSLookup(name);
  if (!normalized) return null;

  return SUCURSALES.find((sucursal) => normalized.includes(normalizeOSLookup(sucursal))) ?? null;
}

function productivityGoalForRange(start: Date, end: Date, monthlyGoal: number): number {
  let cursor = startOfMonth(start);
  let target = 0;
  while (cursor <= end) {
    const monthEnd = endOfMonth(cursor);
    const segmentStart = start > cursor ? start : cursor;
    const segmentEnd = end < monthEnd ? end : monthEnd;
    const includedDays = differenceInCalendarDays(segmentEnd, segmentStart) + 1;
    const monthDays = differenceInCalendarDays(monthEnd, cursor) + 1;
    target += monthlyGoal * (includedDays / monthDays);
    cursor = addMonths(cursor, 1);
  }
  return Math.max(target, 0);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { setPageFilters, clearPageFilters } = useAssistantPageContext();
  const initialFilters = useMemo(() => getInitialDashboardFilters(), []);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [facturación, setFacturacion] = useState<Facturacion[]>([]);
  const [ordenesServicio, setOrdenesServicio] = useState<OrdenServicioImportada[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<DisponibilidadTecnico[]>([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [jornadasLoading, setJornadasLoading] = useState(true);
  const [facturaciónLoading, setFacturacionLoading] = useState(true);
  const [ordenesLoading, setOrdenesLoading] = useState(true);
  const [metaHorasMensual, setMetaHorasMensual] = useState(DEFAULT_MONTHLY_PRODUCTIVITY_GOAL);

  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);
  const [selectedWeekKey, setSelectedWeekKey] = useState<string | null>(null);
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fRubros, setFRubros] = useState<string[]>(createDefaultFacturacionRubros);
  const [fOSRubros, setFOSRubros] = useState<OSRubro[]>([]);
  const [fMarcas, setFMarcas] = useState<string[]>([]);
  const [fTiposTiempo, setFTiposTiempo] = useState<string[]>([]);
  const [fEstadosTrabajo, setFEstadosTrabajo] = useState<string[]>([]);
  const [fTécnicos, setFTécnicos] = useState<string[]>([]);
  const [fResponsablesOS, setFResponsablesOS] = useState<string[]>([]);
  const [fEstadosOS, setFEstadosOS] = useState<Array<"cerrada" | "abierta" | "otra">>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>(initialFilters.periodMode);
  const [q, setQ] = useState("");
  const [section, setSection] = useState("resumen");
  const [factExplorerView, setFactExplorerView] = useState<"facturas" | "clientes" | "analisis">("facturas");
  const [factMetric, setFactMetric] = useState<FactMetric>("usd");
  const [osMetric, setOsMetric] = useState<OSMetric>("usd");
  const [osDetailMode, setOsDetailMode] = useState<"os" | "cliente">("os");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAllMobileTrabajos, setShowAllMobileTrabajos] = useState(false);
  const [matrixMetric, setMatrixMetric] = useState<"trabajos" | "horas">("trabajos");
  const loading = baseLoading || jornadasLoading || facturaciónLoading;
  const filtrosTrabajoActivos = section === "trabajos";
  const filtrosOSActivos = section === "os" || section === "servicios";
  const filtrosServiciosActivos = section === "servicios";
  const goSection = (value: string) =>
    startTransition(() => {
      setSection(value);
      if (value === "os") {
        setFRubros([]);
      } else {
        setFOSRubros([]);
      }
    });

  useEffect(() => {
    loadMonthlyProductivityGoal().then(setMetaHorasMensual);
  }, []);

  // Semana actual (siempre referenciada a hoy, no al rango del usuario)
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), []);
  const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), []);
  const previousWeekStart = useMemo(() => subWeeks(weekStart, 1), [weekStart]);
  const previousWeekEnd = useMemo(() => endOfWeek(previousWeekStart, { weekStartsOn: 1 }), [previousWeekStart]);
  const datePresets = useMemo<DashboardDatePreset[]>(() => [
    {
      key: "current-week",
      label: "Semana actual",
      from: weekStart,
      to: weekEnd,
      mode: "dia",
    },
    {
      key: "previous-week",
      label: "Semana anterior",
      from: previousWeekStart,
      to: previousWeekEnd,
      mode: "dia",
    },
    {
      key: "previous-current-week",
      label: "Semana anterior + actual",
      from: previousWeekStart,
      to: weekEnd,
      mode: "dia",
    },
    {
      key: "current-month",
      label: "Este mes",
      from: startOfMonth(today),
      to: endOfMonth(today),
      mode: "semana",
    },
    {
      key: "last-6-months",
      label: "Últimos 6 meses",
      from: startOfMonth(subMonths(today, 5)),
      to: today,
      mode: "mes",
    },
    {
      key: "last-12-months",
      label: "Últimos 12 meses",
      from: startOfMonth(subMonths(today, 11)),
      to: today,
      mode: "mes",
    },
    {
      key: "current-year",
      label: "Este año",
      from: startOfYear(today),
      to: endOfYear(today),
      mode: "mes",
    },
  ], [previousWeekEnd, previousWeekStart, weekEnd, weekStart]);

  const activeDatePreset = useMemo(() => {
    return datePresets.find((preset) =>
      dateFrom === format(preset.from, "yyyy-MM-dd") &&
      dateTo === format(preset.to, "yyyy-MM-dd") &&
      periodMode === preset.mode
    )?.key ?? "";
  }, [dateFrom, datePresets, dateTo, periodMode]);

  const applyDatePreset = (key: string) => {
    const preset = datePresets.find((item) => item.key === key);
    if (!preset) return;
    setDateFrom(format(preset.from, "yyyy-MM-dd"));
    setDateTo(format(preset.to, "yyyy-MM-dd"));
    setPeriodMode(preset.mode);
    setSelectedWeekKey(null);
  };

  // Rango libre definido por el usuario
  const periodStart = useMemo(() => parseISO(dateFrom), [dateFrom]);
  const periodEnd = useMemo(() => parseISO(dateTo), [dateTo]);
  const previousPeriodStart = useMemo(() => subYears(periodStart, 1), [periodStart]);
  const previousPeriodEnd = useMemo(() => subYears(periodEnd, 1), [periodEnd]);
  const nextPeriodStart = useMemo(() => addDays(periodEnd, 1), [periodEnd]);
  const nextPeriodEnd = useMemo(
    () => addDays(periodEnd, Math.max(differenceInCalendarDays(periodEnd, periodStart), 0)),
    [periodEnd, periodStart],
  );

  // Rango de días para validar granularidad y para queries
  const rangeDays = useMemo(
    () => differenceInCalendarDays(periodEnd, periodStart),
    [periodStart, periodEnd],
  );
  const disabledGranularities = useMemo(() => {
    const d = new Set<PeriodMode>();
    if (rangeDays > 31) d.add("dia");   // Día deshabilitado si rango > 31 días
    if (rangeDays > 364) d.add("semana"); // Semana deshabilitada si rango > 52 semanas
    return d;
  }, [rangeDays]);

  const queryStart = useMemo(() => subYears(periodStart, 1), [periodStart]);
  const queryEnd = useMemo(() => periodEnd, [periodEnd]);

  // Coerce automatico: si el rango cambia y la granularidad actual queda invalida, ajustar
  useEffect(() => {
    const days = differenceInCalendarDays(parseISO(dateTo), parseISO(dateFrom));
    if (periodMode === "dia" && days > 31) {
      setPeriodMode(days <= 364 ? "semana" : "mes");
    } else if (periodMode === "semana" && days > 364) {
      setPeriodMode("mes");
    }
  }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DASHBOARD_FILTERS_STORAGE_KEY,
      JSON.stringify({ dateFrom, dateTo, periodMode }),
    );
  }, [dateFrom, dateTo, periodMode]);

  useEffect(() => {
    setPageFilters({
      seccion: section,
      fecha_desde: dateFrom,
      fecha_hasta: dateTo,
      agrupacion: periodMode,
      sucursales: fSucursales,
      marcas: fMarcas,
      rubros: fRubros,
      tipo_tiempo: fTiposTiempo,
      estados_trabajo: fEstadosTrabajo,
      tecnicos: fTécnicos,
      busqueda: q || undefined,
    });
    return clearPageFilters;
  }, [clearPageFilters, dateFrom, dateTo, fEstadosTrabajo, fMarcas, fRubros, fSucursales, fTiposTiempo, fTécnicos, periodMode, q, section, setPageFilters]);

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
        const [jornadasRows, disponibilidadRows] = await Promise.all([
          cargarTodo<Jornada>(
            supabase
              .from("servicio_jornadas")
              .select("id, servicio_id, fecha, estado, horas_trabajadas, tecnico_responsable_id, auxiliares")
              .gte("fecha", dateKey(previousPeriodStart))
              .lte("fecha", dateKey(addDays(periodEnd, 90)))
              .order("fecha", { ascending: true }),
          ),
          cargarTodo<DisponibilidadTecnico>(
            supabase
              .from("tecnico_disponibilidad")
              .select("id, tecnico_id, fecha_inicio, fecha_fin, tipo, observacion")
              .lte("fecha_inicio", dateKey(periodEnd))
              .gte("fecha_fin", dateKey(periodStart)),
          ),
        ]);

        if (alive) {
          setJornadas(jornadasRows);
          setDisponibilidades(disponibilidadRows);
        }
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
  }, [periodStart, periodEnd, previousPeriodStart]);

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
              .eq("excluido_de_reportes", false)
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
            "fecha_factura, sucursal, tipo_facturacion, entidad_nombre, total_venta, cantidad, cod_mercaderia, codigo_fabricante, mercaderia, observacion, raw_data, subgrupo_original, grupo_normalizado, marca_normalizada, factura, codigo_interno_factura, tipo_tiempo, origen_sistema",
          )
          .gte("fecha_factura", dateKey(queryStart))
          .lte("fecha_factura", `${dateKey(queryEnd)}T23:59:59`)
          .order("fecha_factura", { ascending: false }) as any);

        const [legacyRows, gridRowsRaw] = await Promise.all([
          cargarFacturacionHistorica(),
          cargarTodo<any>(gridQuery),
        ]);

        const gridCamposYears = new Set(
          gridRowsRaw
            .filter((row) => row.origen_sistema === "grid_campos")
            .map((row) => String(row.fecha_factura ?? "").slice(0, 4))
            .filter(Boolean),
        );
        const detailedLineKeys = new Set(
          gridRowsRaw
            .map((row) => {
              const factura = String(row.codigo_interno_factura ?? row.factura ?? "").trim();
              const fecha = String(row.fecha_factura ?? "").slice(0, 10);
              return factura && fecha ? `${fecha}||${factura}` : null;
            })
            .filter(Boolean) as string[],
        );
        const legacyRowsNormalizados = legacyRows
          .filter((row) => {
            const esCampos = row.entidad_nombre.toUpperCase().includes("CAMPOS DEL MA");
            const year = row.fecha.slice(0, 4);
            const detailKey = `${row.fecha}||${String(row.cod_factura ?? "").trim()}`;
            if (detailedLineKeys.has(detailKey)) return false;
            return !esCampos || !gridCamposYears.has(year);
          })
          .map((row) => ({
            ...row,
            cantidad: Number((row as any).cantidad || 0),
            marca: clasificarMarcaFacturacion(row.grupo),
            tipo_tiempo: "Cliente" as Facturacion["tipo_tiempo"],
            origen_sistema: "legacy",
          }));

        const gridRows: Facturacion[] = gridRowsRaw.map((row) => {
          const factura = String(row.codigo_interno_factura ?? row.factura ?? "").trim();
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
            marca: (row.marca_normalizada ?? clasificarMarcaFacturacion(row.subgrupo_original ?? row.grupo_normalizado)) as Marca,
            origen_sistema: row.origen_sistema ?? "grid_campos",
            raw_data: row.raw_data ?? null,
          };
        });

        if (alive) setFacturacion([...legacyRowsNormalizados, ...gridRows]);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error(`Error cargando facturacion: ${msg}`);
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
        const osSelect = "os_numero, trabajo_id, cliente_nombre, fecha_abierta_os, fecha_emision_factura, factura, responsable, marca, problema, tipo_tiempo, servicios_cantidad, servicios_valor, repuesto_valor, km_cantidad, kilometro_valor, terceros_valor, situacion_os, situacion_facturacion, raw_data";
        const [rowsByOpenDate, rowsByInvoiceDate] = await Promise.all([
          cargarTodo<OrdenServicioImportada>(
            (supabase
              .from("ordenes_servicio_importadas" as any)
              .select(osSelect)
              .gte("fecha_abierta_os", dateKey(queryStart))
              .lte("fecha_abierta_os", `${dateKey(queryEnd)}T23:59:59`)
              .order("fecha_abierta_os", { ascending: false }) as any),
          ),
          cargarTodo<OrdenServicioImportada>(
            (supabase
              .from("ordenes_servicio_importadas" as any)
              .select(osSelect)
              .gte("fecha_emision_factura", dateKey(queryStart))
              .lte("fecha_emision_factura", `${dateKey(queryEnd)}T23:59:59`)
              .order("fecha_emision_factura", { ascending: false }) as any),
          ),
        ]);
        const rows = Array.from(
          new Map([...rowsByOpenDate, ...rowsByInvoiceDate].map((row) => {
            const key = [
              row.os_numero,
              row.fecha_abierta_os,
              row.cliente_nombre,
              row.tipo_tiempo,
              row.responsable,
              row.factura,
            ].map((value) => String(value ?? "").trim()).join("||");
            return [key, row] as const;
          })).values(),
        );
        if (alive) setOrdenesServicio(rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("ordenes_servicio_importadas")) {
          toast.error(`Error cargando ordenes de servicio: ${message}`);
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
    const administrativeRoleIds = new Set(
      userRoles.filter((row) => row.role === "admin" || row.role === "cabecilla").map((row) => row.user_id),
    );
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
          const isAdministrativeOnly = administrativeRoleIds.has(profile.id) && !hasTecnicoRole && !referenced;
          return profile.activo !== false && !isAdministrativeOnly && !name.includes("pasante");
        })
        .map((profile) => profile.id),
    );
  }, [jornadas, profiles, servicios, userRoles, servicioById]);


  const technicianOptions = useMemo(
    () =>
      Array.from(activeTechnicianIds)
        .map((id) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin técnico" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [activeTechnicianIds, profileById],
  );

  const allTechnicianProfiles = useMemo(
    () =>
      profiles
        .filter((profile) => !profile.nombre.toLowerCase().includes("pasante"))
        .map((profile) => ({ id: profile.id, nombre: profile.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [profiles],
  );

  const validTechnicianIds = (ids: Array<string | null | undefined>) =>
    Array.from(new Set(ids.filter((id): id is string => !!id && activeTechnicianIds.has(id))));

  const validJornadaCrew = (jornada: Jornada) => validTechnicianIds(jornadaCrewIds(jornada));

  // La dotacion activa sirve para la operativa actual, pero no debe borrar la
  // participacion historica de tecnicos que hoy estan inactivos.
  const historicalJornadaCrew = (jornada: Jornada) =>
    Array.from(new Set(jornadaCrewIds(jornada).filter((id) => {
      const profile = profileById.get(id);
      return Boolean(profile && !profile.nombre.toLowerCase().includes("pasante"));
    })));

  const query = q.trim().toLowerCase();
  const factFiltered = useMemo(
    () =>
      facturación.filter((row) => {
        if (fSucursales.length > 0 && (!row.sucursal || !fSucursales.includes(row.sucursal))) return false;
        if (fRubros.length > 0 && !fRubros.includes(concept(row))) return false;
        if (fMarcas.length > 0 && !fMarcas.includes(row.marca ?? clasificarMarcaFacturacion(row.grupo))) return false;
        if (fTiposTiempo.length > 0 && !fTiposTiempo.includes(row.tipo_tiempo)) return false;
        if (!query || filtrosServiciosActivos) return true;
        const cliente = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
        return (
          cliente.toLowerCase().includes(query) ||
          row.cod_factura.toLowerCase().includes(query) ||
          (row.grupo_fx ?? "").toLowerCase().includes(query) ||
          (row.grupo ?? "").toLowerCase().includes(query)
        );
      }),
    [clienteById, fMarcas, fRubros, fSucursales, fTiposTiempo, facturación, filtrosServiciosActivos, query],
  );

  // Todos los registros del rango completo seleccionado por el usuario
  const allPeriodFacts = useMemo(
    () => factFiltered.filter((row) => inRange(row.fecha, periodStart, periodEnd)),
    [factFiltered, periodStart, periodEnd],
  );
  // Año anterior: mismo rango exactamente 1 año atras (subYears maneja feb-29 automaticamente)
  const prevPeriodStartDate = useMemo(() => subYears(periodStart, 1), [periodStart]);
  const prevPeriodEndDate = useMemo(() => subYears(periodEnd, 1), [periodEnd]);
  const allPrevPeriodFacts = useMemo(
    () => factFiltered.filter((row) => inRange(row.fecha, prevPeriodStartDate, prevPeriodEndDate)),
    [factFiltered, prevPeriodStartDate, prevPeriodEndDate],
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

  const ordenServicioByNumero = useMemo(() => {
    const map = new Map<string, OrdenServicioImportada>();
    for (const row of ordenesServicio) {
      const key = String(row.os_numero ?? "").trim();
      if (key) map.set(key, row);
    }
    return map;
  }, [ordenesServicio]);

  const linkedOSNumber = (row: Facturacion) => {
    const raw = row.raw_data as Record<string, unknown> | null | undefined;
    return String(raw?.linked_service_order ?? "").trim();
  };

  const responsablesOSOptions = useMemo(
    () => Array.from(new Set([
      ...technicianOptions.map((profile) => profile.nombre),
      ...ordenesServicio.flatMap((row) => {
        const rawData = (row.raw_data ?? {}) as Record<string, any>;
        const sources = importedServiceOrderParticipants(rawData, row.responsable);
        return sources.map((source) => {
          const matched = matchTechnicianProfile(source, allTechnicianProfiles);
          return matched?.nombre ?? displayImportedTechnicianName(source);
        });
      }),
    ].filter((name) => name !== "Sin técnico asignado"))).sort((a, b) => a.localeCompare(b)),
    [allTechnicianProfiles, ordenesServicio, technicianOptions],
  );

  const serviciosDashboardData = useMemo<ServiciosDashboardData>(() => {
    const tecnicoMap = new Map<string, {
      profileId: string | null;
      tecnico: string;
      activo: boolean;
      totalOS: number;
      cerradas: number;
      abiertas: number;
      otras: number;
      horas: number;
      horasDesdeDetalle: number;
      horasDesdeOS: number;
      km: number;
      valorOS: number;
      periodos: Map<string, {
        key: string;
        label: string;
        dateFrom: string;
        dateTo: string;
        totalOS: number;
        cerradas: number;
        abiertas: number;
        otras: number;
        horas: number;
      }>;
    }>();
    const estadosMap = new Map<string, number>();
    const mixTiempoMap = new Map<string, number>();
    const evolucionMap = new Map<string, {
      key: string;
      label: string;
      dateFrom: string;
      dateTo: string;
      cerradas: number;
      abiertas: number;
      otras: number;
      horasOS: number;
      horasPersona: number;
    }>();
    const sucursalMap = new Map<string, { sucursal: string; cerradas: number; abiertas: number; otras: number; total: number }>();

    servicePeriodBuckets(periodStart, periodEnd, periodMode).forEach((bucket) => {
      evolucionMap.set(bucket.key, {
        ...bucket,
        cerradas: 0,
        abiertas: 0,
        otras: 0,
        horasOS: 0,
        horasPersona: 0,
      });
    });

    for (const profile of technicianOptions) {
      const profileSucursal = profileById.get(profile.id)?.sucursal ?? null;
      if (fSucursales.length > 0 && (!profileSucursal || !fSucursales.includes(profileSucursal))) continue;
      tecnicoMap.set(profile.nombre, {
        profileId: profile.id,
        tecnico: profile.nombre,
        activo: true,
        totalOS: 0,
        cerradas: 0,
        abiertas: 0,
        otras: 0,
        horas: 0,
        horasDesdeDetalle: 0,
        horasDesdeOS: 0,
        km: 0,
        valorOS: 0,
        periodos: new Map(),
      });
    }

    const ordenes = ordenesServicio.flatMap((row, index) => {
      const fechaApertura = String(row.fecha_abierta_os ?? "").slice(0, 10);
      if (!fechaApertura || !inRange(fechaApertura, periodStart, periodEnd)) return [];

      const trabajo = row.trabajo_id ? trabajoById.get(row.trabajo_id) : null;
      const clienteTrabajo = trabajo?.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre : null;
      const cliente = String(clienteTrabajo ?? row.cliente_nombre ?? "Sin cliente").trim() || "Sin cliente";
      const clienteMatched = clienteByName.get(normalizeClienteKey(cliente));
      const sucursal = trabajo?.sucursal ?? clienteMatched?.sucursal ?? sucursalDesdeNombreCliente(cliente);
      const marca = (trabajo?.marca ?? marcaDesdeOS(row.marca)) as Marca;
      const rawData = (row.raw_data ?? {}) as Record<string, any>;
      const origen = String(
        rawData.canonical_origin ?? rawData.ORIGEN ?? rawData.Origen ?? "",
      ).trim();
      const participantSources = importedServiceOrderParticipants(rawData, row.responsable);
      const participantMap = new Map<string, {
        tecnico: string;
        profileId: string | null;
        activo: boolean;
        sources: string[];
      }>();
      for (const sourceName of participantSources) {
        const matched = matchTechnicianProfile(sourceName, allTechnicianProfiles);
        const tecnicoName = matched?.nombre ?? displayImportedTechnicianName(sourceName);
        const currentParticipant = participantMap.get(tecnicoName) ?? {
          tecnico: tecnicoName,
          profileId: matched?.id ?? null,
          activo: matched ? activeTechnicianIds.has(matched.id) : false,
          sources: [],
        };
        currentParticipant.sources.push(sourceName);
        participantMap.set(tecnicoName, currentParticipant);
      }
      const participants = Array.from(participantMap.values());
      const participantNames = participants.map((participant) => participant.tecnico);
      const responsibleSource = String(row.responsable ?? "").trim();
      const responsibleMatch = responsibleSource
        ? matchTechnicianProfile(responsibleSource, allTechnicianProfiles)
        : null;
      const tecnico = responsibleSource
        ? responsibleMatch?.nombre ?? displayImportedTechnicianName(responsibleSource)
        : "Sin técnico asignado";
      const tiposTiempo = tiposTiempoOS(row);
      const tipoTiempo = tiposTiempo.join(" + ");
      const estadoOS = canonicalSituacion(row.situacion_os);
      const estadoNormalizado = normalizeOSLookup(estadoOS);
      const estadoGrupo = estadoNormalizado.includes("CERRAD")
        ? "cerrada"
        : estadoNormalizado.includes("CANCEL") || estadoNormalizado.includes("ANUL")
          ? "otra"
          : "abierta";

      const bucketDate = parseISO(fechaApertura);
      const rawBucketStart = periodMode === "dia"
        ? bucketDate
        : periodMode === "semana"
          ? startOfWeek(bucketDate, { weekStartsOn: 1 })
          : periodMode === "anio"
            ? startOfYear(bucketDate)
            : startOfMonth(bucketDate);
      const rawBucketEnd = periodMode === "dia"
        ? bucketDate
        : periodMode === "semana"
          ? endOfWeek(bucketDate, { weekStartsOn: 1 })
          : periodMode === "anio"
            ? endOfYear(bucketDate)
            : endOfMonth(bucketDate);
      const bucket = {
        key: periodMode === "dia"
          ? fechaApertura
          : periodMode === "semana"
            ? `${getISOWeekYear(bucketDate)}-W${String(getISOWeek(bucketDate)).padStart(2, "0")}`
            : periodMode === "anio"
              ? format(bucketDate, "yyyy")
              : format(bucketDate, "yyyy-MM"),
        label: periodMode === "dia"
          ? format(bucketDate, "dd/MM")
          : periodMode === "semana"
            ? `Sem ${getISOWeek(bucketDate)} · ${getISOWeekYear(bucketDate)}`
            : periodMode === "anio"
              ? format(bucketDate, "yyyy")
              : format(bucketDate, "MM/yyyy"),
        dateFrom: format(rawBucketStart < periodStart ? periodStart : rawBucketStart, "yyyy-MM-dd"),
        dateTo: format(rawBucketEnd > periodEnd ? periodEnd : rawBucketEnd, "yyyy-MM-dd"),
      };

      if (fSucursales.length > 0 && (!sucursal || !fSucursales.includes(sucursal))) return [];
      if (fMarcas.length > 0 && !fMarcas.includes(marca)) return [];
      if (fResponsablesOS.length > 0 && !fResponsablesOS.some((name) => participantNames.includes(name))) return [];
      if (fEstadosOS.length > 0 && !fEstadosOS.includes(estadoGrupo)) return [];
      if (
        fTiposTiempo.length > 0 &&
        !fTiposTiempo.some((tipo) => tiposTiempo.includes(canonicalTipoTiempo(tipo)))
      ) return [];
      if (fOSRubros.length > 0) {
        const matchesRubro = fOSRubros.some((rubro) => {
          if (rubro === "Servicio") return Number(row.servicios_valor || 0) > 0 || Number(row.servicios_cantidad || 0) > 0;
          if (rubro === "Repuestos") return Number(row.repuesto_valor || 0) > 0;
          return Number(row.kilometro_valor || 0) > 0 || Number(row.km_cantidad || 0) > 0;
        });
        if (!matchesRubro) return [];
      }
      if (query) {
        const searchable = [row.os_numero, row.factura, ...participantNames, cliente, row.problema, estadoOS, tipoTiempo, origen]
          .map((value) => String(value ?? ""))
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(query)) return [];
      }

      const horas = Number(row.servicios_cantidad || 0);
      const km = Number(row.km_cantidad || 0);
      const valorOS = Number(row.servicios_valor || 0) + Number(row.repuesto_valor || 0) +
        Number(row.kilometro_valor || 0) + Number(row.terceros_valor || 0);
      const totalsByTechnician = (rawData.totales_por_tecnico ?? {}) as Record<string, Record<string, unknown>>;
      const participantMetrics = attributeServiceOrderMetrics(
        participants.map((participant) => ({
          key: participant.tecnico,
          sources: participant.sources,
        })),
        totalsByTechnician,
        { hours: horas, kilometers: km, value: valorOS },
      );
      const participantMetricsByTechnician = new Map(
        participantMetrics.map((metrics) => [metrics.key, metrics]),
      );
      const horasPersonaOS = participantMetrics.reduce((sum, metrics) => sum + metrics.hours, 0);

      estadosMap.set(estadoOS, (estadosMap.get(estadoOS) ?? 0) + 1);
      tiposTiempo.forEach((tipo) => mixTiempoMap.set(tipo, (mixTiempoMap.get(tipo) ?? 0) + 1));

      const evolucionRow = evolucionMap.get(bucket.key) ?? {
        ...bucket,
        cerradas: 0,
        abiertas: 0,
        otras: 0,
        horasOS: 0,
        horasPersona: 0,
      };
      evolucionRow[estadoGrupo === "cerrada" ? "cerradas" : estadoGrupo === "abierta" ? "abiertas" : "otras"] += 1;
      evolucionRow.horasOS += horas;
      evolucionRow.horasPersona += horasPersonaOS;
      evolucionMap.set(bucket.key, evolucionRow);

      const sucursalLabel = sucursal ?? "Sin sucursal";
      const sucursalRow = sucursalMap.get(sucursalLabel) ?? { sucursal: sucursalLabel, cerradas: 0, abiertas: 0, otras: 0, total: 0 };
      sucursalRow[estadoGrupo === "cerrada" ? "cerradas" : estadoGrupo === "abierta" ? "abiertas" : "otras"] += 1;
      sucursalRow.total += 1;
      sucursalMap.set(sucursalLabel, sucursalRow);

      participants.forEach((participant) => {
        const metrics = participantMetricsByTechnician.get(participant.tecnico) ?? {
          key: participant.tecnico,
          hours: horas,
          kilometers: km,
          value: valorOS,
          source: "order" as const,
        };
        const tecnicoRow = tecnicoMap.get(participant.tecnico) ?? {
          profileId: participant.profileId,
          tecnico: participant.tecnico,
          activo: participant.activo,
          totalOS: 0,
          cerradas: 0,
          abiertas: 0,
          otras: 0,
          horas: 0,
          horasDesdeDetalle: 0,
          horasDesdeOS: 0,
          km: 0,
          valorOS: 0,
          periodos: new Map(),
        };
        tecnicoRow.totalOS += 1;
        if (estadoGrupo === "cerrada") tecnicoRow.cerradas += 1;
        else if (estadoGrupo === "abierta") tecnicoRow.abiertas += 1;
        else tecnicoRow.otras += 1;
        tecnicoRow.horas += metrics.hours;
        tecnicoRow.km += metrics.kilometers;
        tecnicoRow.valorOS += metrics.value;
        if (metrics.source === "individual") tecnicoRow.horasDesdeDetalle += metrics.hours;
        else tecnicoRow.horasDesdeOS += metrics.hours;

        const tecnicoPeriodo = tecnicoRow.periodos.get(bucket.key) ?? {
          ...bucket,
          totalOS: 0,
          cerradas: 0,
          abiertas: 0,
          otras: 0,
          horas: 0,
        };
        tecnicoPeriodo.totalOS += 1;
        if (estadoGrupo === "cerrada") tecnicoPeriodo.cerradas += 1;
        else if (estadoGrupo === "abierta") tecnicoPeriodo.abiertas += 1;
        else tecnicoPeriodo.otras += 1;
        tecnicoPeriodo.horas += metrics.hours;
        tecnicoRow.periodos.set(bucket.key, tecnicoPeriodo);
        tecnicoMap.set(participant.tecnico, tecnicoRow);
      });

      return [{
        key: [row.os_numero, fechaApertura, tipoTiempo, tecnico, index].join("||"),
        os: row.os_numero,
        tecnico,
        tecnicoProfileId: responsibleMatch?.id ?? null,
        cliente,
        sucursal,
        marca,
        tipoTiempo,
        fechaApertura,
        estadoOS,
        estadoFacturacion: canonicalSituacion(row.situacion_facturacion),
        origen,
        factura: String(row.factura ?? "").trim(),
        problema: String(row.problema ?? "").trim(),
        horas,
        km,
        valorOS,
      }];
    }).sort((a, b) => (b.fechaApertura ?? "").localeCompare(a.fechaApertura ?? "") || a.os.localeCompare(b.os));

    const cerradas = ordenes.filter((row) => row.estadoOS === "Cerrada").length;
    const otras = ordenes.filter((row) => row.estadoOS === "Cancelada" || row.estadoOS === "Anulada").length;
    const horasCerradas = ordenes
      .filter((row) => row.estadoOS === "Cerrada")
      .reduce((sum, row) => sum + row.horas, 0);
    const metaHorasPeriodo = productivityGoalForRange(periodStart, periodEnd, metaHorasMensual);
    const evolucionBase = Array.from(evolucionMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const tecnicosBase = Array.from(tecnicoMap.values());
    const capacidadRestringidaAParticipantes =
      fMarcas.length > 0 ||
      fResponsablesOS.length > 0 ||
      fEstadosOS.length > 0 ||
      fTiposTiempo.length > 0 ||
      fOSRubros.length > 0 ||
      Boolean(query.trim());
    const tecnicosCapacidad = tecnicosBase.filter((row) =>
      capacidadRestringidaAParticipantes ? row.totalOS > 0 : row.activo || row.totalOS > 0,
    );
    const capacidadCalculada = calculateTeamCapacity(
      tecnicosBase.reduce((sum, row) => sum + row.horas, 0),
      metaHorasPeriodo,
      tecnicosCapacidad.length,
    );
    const capacidad = {
      ...capacidadCalculada,
      base: capacidadRestringidaAParticipantes
        ? ("participantes_filtrados" as const)
        : ("equipo_activo" as const),
    };
    const evolucion = evolucionBase.map((row) => {
      const tecnicosPeriodo = tecnicosBase.filter(
        (tecnicoRow) =>
          capacidadRestringidaAParticipantes
            ? (tecnicoRow.periodos.get(row.key)?.totalOS ?? 0) > 0
            : tecnicoRow.activo || (tecnicoRow.periodos.get(row.key)?.totalOS ?? 0) > 0,
      ).length;
      const capacidadPeriodo = calculateTeamCapacity(
        row.horasPersona,
        productivityGoalForRange(parseISO(row.dateFrom), parseISO(row.dateTo), metaHorasMensual),
        tecnicosPeriodo,
      );
      return {
        ...row,
        tecnicosBase: capacidadPeriodo.technicians,
        horasDisponibles: capacidadPeriodo.hoursAvailable,
        utilizacion: capacidadPeriodo.percentage,
      };
    });
    const tecnicos = tecnicosBase.map(({ periodos, ...row }) => ({
      ...row,
      evolucion: evolucionBase.map((periodo) => {
        const tecnicoPeriodo = periodos.get(periodo.key);
        const metaHoras = productivityGoalForRange(
          parseISO(periodo.dateFrom),
          parseISO(periodo.dateTo),
          metaHorasMensual,
        );
        const horas = tecnicoPeriodo?.horas ?? 0;
        return {
          key: periodo.key,
          label: periodo.label,
          dateFrom: periodo.dateFrom,
          dateTo: periodo.dateTo,
          totalOS: tecnicoPeriodo?.totalOS ?? 0,
          cerradas: tecnicoPeriodo?.cerradas ?? 0,
          abiertas: tecnicoPeriodo?.abiertas ?? 0,
          otras: tecnicoPeriodo?.otras ?? 0,
          horas,
          metaHoras,
          productividad: metaHoras > 0 ? (horas / metaHoras) * 100 : 0,
        };
      }),
    })).sort(
      (a, b) => b.horas - a.horas || b.totalOS - a.totalOS || a.tecnico.localeCompare(b.tecnico),
    );

    return {
      totalOS: ordenes.length,
      cerradas,
      abiertas: ordenes.length - cerradas - otras,
      otras,
      sinResponsable: ordenes.filter((row) => row.tecnico === "Sin técnico asignado").length,
      horas: ordenes.reduce((sum, row) => sum + row.horas, 0),
      horasCerradas,
      horasPersona: tecnicos.reduce((sum, row) => sum + row.horas, 0),
      horasPersonaDesdeDetalle: tecnicos.reduce((sum, row) => sum + row.horasDesdeDetalle, 0),
      horasPersonaDesdeOS: tecnicos.reduce((sum, row) => sum + row.horasDesdeOS, 0),
      km: ordenes.reduce((sum, row) => sum + row.km, 0),
      valorOS: ordenes.reduce((sum, row) => sum + row.valorOS, 0),
      metaHorasMensual,
      metaHorasPeriodo,
      capacidad: {
        tecnicosBase: capacidad.technicians,
        horasDisponibles: capacidad.hoursAvailable,
        horasUtilizadas: capacidad.hoursUsed,
        porcentaje: capacidad.percentage,
        base: capacidad.base,
      },
      tecnicos,
      ordenes,
      estados: Array.from(estadosMap, ([label, rowTotal]) => ({ label, total: rowTotal })).sort((a, b) => b.total - a.total),
      mixTiempo: Array.from(mixTiempoMap, ([label, rowTotal]) => ({ label, total: rowTotal })).sort((a, b) => b.total - a.total),
      evolucion,
      sucursales: Array.from(sucursalMap.values()).sort((a, b) => b.total - a.total || a.sucursal.localeCompare(b.sucursal)),
    };
  }, [activeTechnicianIds, allTechnicianProfiles, clienteById, clienteByName, fEstadosOS, fMarcas, fOSRubros, fResponsablesOS, fSucursales, fTiposTiempo, metaHorasMensual, ordenesServicio, periodEnd, periodMode, periodStart, profileById, query, technicianOptions, trabajoById]);

  const factMetricQuantities = (rows: Facturacion[]) => {
    let horasServicio = 0;
    let kmFacturados = 0;
    const countedServiceOS = new Set<string>();
    const countedKmOS = new Set<string>();

    for (const row of rows) {
      const rowConcept = concept(row);
      const osNumero = linkedOSNumber(row);
      const os = osNumero ? ordenServicioByNumero.get(osNumero) : null;

      if (rowConcept === "Servicio") {
        const osHours = Number(os?.servicios_cantidad || 0);
        if (osNumero && osHours > 0) {
          if (!countedServiceOS.has(osNumero)) {
            horasServicio += osHours;
            countedServiceOS.add(osNumero);
          }
        } else {
          horasServicio += Number(row.cantidad || 0);
        }
      }

      if (rowConcept === "Kilometraje") {
        const osKm = Number(os?.km_cantidad || 0);
        if (osNumero && osKm > 0) {
          if (!countedKmOS.has(osNumero)) {
            kmFacturados += osKm;
            countedKmOS.add(osNumero);
          }
        } else {
          kmFacturados += Number(row.cantidad || 0);
        }
      }
    }

    return { horasServicio, kmFacturados };
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
    // Generar buckets que cubran exactamente [periodStart, periodEnd] a la granularidad elegida.
    // Día, semana, mes o año segun el agrupador elegido.
    const periods: Array<{ start: Date; end: Date; label: string }> = [];

    if (periodMode === "dia") {
      // Día: un bucket por día
      let cursor = periodStart;
      while (cursor <= periodEnd) {
        periods.push({ start: cursor, end: cursor, label: format(cursor, "dd/MM") });
        cursor = addDays(cursor, 1);
      }
    } else if (periodMode === "semana") {
      // Semana: un bucket por semana ISO (semana que contiene periodStart)
      let cursor = startOfWeek(periodStart, { weekStartsOn: 1 });
      while (cursor <= periodEnd) {
        const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
        periods.push({
          start: cursor,
          end: wEnd,
          label: `${format(cursor, "dd/MM")} - ${format(wEnd, "dd/MM")}`,
        });
        cursor = addWeeks(cursor, 1);
      }
    } else if (periodMode === "mes") {
      // Mes: un bucket por mes
      let cursor = startOfMonth(periodStart);
      while (cursor <= periodEnd) {
        const mEnd = endOfMonth(cursor);
        periods.push({ start: cursor, end: mEnd, label: format(cursor, "MM/yyyy") });
        cursor = addMonths(cursor, 1);
      }
    } else {
      let cursor = startOfYear(periodStart);
      while (cursor <= periodEnd) {
        const yEnd = endOfYear(cursor);
        periods.push({ start: cursor, end: yEnd, label: format(cursor, "yyyy") });
        cursor = addYears(cursor, 1);
      }
    }

    // Comparacion: mismo offset en el periodo inmedíatamente anterior (criterio unificado con Fila 1)
    const comparisonLabelFor = (start: Date, end: Date) => {
      if (periodMode === "mes") return format(subYears(start, 1), "MM/yyyy");
      if (periodMode === "dia") return format(subYears(start, 1), "dd/MM/yy");
      if (periodMode === "anio") return format(subYears(start, 1), "yyyy");
      const cs = subYears(start, 1);
      const ce = subYears(end, 1);
      return `${format(cs, "dd/MM")} - ${format(ce, "dd/MM/yy")}`;
    };

    const rows = periods.map(({ start, end, label }) => {
      const weekFacts = factFiltered.filter((row) => inRange(row.fecha, start, end));
      const compStart = subYears(start, 1);
      const compEnd = subYears(end, 1);
      const comparisonFacts = factFiltered.filter((row) => inRange(row.fecha, compStart, compEnd));
      const byConcept = { Repuestos: 0, Servicio: 0, Kilometraje: 0, Maquinarias: 0, Otros: 0 };

      for (const row of weekFacts) {
        const rowConcept = concept(row);
        byConcept[rowConcept] += Number(row.total_venta || 0);
      }
      const { horasServicio, kmFacturados } = factMetricQuantities(weekFacts);
      const {
        horasServicio: comparisonHorasServicio,
        kmFacturados: comparisonKmFacturados,
      } = factMetricQuantities(comparisonFacts);

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
        maquinarias: byConcept.Maquinarias,
        otros: byConcept.Otros,
        horasServicio,
        kmFacturados,
        facturas: invoices.size,
        clientes: clients.size,
        comparisonTotal: total(comparisonFacts),
        comparisonHorasServicio,
        comparisonKmFacturados,
        comparisonLabel: comparisonLabelFor(start, end),
        variacion: null,
        rows: weekFacts,
      };
    });

    return rows.map((row) => ({
      ...row,
      variacion: pct(row.total, row.comparisonTotal),
    }));
  }, [factFiltered, ordenServicioByNumero, periodMode, periodStart, periodEnd, clienteById]);

  const selectedWeek = selectedWeekKey ? weeklyRows.find((row) => row.key === selectedWeekKey) : undefined;
  const selectedFacts = selectedWeek ? selectedWeek.rows : allPeriodFacts;
  const selectedLabelFacturacion = selectedWeek?.label ?? `${format(periodStart, "dd/MM/yy")} - ${format(periodEnd, "dd/MM/yy")}`;
  const visibleSelectedFacts = useMemo(() => selectedFacts.slice(0, MAX_FACTURAS_RENDER), [selectedFacts]);

  const comparisonRange = useMemo(() => {
    if (!selectedWeek) return null;
    return {
      start: subYears(selectedWeek.start, 1),
      end: subYears(selectedWeek.end, 1),
    };
  }, [selectedWeek]);

  const comparisonFacts = useMemo(
    () => comparisonRange ? factFiltered.filter((row) => inRange(row.fecha, comparisonRange.start, comparisonRange.end)) : [],
    [comparisonRange, factFiltered],
  );

  const comparisonLabel = comparisonRange
    ? periodMode === "mes"
      ? format(comparisonRange.start, "MM/yyyy")
      : `${format(comparisonRange.start, "dd/MM")} - ${format(comparisonRange.end, "dd/MM/yy")}`
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
    return { start: subYears(osSelectedPeriod.start, 1), end: subYears(osSelectedPeriod.end, 1) };
  }, [osSelectedPeriod]);
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
  const osAccumulatedComparisonSummary = useMemo(() => {
    const rows = osImpactRows.filter((row) => inRange(row.fecha, prevPeriodStartDate, prevPeriodEndDate));
    return summarizeOSImpact(rows, "comp-acumulado", "Año anterior", prevPeriodStartDate, prevPeriodEndDate);
  }, [osImpactRows, prevPeriodStartDate, prevPeriodEndDate]);
  const osVarPct = osAccumulatedComparisonSummary.total > 0
    ? Math.round(((osAccumulatedSummary.total - osAccumulatedComparisonSummary.total) / osAccumulatedComparisonSummary.total) * 100)
    : null;
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
  const osComparisonLabel = osComparisonRange
    ? `${format(osComparisonRange.start, "dd/MM/yy")} - ${format(osComparisonRange.end, "dd/MM/yy")}`
    : undefined;

  const factBySucursal = useMemo(() => {
    return SUCURSALES.map((sucursal) => {
      const rows = allPeriodFacts.filter((row) => row.sucursal === sucursal);
      const previousRows = allPrevPeriodFacts.filter((row) => row.sucursal === sucursal);
      return {
        sucursal,
        total: total(rows),
        previousTotal: total(previousRows),
        facturas: new Set(rows.map((row) => row.cod_factura)).size,
      };
    }).sort((a, b) => b.total - a.total);
  }, [allPeriodFacts, allPrevPeriodFacts]);

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
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
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

  const jornadasPróximoPeriodo = useMemo(
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
  const jornadasPlanificacion = periodoSeleccionadoEnCurso ? jornadasProgramadas : jornadasPróximoPeriodo;
  const planificacionRango = periodoSeleccionadoEnCurso
    ? `${format(periodStart, "dd/MM")} - ${format(periodEnd, "dd/MM")}`
    : `${format(nextPeriodStart, "dd/MM")} - ${format(nextPeriodEnd, "dd/MM")}`;

  const trabajosPlanificadosPróximoPeriodo = useMemo(() => {
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

  const cargaTécnicos = useMemo(() => {
    const map = new Map<string, number>();
    for (const jornada of jornadasProgramadas) {
      const ids = validJornadaCrew(jornada);
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([id, count]) => ({ id, nombre: profileById.get(id)?.nombre ?? "Sin técnico", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TOP_RANKING);
  }, [activeTechnicianIds, jornadasProgramadas, profileById, servicioById]);

  const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);
  const sinHorasPrev = jornadasRealizadasPrev.filter((row) => !Number(row.horas_trabajadas)).length;
  const técnicosPróximoPeriodo = new Set(jornadasPlanificacion.flatMap((j) => validJornadaCrew(j))).size;
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
  const técnicosConActividadPeriodo = useMemo(
    () => new Set(jornadasOperativasPeriodo.flatMap((j) => validJornadaCrew(j))),
    [activeTechnicianIds, jornadasOperativasPeriodo, servicioById],
  );
  const técnicosActivosPct = activeTechnicianIds.size > 0
    ? Math.round((técnicosConActividadPeriodo.size / activeTechnicianIds.size) * 100)
    : 0;
  const cierreAnteriorRango = `${format(previousPeriodStart, "dd/MM")} - ${format(previousPeriodEnd, "dd/MM")}`;
  const fueraTolerancia = jornadasPendientesCierre.filter((row) => differenceInCalendarDays(today, parseISO(row.fecha)) > DIAS_JORNADA_VENCIDA);
  const selectedTrend = selectedWeek?.variacion ?? pct(total(allPeriodFacts), total(allPrevPeriodFacts));
  // Fila 1 KPIs: calculados sobre el rango completo del usuario, no el ultimo bucket
  const totalPeriodo = total(allPeriodFacts);
  const facturasPeriodo = new Set(allPeriodFacts.map((row) => row.cod_factura)).size;
  const clientesAtendidosSemana = new Set(
    allPeriodFacts.map((row) => {
      const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      return normalizeClienteKey(nombre);
    }),
  ).size;
  const sucursalesConMovimiento = new Set(allPeriodFacts.map((row) => row.sucursal).filter(Boolean)).size;

  // Año anterior: mismo rango 1 año atras
  const totalPrevPeriodo = total(allPrevPeriodFacts);
  const facturasPrevPeriodo = new Set(allPrevPeriodFacts.map((row) => row.cod_factura)).size;
  const variacionTotalPct = pct(totalPeriodo, totalPrevPeriodo);
  const ticketPromedio = facturasPeriodo > 0 ? Math.round(totalPeriodo / facturasPeriodo) : 0;
  const ticketPromedioPrev = facturasPrevPeriodo > 0 ? Math.round(totalPrevPeriodo / facturasPrevPeriodo) : 0;
  const variacionTicketPct = pct(ticketPromedio, ticketPromedioPrev);
  const ticketSparkline = useMemo(() => {
    const values = weeklyRows
      .map((row) => (row.facturas > 0 ? weekMetric(row, "usd") / row.facturas : 0))
      .filter((value) => value > 0)
      .slice(-8);

    if (values.length < 2) return { path: "", last: null as { x: number; y: number } | null };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => ({
      x: 6 + (index / (values.length - 1)) * 108,
      y: 36 - ((value - min) / span) * 28,
    }));

    return {
      path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
      last: points[points.length - 1],
    };
  }, [weeklyRows]);
  const facturasPorCliente = clientesAtendidosSemana > 0 ? facturasPeriodo / clientesAtendidosSemana : 0;
  const clientesPareto80 = (() => {
    if (totalPeriodo <= 0) return 0;
    const totalsByClient = new Map<string, number>();
    for (const row of allPeriodFacts) {
      const nombre = row.cliente_id ? clienteById.get(row.cliente_id)?.nombre ?? row.entidad_nombre : row.entidad_nombre;
      const key = normalizeClienteKey(nombre);
      totalsByClient.set(key, (totalsByClient.get(key) ?? 0) + Number(row.total_venta || 0));
    }
    const threshold = totalPeriodo * 0.8;
    let accumulated = 0;
    let count = 0;
    for (const value of Array.from(totalsByClient.values()).sort((a, b) => b - a)) {
      accumulated += value;
      count += 1;
      if (accumulated >= threshold) break;
    }
    return count;
  })();
  const tipoFactBreakdown = (() => {
    const groups = { Cliente: 0, Garantia: 0, Interno: 0 } as Record<"Cliente" | "Garantia" | "Interno", number>;
    for (const row of allPeriodFacts) {
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
      ? { label: "Garantia", value: tipoFactBreakdown.pctGarantia }
      : { label: "Interno", value: tipoFactBreakdown.pctInterno };
  // top5ClientesPct: no se usa en el JSX (topClientes es para el tab Facturacion)
  const top5ClientesPct = (() => {
    const t = topClientes.slice(0, MAX_TOP_RANKING).reduce((a, r) => a + r.total, 0);
    return totalPeriodo > 0 ? Math.round((t / totalPeriodo) * 100) : 0;
  })();
  // topSucursalesPct: Top 2 sucursales sobre el rango completo
  const topSucursalesPct = (() => {
    const top2 = [...factBySucursal].sort((a, b) => b.total - a.total).slice(0, 2).reduce((a, r) => a + r.total, 0);
    return totalPeriodo > 0 ? Math.round((top2 / totalPeriodo) * 100) : 0;
  })();
  // Label del año anterior para SucursalBars
  const periodComparisonLabel = `${format(prevPeriodStartDate, "dd/MM/yy")} - ${format(prevPeriodEndDate, "dd/MM/yy")}`;

  // Fila sintetica con la agregaci-n del rango completo para MixRubros
  const periodRow = useMemo<WeekRow>(() => {
    const byConcept = { Repuestos: 0, Servicio: 0, Kilometraje: 0, Maquinarias: 0, Otros: 0 };
    for (const row of allPeriodFacts) {
      const rowConcept = concept(row);
      byConcept[rowConcept] += Number(row.total_venta || 0);
    }
    const { horasServicio, kmFacturados } = factMetricQuantities(allPeriodFacts);
    return {
      key: dateKey(periodStart),
      label: `${format(periodStart, "dd/MM/yy")} - ${format(periodEnd, "dd/MM/yy")}`,
      start: periodStart,
      end: periodEnd,
      total: totalPeriodo,
      repuestos: byConcept.Repuestos,
      servicio: byConcept.Servicio,
      kilometraje: byConcept.Kilometraje,
      maquinarias: byConcept.Maquinarias,
      otros: byConcept.Otros,
      horasServicio,
      kmFacturados,
      facturas: facturasPeriodo,
      clientes: clientesAtendidosSemana,
      comparisonTotal: totalPrevPeriodo,
      comparisonHorasServicio: 0,
      comparisonKmFacturados: 0,
      comparisonLabel: periodComparisonLabel,
      variacion: variacionTotalPct,
      rows: allPeriodFacts,
    };
  }, [allPeriodFacts, ordenServicioByNumero, totalPeriodo, facturasPeriodo, clientesAtendidosSemana, totalPrevPeriodo, periodStart, periodEnd, periodComparisonLabel, variacionTotalPct]);

  // Textos derivados del agrupador elegido.
  const periodoLabel =
    periodMode === "dia" ? "diario" : periodMode === "semana" ? "semanal" : periodMode === "mes" ? "mensual" : "anual";
  const T = useMemo(() => {
    const isSemana = periodMode === "semana";
    const periodoNombre = periodMode === "dia" ? "dia" : periodMode === "semana" ? "semana" : periodMode === "mes" ? "mes" : "anio";
    return {
      seleccionado: isSemana ? "semana seleccionada" : "periodo seleccionado",
      facturacion: isSemana ? "Facturación de la semana" : "Facturación del período",
      facturas: isSemana ? "Facturas de la semana" : "Facturas del período",
      comparativoFacturacion: `Facturación por ${periodoNombre}`,
      seleccionaPeriodo: `Selecciona un ${periodoNombre} para ver facturas, clientes y composición.`,
      periodoSeleccionado: `${periodoNombre.charAt(0).toUpperCase()}${periodoNombre.slice(1)} seleccionado`,
      sinFacturacion: `Sin facturación para este ${periodoNombre}.`,
      columnaPeriodo: periodMode === "dia" ? "Día" : periodMode === "semana" ? "Semana" : periodMode === "mes" ? "Mes" : "Año",
      carga: isSemana ? "Carga semanal" : "Carga técnica",
      lectura: isSemana ? "Lectura semanal" : "Lectura operativa",
      plan: isSemana ? "Plan semana" : "Próximo periodo",
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
      if (fTécnicos.length > 0 && !row.tecnicoIds.some((id) => fTécnicos.includes(id))) return false;
      if (fMarcas.length > 0 && !fMarcas.includes(row.marca)) return false;
      return true;
    }).sort((a, b) => {
      const order: Record<string, number> = { pausado: 0, iniciado: 1, programado: 2, pendiente: 3, completado: 4 };
      return (order[a.estado] ?? 9) - (order[b.estado] ?? 9) || b.ultimaFecha.localeCompare(a.ultimaFecha);
    });
  }, [trabajosBase, fEstadosTrabajo, fTécnicos, fMarcas]);



  const matrizTécnicosDías = useMemo(() => {
    const bucketMode: PeriodMode = periodMode;
    const bucketKey = (iso: string) => {
      if (bucketMode === "dia") return iso;
      const d = parseISO(iso);
      if (bucketMode === "mes") return format(d, "yyyy-MM");
      if (bucketMode === "anio") return format(d, "yyyy");
      return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
    };
    const bucketLabel = (key: string) => {
      if (bucketMode === "dia") {
        const d = parseISO(key);
        return `${["D", "L", "M", "X", "J", "V", "S"][getDay(d)]} ${format(d, "dd")}`;
      }
      if (bucketMode === "mes") {
        const [y, m] = key.split("-");
        return format(new Date(Number(y), Number(m) - 1, 1), "MMM yy");
      }
      if (bucketMode === "anio") return key;
      const w = key.split("-W")[1];
      return `Sem ${Number(w)}`;
    };

    const bucketsSet = new Set<string>();
    if (bucketMode === "dia") {
      let cursor = periodStart;
      while (cursor <= periodEnd) {
        bucketsSet.add(format(cursor, "yyyy-MM-dd"));
        cursor = addDays(cursor, 1);
      }
    }

    const visibleTrabajoIds = new Set(trabajosResumen.map((row) => row.id));
    const trabajoById = new Map(trabajos.map((trabajo) => [trabajo.id, trabajo]));
    const servicioATrabajo = new Map<string, string>();
    for (const trabajo of trabajos) {
      if (trabajo.legacy_servicio_id) servicioATrabajo.set(trabajo.legacy_servicio_id, trabajo.id);
    }

    const rowsBySucursal = new Map<string, Map<string, {
      id: string;
      nombre: string;
      sucursal: string;
      cells: Record<string, {
        jornadas: number;
        horas: number;
        realizadas: number;
        noRealizadas: number;
        programadas: number;
        noDisponibilidad: string[];
        refs: Array<{ id?: string; fecha?: string; ref: string; cliente: string; trabajo?: string; sucursal?: string; tecnico?: string; estado: string; motivo?: string | null }>;
      }>;
      tieneActividad: boolean;
      tieneNoDisponibilidad: boolean;
    }>>();

    const ensureTecnicoRow = (tecnicoId: string) => {
      const profile = profileById.get(tecnicoId);
      const sucursalTecnico = profile?.sucursal ?? "Sin sucursal";
      if (!rowsBySucursal.has(sucursalTecnico)) rowsBySucursal.set(sucursalTecnico, new Map());
      const block = rowsBySucursal.get(sucursalTecnico)!;
      if (!block.has(tecnicoId)) {
        block.set(tecnicoId, {
          id: tecnicoId,
          nombre: profile?.nombre ?? "Sin técnico",
          sucursal: sucursalTecnico,
          cells: {},
          tieneActividad: false,
          tieneNoDisponibilidad: false,
        });
      }
      return block.get(tecnicoId)!;
    };

    for (const tecnicoId of activeTechnicianIds) ensureTecnicoRow(tecnicoId);

    for (const jornada of jornadas) {
      if (jornada.estado !== "Pendiente" && jornada.estado !== "Completado" && jornada.estado !== "Cancelada") continue;
      if (!inRange(jornada.fecha, periodStart, periodEnd)) continue;
      const trabajoId = servicioATrabajo.get(jornada.servicio_id);
      if (!trabajoId || !visibleTrabajoIds.has(trabajoId)) continue;

      const key = bucketKey(jornada.fecha);
      bucketsSet.add(key);

      const trabajo = trabajoById.get(trabajoId);
      const servicio = servicioById.get(jornada.servicio_id);
      const cliente = trabajo?.cliente_id
        ? clienteById.get(trabajo.cliente_id)?.nombre ?? "Sin cliente"
        : servicio?.cliente_id
          ? clienteById.get(servicio.cliente_id)?.nombre ?? "Sin cliente"
          : "Sin cliente";
      const ref = trabajo?.codigo ?? "TR";
      const trabajoDescripcion = trabajo?.descripcion_problema ?? servicio?.trabajo_descripcion ?? "";
      const sucursalTrabajo = trabajo?.sucursal ?? servicio?.sucursal ?? "Sin sucursal";
      const estadoRef = jornada.estado === "Completado"
        ? "Realizada"
        : jornada.estado === "Cancelada"
          ? "No realizada"
          : jornada.fecha < todayStr
            ? "Vencida"
            : "Programada";
      const horasJornada = jornada.estado === "Completado" ? Number(jornada.horas_trabajadas || 0) : 0;

      for (const tecnicoId of validJornadaCrew(jornada)) {
        const row = ensureTecnicoRow(tecnicoId);
        const cell = row.cells[key] ?? {
          jornadas: 0,
          horas: 0,
          realizadas: 0,
          noRealizadas: 0,
          programadas: 0,
          noDisponibilidad: [],
          refs: [],
        };
        cell.jornadas += 1;
        cell.horas += horasJornada;
        if (jornada.estado === "Completado") cell.realizadas += 1;
        else if (jornada.estado === "Cancelada" || jornada.fecha < todayStr) cell.noRealizadas += 1;
        else cell.programadas += 1;
        cell.refs.push({
          id: jornada.id,
          fecha: jornada.fecha,
          ref,
          cliente,
          trabajo: trabajoDescripcion,
          sucursal: sucursalTrabajo,
          tecnico: row.nombre,
          estado: estadoRef,
        });
        row.cells[key] = cell;
        row.tieneActividad = true;
      }
    }

    for (const disp of disponibilidades) {
      if (!activeTechnicianIds.has(disp.tecnico_id)) continue;
      const desde = disp.fecha_inicio > dateKey(periodStart) ? disp.fecha_inicio : dateKey(periodStart);
      const hasta = disp.fecha_fin < dateKey(periodEnd) ? disp.fecha_fin : dateKey(periodEnd);
      if (desde > hasta) continue;

      const row = ensureTecnicoRow(disp.tecnico_id);
      let cursor = parseISO(desde);
      const endDisp = parseISO(hasta);
      while (cursor <= endDisp) {
        const key = bucketKey(format(cursor, "yyyy-MM-dd"));
        bucketsSet.add(key);
        const cell = row.cells[key] ?? {
          jornadas: 0,
          horas: 0,
          realizadas: 0,
          noRealizadas: 0,
          programadas: 0,
          noDisponibilidad: [],
          refs: [],
        };
        const motivo = disp.tipo ?? disp.observacion ?? "No disponible";
        if (!cell.noDisponibilidad.includes(motivo)) cell.noDisponibilidad.push(motivo);
        row.cells[key] = cell;
        row.tieneNoDisponibilidad = true;
        cursor = addDays(cursor, 1);
      }
    }

    if (bucketsSet.size === 0) {
      if (bucketMode === "dia") {
        let cursor = periodStart;
        while (cursor <= periodEnd) {
          bucketsSet.add(format(cursor, "yyyy-MM-dd"));
          cursor = addDays(cursor, 1);
        }
      } else if (bucketMode === "semana") {
        const start = startOfWeek(periodStart, { weekStartsOn: 1 });
        const end = endOfWeek(periodEnd, { weekStartsOn: 1 });
        let cursor = start;
        while (cursor <= end) {
          bucketsSet.add(`${getISOWeekYear(cursor)}-W${String(getISOWeek(cursor)).padStart(2, "0")}`);
          cursor = addWeeks(cursor, 1);
        }
      } else if (bucketMode === "mes") {
        let cursor = startOfMonth(periodStart);
        const end = startOfMonth(periodEnd);
        while (cursor <= end) {
          bucketsSet.add(format(cursor, "yyyy-MM"));
          cursor = addMonths(cursor, 1);
        }
      } else {
        let cursor = startOfYear(periodStart);
        const end = startOfYear(periodEnd);
        while (cursor <= end) {
          bucketsSet.add(format(cursor, "yyyy"));
          cursor = addYears(cursor, 1);
        }
      }
    }

    const buckets = Array.from(bucketsSet).sort();
    const overLimit = buckets.length > 31;
    const bucketLabels = Object.fromEntries(buckets.map((key) => [key, bucketLabel(key)]));
    const currentBucketKey = inRange(todayStr, periodStart, periodEnd) ? bucketKey(todayStr) : null;

    const blocks = Array.from(rowsBySucursal.entries())
      .map(([sucursal, rowsMap]) => {
        const técnicos = Array.from(rowsMap.values())
          .map((row) => ({
            id: row.id,
            nombre: row.nombre,
            sucursal: row.sucursal,
            sinAsignacion: !row.tieneActividad && !row.tieneNoDisponibilidad,
            tieneNoDisponibilidad: row.tieneNoDisponibilidad,
            cells: row.cells,
          }))
          .sort((a, b) => {
            if (a.sinAsignacion !== b.sinAsignacion) return a.sinAsignacion ? 1 : -1;
            return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
          });

        const totalActividad = técnicos.reduce((acc, row) => {
          return acc + buckets.reduce((bucketAcc, bucket) => {
            const cell = row.cells[bucket];
            if (!cell) return bucketAcc;
            return bucketAcc + (matrixMetric === "horas" ? cell.horas : cell.jornadas + cell.noDisponibilidad.length);
          }, 0);
        }, 0);

        return {
          sucursal,
          totalActividad,
          totalTécnicos: técnicos.length,
          técnicos,
        };
      })
      .sort((a, b) => b.totalActividad - a.totalActividad || a.sucursal.localeCompare(b.sucursal, "es", { sensitivity: "base" }));

    return {
      buckets,
      blocks,
      bucketLabels,
      bucketMode,
      overLimit,
      currentBucketKey,
    };
  }, [activeTechnicianIds, clienteById, disponibilidades, jornadas, matrixMetric, periodEnd, periodMode, periodStart, profileById, servicioById, todayStr, trabajos, trabajosResumen]);
  const trabajosActivos = trabajosResumen.filter((row) => row.estado !== "completado");
  const trabajosConCierre = trabajosResumen.filter((row) => row.estado === "completado").length;
  const técnicosTotales = activeTechnicianIds.size;

  const trabajosAbiertosSinCierre = useMemo(() => {
    return trabajosActivos
      .map((row) => ({
        id: row.id,
        ref: row.ref,
        cliente: row.cliente,
        sucursal: row.sucursal,
        estado: estadoTrabajoLabel(row.estado as EstadoTrabajo),
        ultimaFecha: row.ultimaFechaPeriodo
          ? format(parseISO(row.ultimaFechaPeriodo), "dd/MM/yy")
          : row.ultimaFecha
            ? format(parseISO(row.ultimaFecha), "dd/MM/yy")
            : "Sin fecha",
        díasSinCierre: Math.max(
          0,
          differenceInCalendarDays(
            today,
            parseISO(row.ultimaFechaPeriodo || row.ultimaFecha || row.creadoEn || todayStr),
          ),
        ),
        pendientes: row.estado === "pendiente" ? row.totalJornadasPeriodo : row.pendientesPeriodoVencidas,
        programados: row.estado === "programado" ? row.totalJornadasPeriodo : row.pendientesPeriodo,
        iniciados: row.estado === "iniciado" ? row.realizadasPeriodo : 0,
      }))
      .sort((a, b) => b.díasSinCierre - a.díasSinCierre || a.ref.localeCompare(b.ref));
  }, [trabajosActivos]);

  // Estadisticas de "flujo operativo" basadas en trabajosResumen (respeta los filtros activos de la pestana Trabajos).
  const flujo = useMemo(() => {
    // Solo trabajos con al menos una jornada en el rango selecciónado
    const enPeriodo = trabajosResumen.filter((r) => r.totalJornadasPeriodo > 0);
    const total = enPeriodo.length;
    const culminados = enPeriodo.filter((r) => r.estado === "completado").length;
    const pausados = enPeriodo.filter((r) => r.estado === "pausado").length;
    const pendiente = enPeriodo.filter((r) => r.estado === "pendiente").length;
    const programado = enPeriodo.filter((r) => r.estado === "programado").length;
    const iniciado = enPeriodo.filter((r) => r.estado === "iniciado").length;
    const abiertos = total - culminados - pausados;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
    return { total, culminados, abiertos, pausados, pendiente, programado, iniciado, pct };
  }, [trabajosResumen]);

  const jornadasResultadoPeriodo = useMemo(() => {
    const trabajoIds = new Set(trabajosResumen.map((row) => row.id));
    const rows: Jornada[] = [];

    for (const trabajoId of trabajoIds) {
      const trabajoJornadas = (jornadasByTrabajo.get(trabajoId) ?? []).filter((jornada) => {
        if (!inRange(jornada.fecha, periodStart, periodEnd)) return false;
        if (fTécnicos.length === 0) return true;
        return jornadaCrewIds(jornada).some((id) => fTécnicos.includes(id));
      });
      rows.push(...trabajoJornadas);
    }

    return rows;
  }, [fTécnicos, jornadasByTrabajo, periodEnd, periodStart, servicioById, trabajosResumen]);

  const jornadasResultadoResumen = useMemo(() => {
    let realizadas = 0;
    let noRealizadas = 0;
    let pendientes = 0;

    for (const jornada of jornadasResultadoPeriodo) {
      if (jornada.estado === "Completado") realizadas += 1;
      else if (jornada.estado === "Cancelada") noRealizadas += 1;
      else if (jornada.estado === "Pendiente") pendientes += 1;
    }

    const programadas = jornadasResultadoPeriodo.length;
    const cerradas = realizadas + noRealizadas;
    const pct = (value: number) => (programadas > 0 ? Math.round((value / programadas) * 100) : 0);

    return {
      programadas,
      realizadas,
      noRealizadas,
      pendientes,
      cerradas,
      pctRealizadas: pct(realizadas),
      pctNoRealizadas: pct(noRealizadas),
      pctPendientes: pct(pendientes),
      pctCerradas: pct(cerradas),
    };
  }, [jornadasResultadoPeriodo]);

  const cumplimientoAgenda = useMemo(() => {
    const buckets = agendaBuckets(periodStart, periodEnd, periodMode);
    const currentBucketKey = agendaBucketKey(todayStr, periodMode);
    const rowsByKey = new Map(
      buckets.map((key) => [
        key,
        {
          key,
          label: agendaBucketLabel(key, periodMode),
          programadas: 0,
          realizadas: 0,
          noRealizadas: 0,
          pendientes: 0,
          porcentaje: 0,
        },
      ]),
    );

    for (const jornada of jornadasResultadoPeriodo) {
      const key = agendaBucketKey(jornada.fecha, periodMode);
      const row = rowsByKey.get(key);
      if (!row) continue;
      row.programadas += 1;
      if (jornada.estado === "Completado") row.realizadas += 1;
      else if (jornada.estado === "Cancelada") row.noRealizadas += 1;
      else if (jornada.estado === "Pendiente") row.pendientes += 1;
    }

    return buckets.map((key) => {
      const row = rowsByKey.get(key)!;
      const estadoPeriodo: "cerrado" | "actual" | "futuro" =
        key < currentBucketKey ? "cerrado" : key === currentBucketKey ? "actual" : "futuro";
      return {
        ...row,
        porcentaje: row.programadas > 0 ? Math.round((row.realizadas / row.programadas) * 100) : 0,
        estadoPeriodo,
      };
    });
  }, [jornadasResultadoPeriodo, periodEnd, periodMode, periodStart]);

  const cumplimientoAgendaInsights = useMemo(() => {
    const resultadosCerrados = cumplimientoAgenda.reduce(
      (acc, row) => {
        acc.realizadas += row.realizadas;
        acc.noRealizadas += row.noRealizadas;
        return acc;
      },
      { realizadas: 0, noRealizadas: 0 },
    );
    const totalResultados = resultadosCerrados.realizadas + resultadosCerrados.noRealizadas;
    const efectividad = totalResultados > 0
      ? Math.round((resultadosCerrados.realizadas / totalResultados) * 100)
      : null;

    const periodosCerrados = cumplimientoAgenda.filter(
      (row) => row.estadoPeriodo === "cerrado" && row.programadas > 0,
    );
    const ultimosPeriodos = periodosCerrados.slice(-2);
    const tendencia = ultimosPeriodos.length === 2
      ? {
          delta: ultimosPeriodos[1].porcentaje - ultimosPeriodos[0].porcentaje,
          desde: ultimosPeriodos[0].label,
          hasta: ultimosPeriodos[1].label,
        }
      : null;

    const mayorDesvio = periodosCerrados
      .map((row) => ({
        label: row.label,
        porcentaje: row.programadas > 0 ? Math.round((row.noRealizadas / row.programadas) * 100) : 0,
      }))
      .filter((row) => row.porcentaje > 0)
      .sort((a, b) => b.porcentaje - a.porcentaje)[0] ?? null;

    return { efectividad, tendencia, mayorDesvio };
  }, [cumplimientoAgenda]);

  const tecnicosNoRealizados = useMemo(() => {
    const rowsById = new Map<string, {
      id: string;
      nombre: string;
      programadas: number;
      realizadas: number;
      noRealizadas: number;
      pendientes: number;
      porcentaje: number;
      activo: boolean;
    }>();
    const selectedTechnicians = fTécnicos.length > 0 ? new Set(fTécnicos) : null;

    for (const jornada of jornadasResultadoPeriodo) {
      const crew = historicalJornadaCrew(jornada).filter((id) => !selectedTechnicians || selectedTechnicians.has(id));
      for (const id of crew) {
        const profile = profileById.get(id);
        const row = rowsById.get(id) ?? {
          id,
          nombre: profile?.nombre ?? "Sin técnico",
          programadas: 0,
          realizadas: 0,
          noRealizadas: 0,
          pendientes: 0,
          porcentaje: 0,
          activo: profile?.activo !== false,
        };
        row.programadas += 1;
        if (jornada.estado === "Completado") row.realizadas += 1;
        else if (jornada.estado === "Cancelada") row.noRealizadas += 1;
        else if (jornada.estado === "Pendiente") row.pendientes += 1;
        rowsById.set(id, row);
      }
    }

    return Array.from(rowsById.values())
      .map((row) => ({
        ...row,
        porcentaje: row.programadas > 0 ? Math.round((row.noRealizadas / row.programadas) * 100) : 0,
      }))
      .filter((row) => row.noRealizadas > 0)
      .sort(
        (a, b) =>
          b.porcentaje - a.porcentaje ||
          b.noRealizadas - a.noRealizadas ||
          b.programadas - a.programadas ||
          a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
      );
  }, [fTécnicos, jornadasResultadoPeriodo, profileById, servicioById]);

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

  // Carga por sucursal: clasifica trabajos segun lo que ocurrio DENTRO del periodo.
  // - cerrados: trabajos hoy completados cuya fecha de cierre cae en el periodo
  // - pausados: trabajos hoy pausados con actividad (jornada/actualizacion) en el periodo
  // - abiertos: trabajos con actividad en el periodo que no son cerrados-en-periodo ni pausados
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

  // Distribucion por marca en el periodo (reemplaza "Lectura operativa")
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
    // Matriz tecnica agrupada con el mismo criterio visible del dashboard.
    const bucketMode: PeriodMode = periodMode;
    const bucketKey = (iso: string) => {
      if (bucketMode === "dia") return iso; // yyyy-MM-dd, ya es la clave
      const d = parseISO(iso);
      if (bucketMode === "mes") return format(d, "yyyy-MM");
      if (bucketMode === "anio") return format(d, "yyyy");
      return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
    };
    const bucketLabel = (key: string) => {
      if (bucketMode === "dia") {
        const d = parseISO(key);
        return ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][getDay(d)];
      }
      if (bucketMode === "mes") {
        const [y, m] = key.split("-");
        return format(new Date(Number(y), Number(m) - 1, 1), "MMM yy");
      }
      if (bucketMode === "anio") return key;
      const w = key.split("-W")[1];
      return `Sem ${Number(w)}`;
    };

    const bucketsSet = new Set<string>();
    // En modo "dia" sembrar todos los días del rango para que aparezcan aúnque no haya jornadas
    if (bucketMode === "dia") {
      let cursor = periodStart;
      while (cursor <= periodEnd) {
        bucketsSet.add(format(cursor, "yyyy-MM-dd"));
        cursor = addDays(cursor, 1);
      }
    }
    const map = new Map<string, { id: string; nombre: string; porBucket: Record<string, { jornadas: number; horas: number }>; totalJornadas: number; totalHoras: number; trabajos: Set<string> }>();

    const ensureTecnicoRow = (id: string) => {
      if (map.has(id)) return;
      map.set(id, {
        id,
        nombre: profileById.get(id)?.nombre ?? "Sin técnico",
        porBucket: {},
        totalJornadas: 0,
        totalHoras: 0,
        trabajos: new Set<string>(),
      });
    };

    for (const id of activeTechnicianIds) ensureTecnicoRow(id);

    // Scope: trabajos visibles tras aplicar filtros de la pestana Trabajos (estado/tecnico/marca).
    const trabajoIdsEnScope = new Set(trabajosResumen.map((t) => t.id));
    // Mapa inverso: servicio_id -> trabajo_id (mismo criterio que jornadasByTrabajo)
    const servicioATrabajo = new Map<string, string>();
    for (const trabajo of trabajos) {
      if (trabajo.legacy_servicio_id) servicioATrabajo.set(trabajo.legacy_servicio_id, trabajo.id);
    }

    const trabajosPorBucketMap = new Map<string, Set<string>>();
    for (const jornada of jornadas) {
      // Cancelada no cuenta; Pendiente y Completado si (jornadas asignadas)
      if (jornada.estado !== "Pendiente" && jornada.estado !== "Completado") continue;
      if (!inRange(jornada.fecha, periodStart, periodEnd)) continue;
      const trabajoId = servicioATrabajo.get(jornada.servicio_id);
      if (!trabajoId || !trabajoIdsEnScope.has(trabajoId)) continue;

      const key = bucketKey(jornada.fecha);
      bucketsSet.add(key);
      if (!trabajosPorBucketMap.has(key)) trabajosPorBucketMap.set(key, new Set());
      trabajosPorBucketMap.get(key).add(trabajoId);
      // Solo Completado aporta horas reales
      const horasJ = jornada.estado === "Completado" ? Number(jornada.horas_trabajadas || 0) : 0;
      for (const id of historicalJornadaCrew(jornada)) {
        ensureTecnicoRow(id);
        const current = map.get(id) ?? {
          id,
          nombre: profileById.get(id)?.nombre ?? "Sin técnico",
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

    const noDisponiblesPorBucketMap = new Map<string, Set<string>>();
    for (const disp of disponibilidades) {
      if (!activeTechnicianIds.has(disp.tecnico_id)) continue;
      const desde = disp.fecha_inicio > dateKey(periodStart) ? disp.fecha_inicio : dateKey(periodStart);
      const hasta = disp.fecha_fin < dateKey(periodEnd) ? disp.fecha_fin : dateKey(periodEnd);
      if (desde > hasta) continue;

      let cursor = parseISO(desde);
      const endDisp = parseISO(hasta);
      while (cursor <= endDisp) {
        const key = bucketKey(format(cursor, "yyyy-MM-dd"));
        bucketsSet.add(key);
        const current = noDisponiblesPorBucketMap.get(key) ?? new Set<string>();
        current.add(disp.tecnico_id);
        noDisponiblesPorBucketMap.set(key, current);
        cursor = addDays(cursor, 1);
      }
    }

    if (bucketsSet.size === 0) {
      if (bucketMode === "dia") {
        let cursor = periodStart;
        while (cursor <= periodEnd) {
          bucketsSet.add(format(cursor, "yyyy-MM-dd"));
          cursor = addDays(cursor, 1);
        }
      } else if (bucketMode === "semana") {
        const start = startOfWeek(periodStart, { weekStartsOn: 1 });
        const end = endOfWeek(periodEnd, { weekStartsOn: 1 });
        let cursor = start;
        while (cursor <= end) {
          bucketsSet.add(`${getISOWeekYear(cursor)}-W${String(getISOWeek(cursor)).padStart(2, "0")}`);
          cursor = addWeeks(cursor, 1);
        }
      } else if (bucketMode === "mes") {
        let cursor = startOfMonth(periodStart);
        const end = startOfMonth(periodEnd);
        while (cursor <= end) {
          bucketsSet.add(format(cursor, "yyyy-MM"));
          cursor = addMonths(cursor, 1);
        }
      } else {
        let cursor = startOfYear(periodStart);
        const end = startOfYear(periodEnd);
        while (cursor <= end) {
          bucketsSet.add(format(cursor, "yyyy"));
          cursor = addYears(cursor, 1);
        }
      }
    }

    const buckets = Array.from(bucketsSet).sort();
    const trabajosPorBucket: Record<string, number> = {};
    const técnicosNoDisponiblesPorBucket: Record<string, number> = {};
    for (const k of buckets) trabajosPorBucket[k] = trabajosPorBucketMap.get(k)?.size ?? 0;
    for (const k of buckets) técnicosNoDisponiblesPorBucket[k] = noDisponiblesPorBucketMap.get(k)?.size ?? 0;
    const tecnicoFilterSet = fTécnicos.length > 0 ? new Set(fTécnicos) : null;
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

    const equipoTotalTrabajos = buckets.reduce((s, k) => s + (trabajosPorBucket[k] ?? 0), 0);
    const isSunBucket = (k: string) => bucketMode === "dia" && getDay(parseISO(k)) === 0;
    const nonSunTechCounts = buckets
      .filter((k) => !isSunBucket(k))
      .map((k) => rowsAll.filter((r) => (r.porBucket[k]?.jornadas ?? 0) > 0).length);
    const equipoPromTécnicos: string = nonSunTechCounts.length > 0
      ? (nonSunTechCounts.reduce((a, b) => a + b, 0) / nonSunTechCounts.length).toFixed(1)
      : "-";

    return { buckets, rows, allRows: rowsAll, totalesPorBucket, trabajosPorBucket, técnicosNoDisponiblesPorBucket, bucketLabel, bucketMode, equipoTotalTrabajos, equipoPromTécnicos };
  }, [activeTechnicianIds, disponibilidades, jornadas, trabajos, trabajosResumen, fTécnicos, periodMode, periodStart, periodEnd, profileById, servicioById]);

  const limpiar = () => {
    setDateFrom(initialDateFrom);
    setDateTo(initialDateTo);
    setSelectedWeekKey(null);
    setFSucursales([]);
    setFRubros(createDefaultFacturacionRubros());
    setFOSRubros([]);
    setFMarcas([]);
    setFTiposTiempo([]);
    setFEstadosTrabajo([]);
    setFTécnicos([]);
    setFResponsablesOS([]);
    setFEstadosOS([]);
    setPeriodMode("mes");
    setQ("");
  };

  const rubrosFacturacionPersonalizados = !isDefaultFacturacionRubros(fRubros);
  const filtrosActivos =
    (dateFrom !== initialDateFrom ? 1 : 0) +
    (dateTo !== initialDateTo ? 1 : 0) +
    (fSucursales.length > 0 ? 1 : 0) +
    (!filtrosOSActivos && rubrosFacturacionPersonalizados ? 1 : 0) +
    (filtrosOSActivos && fOSRubros.length > 0 ? 1 : 0) +
    (fMarcas.length > 0 ? 1 : 0) +
    (fTiposTiempo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fEstadosTrabajo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fTécnicos.length > 0 ? 1 : 0) +
    (filtrosServiciosActivos && fResponsablesOS.length > 0 ? 1 : 0) +
    (filtrosServiciosActivos && fEstadosOS.length > 0 ? 1 : 0) +
    (periodMode !== "mes" ? 1 : 0) +
    (q.trim() ? 1 : 0);
  const filtrosAvanzadosActivos =
    (!filtrosOSActivos && rubrosFacturacionPersonalizados ? 1 : 0) +
    (filtrosOSActivos && fOSRubros.length > 0 ? 1 : 0) +
    (fMarcas.length > 0 ? 1 : 0) +
    (fTiposTiempo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fEstadosTrabajo.length > 0 ? 1 : 0) +
    (filtrosTrabajoActivos && fTécnicos.length > 0 ? 1 : 0) +
    (filtrosServiciosActivos && fResponsablesOS.length > 0 ? 1 : 0) +
    (filtrosServiciosActivos && fEstadosOS.length > 0 ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-[1440px] overflow-x-hidden px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-6 sm:py-4">
      <div className="space-y-2.5 sm:space-y-3">
      <Tabs value={section} onValueChange={goSection} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h1 className={pageTitle}>Dashboard ejecutivo</h1>
        <TabsList className="hidden h-9 min-w-max grid-cols-4 sm:grid">
          <TabsTrigger value="resumen" className="h-7 whitespace-nowrap px-3 text-xs">Vista general</TabsTrigger>
          <TabsTrigger value="facturación" className="h-7 whitespace-nowrap px-3 text-xs">Facturación</TabsTrigger>
          <TabsTrigger value="trabajos" className="h-7 whitespace-nowrap px-3 text-xs">Trabajos</TabsTrigger>
          <TabsTrigger value="servicios" className="h-7 whitespace-nowrap px-3 text-xs">Servicios</TabsTrigger>
        </TabsList>
      </div>
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: filtrosServiciosActivos ? "OS, técnico, cliente o factura..." : "Cliente, factura o concepto..." }}
        activeCount={filtrosActivos}
        onClear={limpiar}
        expanded={showAdvancedFilters ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <FilterMultiSelect
              label="Marca"
              values={fMarcas}
              onChange={setFMarcas}
              placeholder="Todos"
              width="w-full"
              options={MARCAS.map((m) => ({ value: m, label: m }))}
            />
            {section === "os" ? (
              <FilterMultiSelect
                label="Concepto OS"
                values={fOSRubros}
                onChange={(values) => setFOSRubros(values as OSRubro[])}
                placeholder="Todos"
                width="w-full"
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
                width="w-full"
                options={[
                  { value: "Servicio", label: "Servicios" },
                  { value: "Repuestos", label: "Repuestos" },
                  { value: "Kilometraje", label: "Kilometraje" },
                  { value: "Maquinarias", label: "Maquinarias" },
                  { value: "Otros", label: "Otros" },
                ]}
              />
            )}
            <FilterMultiSelect
              label="Tipo tiempo"
              values={fTiposTiempo}
              onChange={setFTiposTiempo}
              placeholder="Todos"
              width="w-full"
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
                  width="w-full"
                  options={[
                    { value: "pendiente", label: "Pendiente" },
                    { value: "programado", label: "Programado" },
                    { value: "iniciado", label: "Iniciado" },
                    { value: "pausado", label: "Pausado" },
                    { value: "completado", label: "Completado" },
                  ]}
                />
                <FilterMultiSelect
                  label="Técnico o cuadrilla"
                  values={fTécnicos}
                  onChange={setFTécnicos}
                  placeholder="Todos"
                  width="w-full"
                  options={technicianOptions.map((row) => ({ value: row.id, label: row.nombre }))}
                />
              </>
            )}
            {section === "servicios" && (
              <>
                <FilterMultiSelect
                  label="Estado OS"
                  values={fEstadosOS}
                  onChange={(values) => setFEstadosOS(values as Array<"cerrada" | "abierta" | "otra">)}
                  placeholder="Todos"
                  width="w-full"
                  options={[
                    { value: "cerrada", label: "Cerradas" },
                    { value: "abierta", label: "Abiertas" },
                    { value: "otra", label: "Anuladas / canceladas" },
                  ]}
                />
                <FilterMultiSelect
                  label="Técnico responsable"
                  values={fResponsablesOS}
                  onChange={setFResponsablesOS}
                  placeholder="Todos"
                  width="w-full"
                  options={responsablesOSOptions.map((nombre) => ({ value: nombre, label: nombre }))}
                />
              </>
            )}
          </div>
        ) : null}
      >
        <FilterCustom label="Período rápido" width="w-[190px]">
          <select
            value={activeDatePreset}
            onChange={(event) => applyDatePreset(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Personalizado</option>
            {datePresets.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
          </select>
        </FilterCustom>
        <FilterDate label="Desde" value={dateFrom} onChange={setDateFrom} width="w-[140px]" max={dateTo} />
        <FilterDate label="Hasta" value={dateTo} onChange={setDateTo} width="w-[140px]" min={dateFrom} />
        <PeriodSelector value={periodMode} onChange={setPeriodMode} disabledModes={disabledGranularities} />
        <FilterMultiSelect
          label="Sucursal"
          values={fSucursales}
          onChange={setFSucursales}
          placeholder="Todos"
          width="w-[170px]"
          options={SUCURSALES.map((s) => ({ value: s, label: s }))}
        />
        <FilterCustom label="Filtros" width="w-auto">
          <Button
            type="button"
            variant={showAdvancedFilters || filtrosAvanzadosActivos > 0 ? "default" : "outline"}
            size="sm"
            className="h-9 w-full gap-2 whitespace-nowrap sm:w-auto"
            onClick={() => setShowAdvancedFilters((value) => !value)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Más filtros{filtrosAvanzadosActivos > 0 ? ` (${filtrosAvanzadosActivos})` : ""}
          </Button>
        </FilterCustom>
      </FiltersBar>

        <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden">
        <TabsList className="inline-flex h-auto min-w-max">
          <TabsTrigger value="resumen" className="whitespace-nowrap">Vista general</TabsTrigger>
          <TabsTrigger value="facturación" className="whitespace-nowrap">Facturación</TabsTrigger>
          <TabsTrigger value="trabajos" className="whitespace-nowrap">Trabajos</TabsTrigger>
          <TabsTrigger value="servicios" className="whitespace-nowrap">Servicios</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="resumen" className="space-y-3">

          {/* FILA 1 - FINANCIERO */}
          {loading ? (
            <DashboardKPISkeleton count={4} />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => goSection("facturación")}
                className="text-left"
              >
                <Card className={cn(
                  "relative flex h-full min-h-[132px] flex-col justify-between overflow-hidden bg-card p-4 pt-5 transition-colors hover:bg-accent/50",
                  (variacionTotalPct ?? 0) < -20 && "border-destructive/40",
                )}>
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
                  <div className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <DollarSign className="h-[18px] w-[18px]" />
                  </div>
                  <div className="pr-10 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                    Facturacion del periodo - {format(periodStart, "dd/MM/yy")} - {format(periodEnd, "dd/MM/yy")}
                  </div>
                  <div className="mt-2 text-[24px] font-extrabold leading-tight tabular-nums sm:text-[26px]">{money(totalPeriodo)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {variacionTotalPct != null ? (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                        variacionTotalPct >= 0
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border border-red-200 bg-red-50 text-red-700",
                      )}>
                        {variacionTotalPct >= 0 ? "+" : "-"} {Math.abs(variacionTotalPct)}% vs año anterior
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">sin base previa</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{facturasPeriodo} facturas</span>
                  </div>
                </Card>
              </button>

              <button type="button" onClick={() => goSection("facturación")} className="text-left">
                <Card className="relative flex h-full min-h-[132px] flex-col justify-between overflow-hidden bg-card p-4 pt-5 transition-colors hover:bg-accent/50">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-sky-500" />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Clientes</div>
                      <div className="mt-2 text-[24px] font-extrabold leading-tight tabular-nums sm:text-[26px]">{clientesAtendidosSemana}</div>
                      <div className="text-[11px] text-muted-foreground">{facturasPorCliente.toFixed(1).replace(".", ",")} fact./cliente</div>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="h-[18px] w-[18px]" />
                    </div>
                  </div>
                  <div className="relative z-10 mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <BarChart3 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span><span className="font-semibold text-foreground">{clientesPareto80}</span> clientes concentran 80%</span>
                  </div>
                </Card>
              </button>

              <button type="button" onClick={() => goSection("facturación")} className="text-left">
                <Card className={cn(
                  "relative flex h-full min-h-[132px] flex-col justify-between overflow-hidden bg-card p-4 pt-5 transition-colors hover:bg-accent/50",
                  (variacionTicketPct ?? 0) < -10 && "border-destructive/40",
                )}>
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
                  <div className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Receipt className="h-[18px] w-[18px]" />
                  </div>
                  {ticketSparkline.path ? (
                    <svg
                      className="pointer-events-none absolute right-4 top-14 hidden h-9 w-24 text-primary/45 sm:block"
                      viewBox="0 0 120 44"
                      aria-hidden="true"
                    >
                      <path d={ticketSparkline.path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
                      {ticketSparkline.last ? (
                        <circle cx={ticketSparkline.last.x} cy={ticketSparkline.last.y} r="2.8" fill="white" stroke="currentColor" strokeWidth="2" />
                      ) : null}
                    </svg>
                  ) : null}
                  <div className="relative z-10 flex items-start justify-between gap-3 pr-16 sm:pr-24">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Ticket promedio</div>
                      <div className="mt-2 text-[24px] font-extrabold leading-tight tabular-nums sm:text-[26px]">{money(ticketPromedio)}</div>
                      <div className="text-[11px] text-muted-foreground">por factura</div>
                    </div>
                  </div>
                  <div className="relative z-10 mt-3 flex items-center gap-2 text-[11px]">
                    {variacionTicketPct != null ? (
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold tabular-nums", variacionTicketPct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-destructive")}>
                        {variacionTicketPct >= 0 ? "+" : "-"}{Math.abs(variacionTicketPct)}% vs anterior
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin base previa</span>
                    )}
                  </div>
                </Card>
              </button>

              <button type="button" onClick={() => goSection("facturación")} className="text-left">
                <Card className="relative flex h-full min-h-[132px] flex-col justify-between overflow-hidden bg-card p-4 pt-5 transition-colors hover:bg-accent/50">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-500" />
                  <div className="absolute right-4 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <PieChart className="h-[18px] w-[18px]" />
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Tipo facturación</div>
                  <div className="mt-2 text-lg font-extrabold leading-tight">
                    {tipoFactDominante.label} <span className="text-primary">{tipoFactDominante.value}%</span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="flex h-full">
                      <div className="h-full bg-primary" style={{ width: `${tipoFactBreakdown.pctCliente}%` }} />
                      <div className="h-full bg-blue-500" style={{ width: `${tipoFactBreakdown.pctGarantia}%` }} />
                      <div className="h-full bg-amber-500" style={{ width: `${tipoFactBreakdown.pctInterno}%` }} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Cliente {tipoFactBreakdown.pctCliente}%
                    </span>
                    {tipoFactBreakdown.pctGarantia > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Gnt. {tipoFactBreakdown.pctGarantia}%
                      </span>
                    )}
                    {tipoFactBreakdown.pctInterno > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Int. {tipoFactBreakdown.pctInterno}%
                      </span>
                    )}
                  </div>
                  <div className="hidden text-[10px] text-muted-foreground">
                    {[
                      tipoFactBreakdown.pctGarantia > 0 && `Gnt. ${tipoFactBreakdown.pctGarantia}%`,
                      tipoFactBreakdown.pctInterno > 0 && `Int. ${tipoFactBreakdown.pctInterno}%`,
                    ].filter(Boolean).join(" - ") || "Solo cliente"}
                  </div>
                </Card>
              </button>
            </div>
          )}

          {/* FILA 2 - TENDENCIA */}
          <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="flex h-full min-w-0 flex-col p-3">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">Evolucion de facturación</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {format(periodStart, "dd/MM/yy")} - {format(periodEnd, "dd/MM/yy")} - clic en barra para selecciónar
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <FactMetricSwitch value={factMetric} onChange={setFactMetric} />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </div>
              </div>
              <WeeklyBars
                rows={weeklyRows}
                activeKey={selectedWeek?.key}
                metric={factMetric}
                onSelect={(key) => { setSelectedWeekKey(key); goSection("facturación"); }}
              />
              <div className="mt-2 border-t pt-2">
                <MixRubros
                  row={periodRow}
                  rubroFiltro={fRubros.length === 1 ? fRubros[0] : "all"}
                  onSelect={(rubro) => { setFRubros([rubro]); goSection("facturación"); }}
                />
              </div>
            </Card>

            <Card className="flex h-full min-w-0 flex-col p-3">
              <PanelTitle icon={Building2} title="Facturacion por sucursal" subtitle="Acumulado del rango completo." />
              <SucursalBars rows={factBySucursal} totalValue={totalPeriodo} comparisonLabel={periodComparisonLabel} onSelect={(sucursal) => { setFSucursales([sucursal]); goSection("facturación"); }} />
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

          {/* FILA 3 - OPERATIVA */}
          <section className="grid gap-3 md:grid-cols-2">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={BarChart3} title="Estado de trabajos" subtitle={`${format(periodStart, "dd/MM/yy")} - ${format(periodEnd, "dd/MM/yy")} - clic filtra en Trabajos`} />
              <EstadoCompacto
                flujo={flujo}
                onSelect={(estado) => { setFEstadosTrabajo(estado === "all" ? [] : [estado]); goSection("trabajos"); }}
                planificados={trabajosPlanificadosPróximoPeriodo}
                técnicosAsignados={técnicosPróximoPeriodo}
                jornadasPlanificadas={jornadasPlanificacion.length}
                planificacionRango={planificacionRango}
                jornadasPrev={jornadasRealizadasPrev.length}
                horasPrev={horasPrev}
                tecnicosCierreAnterior={tecnicosCierreAnterior}
                cierreAnteriorRango={cierreAnteriorRango}
              />
            </Card>

            <Card className="flex h-full flex-col p-3">
              <div className="mb-3 flex items-start justify-between">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">Carga del equipo</h2>
                  <p className="truncate text-xs text-muted-foreground">Trabajos y participación histórica por periodo</p>
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/10 p-2.5">
                  <div className="flex items-start gap-2">
                    <User className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Activos actuales con carga</div>
                      <div className="mt-0.5 flex items-baseline gap-2">
                        <span className="text-[18px] font-extrabold leading-none tabular-nums">
                          {técnicosConActividadPeriodo.size}<span className="text-sm font-normal text-muted-foreground">/{activeTechnicianIds.size}</span>
                        </span>
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                          {técnicosActivosPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/10 p-2.5">
                  <div className="flex items-start gap-2">
                    <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Trabajos totales</div>
                      <div className="mt-0.5 text-[18px] font-extrabold leading-none tabular-nums">{flujo.total}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/10 p-2.5">
                  <div className="flex items-start gap-2">
                    <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Prom. tec./periodo</div>
                      <div className="mt-0.5 text-[18px] font-extrabold leading-none tabular-nums">{productividadMatriz.equipoPromTécnicos}</div>
                    </div>
                  </div>
                </div>
              </div>
              <CargaEquipoChart data={productividadMatriz} />
            </Card>
          </section>

        </TabsContent>

        <TabsContent value="facturación" className="space-y-3">
          <Card className="flex flex-col p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{T.comparativoFacturacion}</h2>
                <p className="text-xs text-muted-foreground">{T.seleccionaPeriodo}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-muted-foreground">{selectedWeek ? T.periodoSeleccionado : "Rango filtrado"}</div>
                <div className="text-lg font-semibold tabular-nums">{loading ? "..." : money(selectedWeek ? selectedWeek.total : totalPeriodo)}</div>
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
            <FacturacionExplorer
              view={factExplorerView}
              onViewChange={setFactExplorerView}
              selectedFacts={selectedFacts}
              selectedLabel={selectedLabelFacturacion}
              clientRows={topClientes}
              periodRows={weeklyRows}
              selectedPeriodKey={selectedWeek?.key}
              isRangeSelected={!selectedWeek}
              onSelectPeriod={setSelectedWeekKey}
              onSelectFullRange={() => setSelectedWeekKey(null)}
            />
          </Card>
        </TabsContent>

        <TabsContent value="servicios" className="space-y-3">
          <ServiciosDashboard
            data={serviciosDashboardData}
            loading={ordenesLoading}
            selectedTecnicos={fResponsablesOS}
            selectedEstados={fEstadosOS}
            selectedTiposTiempo={fTiposTiempo}
            selectedSucursales={fSucursales}
            onSelectTecnico={(tecnico) =>
              setFResponsablesOS((prev) => (prev.length === 1 && prev[0] === tecnico ? [] : [tecnico]))
            }
            onSelectPeriodo={(periodo) => {
              setDateFrom(periodo.dateFrom);
              setDateTo(periodo.dateTo);
            }}
            onSelectEstado={(estado) =>
              setFEstadosOS((prev) => (prev.length === 1 && prev[0] === estado ? [] : [estado]))
            }
            onSelectTipoTiempo={(tipo) => {
              const canonical = canonicalTipoTiempo(tipo);
              setFTiposTiempo((prev) => (prev.length === 1 && canonicalTipoTiempo(prev[0]) === canonical ? [] : [canonical]));
            }}
            onSelectSucursal={(sucursal) =>
              setFSucursales((prev) => (prev.length === 1 && prev[0] === sucursal ? [] : [sucursal]))
            }
          />
        </TabsContent>

        <TabsContent value="trabajos" className="space-y-3">

          <Card className="flex flex-col p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Resultado de jornadas</h2>
                <p className="text-xs text-muted-foreground">
                  {format(periodStart, "dd/MM/yy")} - {format(periodEnd, "dd/MM/yy")} · cierre operativo del periodo
                </p>
              </div>
              <Badge variant="secondary">{jornadasResultadoResumen.programadas} programadas</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Realizadas</div>
                    <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-emerald-600">{jornadasResultadoResumen.realizadas}</div>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{jornadasResultadoResumen.pctRealizadas}% del total programado</div>
              </div>
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">No realizadas</div>
                    <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums text-amber-600">{jornadasResultadoResumen.noRealizadas}</div>
                  </div>
                  <XCircle className="h-4 w-4 shrink-0 text-amber-600" />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{jornadasResultadoResumen.pctNoRealizadas}% del total programado</div>
              </div>
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pendientes</div>
                    <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums">{jornadasResultadoResumen.pendientes}</div>
                  </div>
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{jornadasResultadoResumen.pctPendientes}% aún sin cierre</div>
              </div>
              <div className="rounded-md border bg-muted/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cerradas</div>
                    <div className="mt-1 text-[22px] font-extrabold leading-none tabular-nums">{jornadasResultadoResumen.cerradas}</div>
                  </div>
                  <Activity className="h-4 w-4 shrink-0 text-primary" />
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">Realizadas + no realizadas · {jornadasResultadoResumen.pctCerradas}% del total</div>
              </div>
            </div>
          </Card>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
            <Card className="flex min-w-0 flex-col p-3">
              <PanelTitle
                icon={BarChart3}
                title="Cumplimiento de agenda"
                subtitle="% de jornadas realizadas sobre el total programado"
              />
              <CumplimientoAgendaChart
                rows={cumplimientoAgenda}
                insights={cumplimientoAgendaInsights}
              />
            </Card>
            <Card className="flex min-w-0 flex-col p-3">
              <PanelTitle
                icon={Users}
                title="No realizadas por técnico"
                subtitle="Top 5 por porcentaje sobre su agenda"
              />
              <TecnicosNoRealizadosRanking
                rows={tecnicosNoRealizados}
                onSelect={(tecnicoId) =>
                  setFTécnicos((prev) => (prev.length === 1 && prev[0] === tecnicoId ? [] : [tecnicoId]))
                }
              />
            </Card>
          </section>



          <Card className="flex flex-col p-3">
            <PanelTitle
              icon={CalendarDays}
              title="Matriz técnicos / periodo"
              subtitle={`${format(periodStart, "dd/MM/yy")} - ${format(periodEnd, "dd/MM/yy")} · actividad por sucursal del técnico`}
            />
            <MatrizTécnicosDías
              data={matrizTécnicosDías}
              currentBucketKey={matrizTécnicosDías.currentBucketKey}
              metric={matrixMetric}
              onMetricChange={setMatrixMetric}
              onSelectTecnico={(tecnicoId) =>
                setFTécnicos((prev) => (prev.length === 1 && prev[0] === tecnicoId ? [] : [tecnicoId]))
              }
              onSelectSucursal={(sucursal) =>
                setFSucursales((prev) => (prev.length === 1 && prev[0] === sucursal ? [] : [sucursal]))
              }
            />
          </Card>

          <section className="grid gap-3 xl:grid-cols-[1fr_1.1fr]">
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={BarChart3} title="Estado de trabajos" subtitle="" />
              <EstadoCompacto
                flujo={flujo}
                onSelect={(estado) => setFEstadosTrabajo([estado])}
                planificados={trabajosPlanificadosPróximoPeriodo}
                técnicosAsignados={técnicosPróximoPeriodo}
                jornadasPlanificadas={jornadasPlanificacion.length}
                planificacionRango={planificacionRango}
                jornadasPrev={jornadasRealizadasPrev.length}
                horasPrev={horasPrev}
                tecnicosCierreAnterior={tecnicosCierreAnterior}
                cierreAnteriorRango={cierreAnteriorRango}
              />
            </Card>
            <Card className="flex h-full flex-col p-3">
              <PanelTitle icon={Building2} title="Carga por sucursal" subtitle="Trabajos por sucursal segmentados por estado" />
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
                  <div className="text-right">Técnicos</div>
                  <div className="text-right">Horas</div>
                  <div className="text-right">Última fecha</div>
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
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Trabajos abiertos sin cierre</h2>
                  <p className="text-xs text-muted-foreground">Ordenados de mayor a menor por días sin cerrar</p>
                </div>
                <Badge variant="secondary">{trabajosAbiertosSinCierre.length} abiertos</Badge>
              </div>
              <TrabajosAbiertosList
                rows={trabajosAbiertosSinCierre}
                onSelect={(row) => navigate(`/trabajos?q=${encodeURIComponent(row.ref)}`)}
              />
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
























