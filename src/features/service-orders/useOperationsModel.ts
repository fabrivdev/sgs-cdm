import { useCallback, useMemo } from "react";
import { importedOrderModel } from "./orderMetrics";
import { matchesTechnicianStatus, type TechnicianStatus } from "./productivityStatus";
import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, endOfMonth, endOfWeek, endOfYear, format, getDay, getISOWeek, getISOWeekYear, parseISO, startOfMonth, startOfWeek, startOfYear, subYears } from "date-fns";
import { MARCAS, SUCURSALES, type Marca, type Sucursal } from "@/lib/constants";
import { estadoTrabajoDesdeJornadas, estadoTrabajoLabel, type EstadoTrabajo } from "@/lib/trabajos";
import { displayImportedTechnicianName, importedServiceOrderParticipants, matchTechnicianProfile } from "@/lib/technicianMatching";
import { attributeServiceOrderMetrics } from "@/lib/serviceOrderMetrics";
import { resolveDashboardServiceOrderBranch } from "@/lib/serviceOrderBranch";
import { cuadrillaIds, resolverCuadrillaJornada } from "@/lib/jornada-cuadrilla";
import type { PeriodMode, OSRubro, ServiciosDashboardData } from "@/components/dashboard/types";
import type { ServicioTecnico } from "@/hooks/useServicioTecnicos";

export interface Servicio {
  id: string;
  fecha_programada: string;
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
  sucursal: Sucursal;
  marca: Marca;
  cliente_id: string | null;
  trabajo_descripcion: string;
}

export interface Jornada {
  id: string;
  servicio_id: string;
  fecha: string;
  estado: "Pendiente" | "Completado" | "Cancelada";
  horas_trabajadas: number | null;
  tecnico_responsable_id: string | null;
  auxiliares: string[] | null;
}

export interface Trabajo {
  creado_en?: string | null;
  actualizado_en?: string | null;
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

export interface DisponibilidadTecnico {
  id: string;
  tecnico_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  tipo: string | null;
  observacion: string | null;
  bloquea_agenda: boolean | null;
}

export interface OrdenServicioImportada {
  os_numero: string;
  trabajo_id: string | null;
  cliente_nombre: string | null;
  fecha_abierta_os: string | null;
  fecha_cierre_os: string | null;
  fecha_emision_factura: string | null;
  factura: string | null;
  nro_chasis: string | null;
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

export function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function inRange(date: string, start: Date, end: Date) {
  if (!date) return false;
  const key = date.slice(0, 10);
  return key >= dateKey(start) && key <= dateKey(end);
}

export function agendaBucketKey(iso: string, mode: PeriodMode) {
  if (mode === "dia") return iso.slice(0, 10);
  const date = parseISO(iso.slice(0, 10));
  if (mode === "mes") return format(date, "yyyy-MM");
  if (mode === "anio") return format(date, "yyyy");
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

export function agendaBucketLabel(key: string, mode: PeriodMode) {
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

export function agendaBuckets(start: Date, end: Date, mode: PeriodMode) {
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

export function servicePeriodBuckets(start: Date, end: Date, mode: PeriodMode) {
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

export function normalizeOSLookup(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function realChassisOS(row: OrdenServicioImportada) {
  const raw = (row.raw_data ?? {}) as Record<string, unknown>;
  const candidates = [
    raw["Chasis Vehic"],
    raw["CHASIS VEHIC"],
    raw.chasis_vehic,
    raw.chasis_vehiculo,
    row.nro_chasis,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value && value.replace(/[-_.\s]/g, "")) return value;
  }
  return "";
}

export function canonicalTipoTiempo(value: string | null | undefined) {
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

export function tiposTiempoOS(row: OrdenServicioImportada) {
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

export function canonicalSituacion(value: string | null | undefined) {
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

export function marcaDesdeOS(marca: string | null | undefined): Marca {
  const normalized = String(marca ?? "").toUpperCase();
  if (normalized.includes("CLAAS")) return "CLAAS";
  if (normalized.includes("HORSCH")) return "HORSCH";
  return "OTROS";
}

export function normalizeClienteKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\b(?:S A C I|SACI|S A|SA|S R L|SRL|E A S|EAS)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function productivityGoalForRange(start: Date, end: Date, monthlyGoal: number): number {
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

export function technicianGoalForRange(
  start: Date,
  end: Date,
  monthlyGoal: number,
  profileId: string | null,
  active: boolean,
  deactivatedAt: string | null,
  unavailableRanges: DisponibilidadTecnico[],
): number {
  if (!profileId) return 0;
  let effectiveEnd = end;

  if (!active) {
    if (!deactivatedAt) return 0;
    const parsed = parseISO(deactivatedAt.slice(0, 10));
    if (Number.isNaN(parsed.getTime())) return 0;
    effectiveEnd = addDays(parsed, -1) < end ? addDays(parsed, -1) : end;
  }

  if (effectiveEnd < start) return 0;

  const baseGoal = productivityGoalForRange(start, effectiveEnd, monthlyGoal);
  const unavailableDays = new Set<string>();

  for (const range of unavailableRanges) {
    if (range.bloquea_agenda === false) continue;

    const rangeStart = parseISO(range.fecha_inicio.slice(0, 10));
    const rangeEnd = parseISO(range.fecha_fin.slice(0, 10));
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) continue;

    let cursor = rangeStart > start ? rangeStart : start;
    const lastDay = rangeEnd < effectiveEnd ? rangeEnd : effectiveEnd;
    while (cursor <= lastDay) {
      unavailableDays.add(dateKey(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  const unavailableGoal = Array.from(unavailableDays).reduce((sum, key) => {
    const day = parseISO(key);
    const monthStart = startOfMonth(day);
    const monthEnd = endOfMonth(day);
    const monthDays = differenceInCalendarDays(monthEnd, monthStart) + 1;
    return sum + (monthDays > 0 ? monthlyGoal / monthDays : 0);
  }, 0);

  return Math.max(baseGoal - unavailableGoal, 0);
}

export interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
export interface Profile { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean | null; actualizado_en: string | null; desactivado_en: string | null }
export interface OperationsData {
  servicios: Servicio[]; jornadas: Jornada[]; trabajos: Trabajo[]; clientes: Cliente[];
  profiles: Profile[]; servicioTecnicos: ServicioTecnico[]; ordenesServicio: OrdenServicioImportada[];
  disponibilidades: DisponibilidadTecnico[]; metaHorasMensual: number;
}
export interface OperationsFilters {
  dateFrom: string; dateTo: string; periodMode: PeriodMode; q: string;
  fSucursales: string[]; fMarcas: string[]; fTiposTiempo: string[];
  fEstadosTrabajo: string[]; fTécnicos: string[]; fResponsablesOS: string[];
  fEstadosOS: Array<"cerrada" | "abierta" | "otra">; fOSRubros: OSRubro[];
}
export const emptyOperationsData: OperationsData = {
  servicios: [], jornadas: [], trabajos: [], clientes: [], profiles: [], servicioTecnicos: [],
  ordenesServicio: [], disponibilidades: [], metaHorasMensual: 0,
};
/** Operational selectors extracted from Dashboard 7a377f9. No financial queries or writes.
 * Closed OS use closure date; open OS use opening date. This is not a worked-hours ledger.
 */
export function useOperationsModel(data: OperationsData, filters: OperationsFilters, matrixMetric: "trabajos" | "horas" = "trabajos", today = new Date(), technicianStatus: TechnicianStatus = "todos") {
  const { servicios, jornadas, trabajos, clientes, profiles, servicioTecnicos, ordenesServicio, disponibilidades, metaHorasMensual } = data;
  const { dateFrom, dateTo, periodMode, q, fSucursales, fMarcas, fTiposTiempo, fEstadosTrabajo, fTécnicos, fResponsablesOS, fEstadosOS, fOSRubros } = filters;
  const todayStr = format(today, "yyyy-MM-dd");

const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);

const weekEnd = useMemo(() => endOfWeek(today, { weekStartsOn: 1 }), [today]);

const periodStart = useMemo(() => parseISO(dateFrom), [dateFrom]);

const periodEnd = useMemo(() => parseISO(dateTo), [dateTo]);

const previousPeriodStart = useMemo(() => subYears(periodStart, 1), [periodStart]);

const previousPeriodEnd = useMemo(() => subYears(periodEnd, 1), [periodEnd]);

const nextPeriodStart = useMemo(() => addDays(periodEnd, 1), [periodEnd]);

const nextPeriodEnd = useMemo(
    () => addDays(periodEnd, Math.max(differenceInCalendarDays(periodEnd, periodStart), 0)),
    [periodEnd, periodStart],
  );

const servicioById = useMemo(() => new Map(servicios.map((item) => [item.id, item])), [servicios]);

const clienteById = useMemo(() => new Map(clientes.map((item) => [item.id, item])), [clientes]);

const clienteByName = useMemo(() => new Map(clientes.map((item) => [normalizeClienteKey(item.nombre), item])), [clientes]);

const profileById = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);

const trabajoById = useMemo(() => new Map(trabajos.map((item) => [item.id, item])), [trabajos]);

const jornadaCrewIds = useCallback((jornada: Jornada): string[] =>
    cuadrillaIds(resolverCuadrillaJornada(jornada, servicioById.get(jornada.servicio_id))), [servicioById]);

const activeTechnicianIds = useMemo(() => {
    return new Set(servicioTecnicos.map((profile) => profile.id));
  }, [servicioTecnicos]);

const technicianOptions = useMemo(
    () =>
      Array.from(activeTechnicianIds)
        .map((id) => ({ id, nombre: servicioTecnicos.find((profile) => profile.id === id)?.nombre ?? profileById.get(id)?.nombre ?? "Sin técnico" }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [activeTechnicianIds, profileById, servicioTecnicos],
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

const historicalJornadaCrew = useCallback((jornada: Jornada) =>
    Array.from(new Set(jornadaCrewIds(jornada).filter((id) => {
      const profile = profileById.get(id);
      return Boolean(profile && !profile.nombre.toLowerCase().includes("pasante"));
    }))), [jornadaCrewIds, profileById]);

const query = q.trim().toLowerCase();

const scopedServicio = useCallback((servicio: Servicio | undefined | null) => {
    if (!servicio) return false;
    if (fSucursales.length > 0 && !fSucursales.includes(servicio.sucursal)) return false;
    if (!query) return true;
    const cliente = servicio.cliente_id ? clienteById.get(servicio.cliente_id)?.nombre ?? "" : "";
    return cliente.toLowerCase().includes(query) || servicio.trabajo_descripcion.toLowerCase().includes(query);
  }, [fSucursales, query, clienteById]);

const scopedTrabajo = useCallback((trabajo: Trabajo) => {
    if (fSucursales.length > 0 && !fSucursales.includes(trabajo.sucursal)) return false;
    if (!query) return true;
    const cliente = trabajo.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre ?? "" : "";
    return (
      cliente.toLowerCase().includes(query) ||
      trabajo.descripcion_problema.toLowerCase().includes(query) ||
      (trabajo.codigo ?? "").toLowerCase().includes(query)
    );
  }, [fSucursales, query, clienteById]);

const responsablesOSOptions = useMemo(
    () => Array.from(new Set([
      ...technicianOptions.map((profile) => profile.nombre),
      ...ordenesServicio.flatMap((row) => {
        const rawData = row.raw_data ?? {};
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
    const responsablesSeleccionados = new Set(fResponsablesOS);
    const tecnicoMap = new Map<string, {
      profileId: string | null;
      tecnico: string;
      activo: boolean;
      desactivadoEn: string | null;
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
      if (!matchesTechnicianStatus({ profileId: profile.id, activo: true }, technicianStatus)) continue;
      const profileSucursal = profileById.get(profile.id)?.sucursal ?? null;
      if (fSucursales.length > 0 && (!profileSucursal || !fSucursales.includes(profileSucursal))) continue;
      if (responsablesSeleccionados.size > 0 && !responsablesSeleccionados.has(profile.nombre)) continue;
      tecnicoMap.set(profile.nombre, {
        profileId: profile.id,
        tecnico: profile.nombre,
        activo: true,
        desactivadoEn: null,
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
      const trabajo = row.trabajo_id ? trabajoById.get(row.trabajo_id) : null;
      const clienteTrabajo = trabajo?.cliente_id ? clienteById.get(trabajo.cliente_id)?.nombre : null;
      const cliente = String(clienteTrabajo ?? row.cliente_nombre ?? "Sin cliente").trim() || "Sin cliente";
      const clienteMatched = clienteByName.get(normalizeClienteKey(cliente));
      const rawData = row.raw_data ?? {};
      const modelo = importedOrderModel(rawData);
      const marca = (trabajo?.marca ?? marcaDesdeOS(row.marca)) as Marca;
      const origen = String(
        rawData.canonical_origin ?? rawData.ORIGEN ?? rawData.Origen ?? "",
      ).trim();
      const participantSources = importedServiceOrderParticipants(rawData, row.responsable);
      const participantMap = new Map<string, {
        tecnico: string;
        profileId: string | null;
        activo: boolean;
        desactivadoEn: string | null;
        sources: string[];
      }>();
      for (const sourceName of participantSources) {
        const matched = matchTechnicianProfile(sourceName, allTechnicianProfiles);
        const matchedProfile = matched ? profileById.get(matched.id) : undefined;
        const tecnicoName = matched?.nombre ?? displayImportedTechnicianName(sourceName);
        const currentParticipant = participantMap.get(tecnicoName) ?? {
          tecnico: tecnicoName,
          profileId: matched?.id ?? null,
          activo: matched ? activeTechnicianIds.has(matched.id) : false,
          desactivadoEn: matchedProfile?.desactivado_en ??
            (matchedProfile?.activo === false ? matchedProfile.actualizado_en : null),
          sources: [],
        };
        currentParticipant.sources.push(sourceName);
        participantMap.set(tecnicoName, currentParticipant);
      }
      const participants = Array.from(participantMap.values());
      const participantNames = participants.map((participant) => participant.tecnico);
      const participantBranches = Array.from(new Set(
        participants
          .map((participant) => participant.profileId ? profileById.get(participant.profileId)?.sucursal : null)
          .filter((branch): branch is Sucursal => !!branch),
      ));
      const technicianBranch = participantBranches.length === 1 ? participantBranches[0] : null;
      const sucursal = resolveDashboardServiceOrderBranch({
        jobBranch: trabajo?.sucursal,
        rawData,
        orderNumber: row.os_numero,
        clientBranch: clienteMatched?.sucursal,
        clientName: cliente,
        technicianBranch,
      });
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

      // Una OS cerrada pertenece operativamente al periodo en que se cerro.
      // Las abiertas siguen siendo una fotografia por fecha de apertura. Este
      // mismo criterio permite reconciliar las horas cerradas con Comisiones,
      // que por definicion liquida usando fecha_cierre.
      const fechaAnalisis = String(
        estadoGrupo === "cerrada"
          ? row.fecha_cierre_os ?? row.fecha_abierta_os ?? ""
          : row.fecha_abierta_os ?? row.fecha_cierre_os ?? "",
      ).slice(0, 10);
      if (!fechaAnalisis || !inRange(fechaAnalisis, periodStart, periodEnd)) return [];

      const bucketDate = parseISO(fechaAnalisis);
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
          ? fechaAnalisis
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
      if (responsablesSeleccionados.size > 0 && !participantNames.some((name) => responsablesSeleccionados.has(name))) return [];
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
        const searchable = [row.os_numero, row.factura, realChassisOS(row), marca, modelo, ...participantNames, cliente, row.problema, estadoOS, tipoTiempo, origen]
          .map((value) => String(value ?? ""))
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(query)) return [];
      }

      const horas = Number(row.servicios_cantidad || 0);
      const km = Number(row.km_cantidad || 0);
      const serviciosValor = Number(row.servicios_valor || 0);
      const repuestosValor = Number(row.repuesto_valor || 0);
      const kilometrajeValor = Number(row.kilometro_valor || 0);
      const tercerosValor = Number(row.terceros_valor || 0);
      const valorOS = serviciosValor + repuestosValor + kilometrajeValor + tercerosValor;
      const totalsByTechnician = (rawData.totales_por_tecnico ?? {}) as Record<string, Record<string, unknown>>;
      const participantsForMetrics = (responsablesSeleccionados.size > 0
        ? participants.filter((participant) => responsablesSeleccionados.has(participant.tecnico))
        : participants).filter(participant => matchesTechnicianStatus(participant, technicianStatus));
      if (technicianStatus !== "todos" && !participantsForMetrics.length) return [];
      const participantMetrics = attributeServiceOrderMetrics(
        participantsForMetrics.map((participant) => ({
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

      participantsForMetrics.forEach((participant) => {
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
          desactivadoEn: participant.desactivadoEn,
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
        key: row.os_numero,
        os: row.os_numero,
        tecnico,
        tecnicoProfileId: responsibleMatch?.id ?? null,
        tecnicos: participantNames,
        cliente,
        chasis: realChassisOS(row),
        modelo,
        sucursal,
        marca,
        tipoTiempo,
        fechaApertura: row.fecha_abierta_os ? String(row.fecha_abierta_os).slice(0, 10) : null,
        fechaCierre: row.fecha_cierre_os ? String(row.fecha_cierre_os).slice(0, 10) : null,
        fechaFacturacion: row.fecha_emision_factura ? String(row.fecha_emision_factura).slice(0, 10) : null,
        fechaOperacion: fechaAnalisis,
        estadoOS,
        estadoFacturacion: canonicalSituacion(row.situacion_facturacion),
        origen,
        factura: String(row.factura ?? "").trim(),
        problema: String(row.problema ?? "").trim(),
        horas,
        horasPersona: horasPersonaOS,
        km,
        servicios: serviciosValor,
        repuestos: repuestosValor,
        kilometraje: kilometrajeValor,
        terceros: tercerosValor,
        valorOS,
      }];
    }).sort((a, b) => b.fechaOperacion.localeCompare(a.fechaOperacion) || a.os.localeCompare(b.os));

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
    const disponibilidadesPorTecnico = new Map<string, DisponibilidadTecnico[]>();
    for (const disponibilidad of disponibilidades) {
      const rows = disponibilidadesPorTecnico.get(disponibilidad.tecnico_id) ?? [];
      rows.push(disponibilidad);
      disponibilidadesPorTecnico.set(disponibilidad.tecnico_id, rows);
    }
    const targetForTechnician = (
      row: Pick<(typeof tecnicosBase)[number], "profileId" | "activo" | "desactivadoEn">,
      start: Date,
      end: Date,
    ) => technicianGoalForRange(
      start,
      end,
      metaHorasMensual,
      row.profileId,
      row.activo,
      row.desactivadoEn,
      row.profileId ? (disponibilidadesPorTecnico.get(row.profileId) ?? []) : [],
    );
    const tecnicosCapacidad = tecnicosBase.filter((row) => {
      const available = targetForTechnician(row, periodStart, periodEnd);
      return capacidadRestringidaAParticipantes
        ? row.totalOS > 0 && available > 0
        : available > 0;
    });
    const horasUtilizadas = tecnicosBase.reduce((sum, row) => sum + row.horas, 0);
    const horasDisponibles = tecnicosCapacidad.reduce(
      (sum, row) => sum + targetForTechnician(row, periodStart, periodEnd),
      0,
    );
    const capacidad = {
      technicians: tecnicosCapacidad.length,
      hoursAvailable: horasDisponibles,
      hoursUsed: horasUtilizadas,
      percentage: horasDisponibles > 0 ? (horasUtilizadas / horasDisponibles) * 100 : 0,
      base: capacidadRestringidaAParticipantes
        ? ("participantes_filtrados" as const)
        : ("equipo_activo" as const),
    };
    const evolucion = evolucionBase.map((row) => {
      const start = parseISO(row.dateFrom);
      const end = parseISO(row.dateTo);
      const tecnicosPeriodo = tecnicosBase.filter((tecnicoRow) => {
        const available = targetForTechnician(tecnicoRow, start, end);
        return capacidadRestringidaAParticipantes
          ? (tecnicoRow.periodos.get(row.key)?.totalOS ?? 0) > 0 && available > 0
          : available > 0;
      });
      const horasDisponiblesPeriodo = tecnicosPeriodo.reduce(
        (sum, tecnicoRow) => sum + targetForTechnician(tecnicoRow, start, end),
        0,
      );
      return {
        ...row,
        tecnicosBase: tecnicosPeriodo.length,
        horasDisponibles: horasDisponiblesPeriodo,
        utilizacion: horasDisponiblesPeriodo > 0
          ? (row.horasPersona / horasDisponiblesPeriodo) * 100
          : 0,
      };
    });
    const tecnicos = tecnicosBase.map(({ periodos, ...row }) => {
      const horasDisponiblesTecnico = targetForTechnician(row, periodStart, periodEnd);
      return {
        ...row,
        horasDisponibles: horasDisponiblesTecnico,
        productividad: horasDisponiblesTecnico > 0
          ? (row.horas / horasDisponiblesTecnico) * 100
          : 0,
        evolucion: evolucionBase.map((periodo) => {
        const tecnicoPeriodo = periodos.get(periodo.key);
        const metaHoras = targetForTechnician(
          row,
          parseISO(periodo.dateFrom),
          parseISO(periodo.dateTo),
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
      };
    }).sort(
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
  }, [activeTechnicianIds, allTechnicianProfiles, clienteById, clienteByName, disponibilidades, fEstadosOS, fMarcas, fOSRubros, fResponsablesOS, fSucursales, fTiposTiempo, metaHorasMensual, ordenesServicio, periodEnd, periodMode, periodStart, profileById, query, technicianOptions, technicianStatus, trabajoById]);

const jornadasRealizadasPrev = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Completado" && inRange(jornada.fecha, previousPeriodStart, previousPeriodEnd) && scopedServicio(servicio);
      }),
    [jornadas, previousPeriodEnd, previousPeriodStart, servicioById, scopedServicio],
  );

const jornadasProgramadas = useMemo(
    () =>
      jornadas.filter((jornada) => {
        const servicio = servicioById.get(jornada.servicio_id);
        return jornada.estado === "Pendiente" && inRange(jornada.fecha, periodStart, periodEnd) && scopedServicio(servicio);
      }),
    [jornadas, servicioById, periodEnd, periodStart, scopedServicio],
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
    [jornadas, nextPeriodEnd, nextPeriodStart, periodEnd, periodStart, servicioById, scopedServicio, todayStr],
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

const trabajosScope = useMemo(() => trabajos.filter(scopedTrabajo), [trabajos, scopedTrabajo]);

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

const horasPrev = jornadasRealizadasPrev.reduce((acc, row) => acc + Number(row.horas_trabajadas || 0), 0);

const técnicosPróximoPeriodo = new Set(jornadasPlanificacion.flatMap((j) => validJornadaCrew(j))).size;

const tecnicosCierreAnterior = new Set(jornadasRealizadasPrev.flatMap((j) => validJornadaCrew(j))).size;

const cierreAnteriorRango = `${format(previousPeriodStart, "dd/MM")} - ${format(previousPeriodEnd, "dd/MM")}`;

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
        for (const id of historicalJornadaCrew(jornada)) {
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
        creadoEn: trabajo.creado_en ?? null,
        actualizadoEn: trabajo.actualizado_en ?? null,
        jornadaFechas: trabajoJornadas.map((j) => j.fecha).filter(Boolean) as string[],
      };
    });
  }, [clienteById, jornadasByTrabajo, periodEnd, periodStart, servicioById, trabajosScope, weekEnd, weekStart, historicalJornadaCrew, todayStr]);

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

    for (const tecnicoId of activeTechnicianIds) {
      if (fTécnicos.length && !fTécnicos.includes(tecnicoId)) continue;
      if (fSucursales.length && !fSucursales.includes(profileById.get(tecnicoId)?.sucursal ?? "")) continue;
      ensureTecnicoRow(tecnicoId);
    }

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

      for (const tecnicoId of historicalJornadaCrew(jornada)) {
        if (fTécnicos.length && !fTécnicos.includes(tecnicoId)) continue;
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
      if (fTécnicos.length && !fTécnicos.includes(disp.tecnico_id)) continue;
      if (fSucursales.length && !fSucursales.includes(profileById.get(disp.tecnico_id)?.sucursal ?? "")) continue;
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
  }, [activeTechnicianIds, clienteById, disponibilidades, fTécnicos, fSucursales, jornadas, matrixMetric, periodEnd, periodMode, periodStart, profileById, servicioById, todayStr, trabajos, trabajosResumen, historicalJornadaCrew]);

const trabajosActivos = trabajosResumen.filter((row) => row.estado !== "completado");

const trabajosAbiertosSinCierre = useMemo(() => {
    return trabajosActivos
      .map((row) => ({
        id: row.id,
        ref: row.ref,
        cliente: row.cliente,
        sucursal: row.sucursal,
        estado: estadoTrabajoLabel(row.estado as EstadoTrabajo),
        ultimaFechaISO: row.ultimaFechaPeriodo || row.ultimaFecha || null,
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
  }, [trabajosActivos, today, todayStr]);

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
  }, [fTécnicos, jornadasByTrabajo, periodEnd, periodStart, trabajosResumen, jornadaCrewIds]);

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
  }, [jornadasResultadoPeriodo, periodEnd, periodMode, periodStart, todayStr]);

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
  }, [fTécnicos, jornadasResultadoPeriodo, profileById, historicalJornadaCrew]);

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
return { serviciosDashboardData, responsablesOSOptions, technicianOptions, cumplimientoAgenda, cumplimientoAgendaInsights, tecnicosNoRealizados, jornadasResultadoResumen, matrizTécnicosDías, trabajosResumen, trabajosAbiertosSinCierre, flujo, cargaSucursal, cargaMarca, jornadasPlanificacion, planificacionRango, trabajosPlanificadosPróximoPeriodo, técnicosPróximoPeriodo, jornadasRealizadasPrev, horasPrev, tecnicosCierreAnterior, cierreAnteriorRango };
}

export type OperationsModel = ReturnType<typeof useOperationsModel>;
