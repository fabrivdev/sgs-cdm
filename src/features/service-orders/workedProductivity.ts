import { parseISO } from "date-fns";
import type { ServicioTecnicoRow, ServiciosDashboardData } from "@/components/dashboard/types";
import { normalizeTechnicianName, matchTechnicianProfile } from "@/lib/technicianMatching";
import { resolveDashboardServiceOrderBranch } from "@/lib/serviceOrderBranch";
import { importedOrderModel } from "./orderMetrics";
import { matchesTechnicianStatus, type TechnicianStatus } from "./productivityStatus";
import { agendaBucketKey, canonicalSituacion, canonicalTipoTiempo, marcaDesdeOS, servicePeriodBuckets, technicianGoalForRange, type OperationsData, type OperationsFilters } from "./useOperationsModel";
import { inspectWorkInterval, workedDays, type OrderWorkLog, type WorkEntry } from "./workLog";
import { productivityPeriod } from "./productivityPeriod";
import { NEW_SYSTEM_START } from "@/lib/imports/cutoff";
import { validOperationsRange } from "./data";

export interface WorkedRecord {
  key: string; os: string; date: string; start: string; end: string; hours: number;
  technician: string; profileId: string | null; activo: boolean; desactivadoEn: string | null;
  type: string; inherited: boolean; state: string; source: WorkEntry;
}
export interface WorkIssue {
  key: string; os: string; technician: string; date: string | null; reason: string;
  dateTo: string | null; state: string;
  sources: { os: string; entry: WorkEntry }[];
}
export type ProductivityTechnicianRow = ServicioTecnicoRow & { incomplete: boolean; issueCount: number };
export type ProductivityPeriodRow = ServiciosDashboardData["evolucion"][number] & { incomplete: boolean };

function issueInPeriod(issue: WorkIssue, from: string, to: string) {
  // An unknown/invalid date cannot safely be assigned to a single period.
  const valid = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  return !valid(issue.date) || !valid(issue.dateTo) || issue.dateTo! < issue.date!
    || (issue.date! <= to && issue.dateTo! >= from);
}

/** Work ledger only. Operational closure cohorts and financial efficiency stay independent. */
export function workedProductivity(logs: OrderWorkLog[], data: OperationsData, filters: OperationsFilters, status: TechnicianStatus = "todos") {
  const period = productivityPeriod(filters.dateFrom, filters.dateTo);
  if (!period.from || !period.to) return {
    period, records: [] as WorkedRecord[], issues: [] as WorkIssue[], tecnicos: [] as ProductivityTechnicianRow[],
    evolucion: [] as ProductivityPeriodRow[], horasPersona: 0, capacidad: { horasDisponibles: 0, porcentaje: 0 },
  };
  // The same explicit era boundary governs work, targets, periods and exports.
  // Do not infer coverage from first/last observed work or from OS lifecycle dates.
  filters = { ...filters, dateFrom: period.from, dateTo: period.to };
  const candidates: WorkedRecord[] = [], issues: WorkIssue[] = [];
  const excluded = new Set<string>();
  const names = new Map<string, Pick<WorkedRecord, "technician" | "profileId" | "activo" | "desactivadoEn">>();
  const active = new Set(data.servicioTecnicos.map(row => row.id));
  const profiles = data.profiles.filter(row => !row.nombre.toLowerCase().includes("pasante"));
  const seen = new Map<string, WorkedRecord>();
  const from = parseISO(filters.dateFrom), to = parseISO(filters.dateTo);
  const periods = servicePeriodBuckets(from, to, filters.periodMode);
  const restricted = Boolean(filters.q.trim() || filters.fMarcas.length || filters.fResponsablesOS.length || filters.fEstadosOS.length || filters.fTiposTiempo.length || filters.fOSRubros.length);
  const query = filters.q.trim().toLowerCase();
  for (const log of logs) {
    const order = log.order_data;
    // Defensive guard for callers with an unbounded snapshot. Migrated OS with
    // actual work remain eligible even if they were opened before July.
    const lifecycleEnd = (order.fecha_cierre_os || order.fecha_abierta_os)?.slice(0, 10);
    if (!log.entries.length && lifecycleEnd && validOperationsRange(lifecycleEnd, lifecycleEnd)
      && lifecycleEnd < NEW_SYSTEM_START) continue;
    const job = data.trabajos.find(row => row.id === order.trabajo_id);
    const client = data.clientes.find(row => row.id === job?.cliente_id)?.nombre ?? order.cliente_nombre ?? "";
    const brand = job?.marca ?? marcaDesdeOS(order.marca);
    const branch = resolveDashboardServiceOrderBranch({ jobBranch: job?.sucursal, rawData: order.raw_data, orderNumber: log.os,
      technicianBranch: log.entries[0]?.sucursal });
    const state = log.missingOrder ? "OS no importada" : canonicalSituacion(order.situacion_os);
    const group = log.missingOrder ? null : state === "Cerrada" ? "cerrada" : ["Cancelada", "Anulada"].includes(state) ? "otra" : "abierta";
    if (filters.fSucursales.length && !filters.fSucursales.includes(branch ?? "")) continue;
    if (filters.fMarcas.length && !filters.fMarcas.includes(brand)) continue;
    if (filters.fEstadosOS.length && (!group || !filters.fEstadosOS.includes(group))) continue;
    if (filters.fOSRubros.length && !filters.fOSRubros.some(rubro => rubro === "Servicio"
      ? Number(order.servicios_cantidad || 0) > 0 || Number(order.servicios_valor || 0) > 0
      : rubro === "Repuestos" ? Number(order.repuesto_valor || 0) > 0 : Number(order.km_cantidad || 0) > 0 || Number(order.kilometro_valor || 0) > 0)) continue;
    if (query && ![log.os, client, order.nro_chasis, brand, importedOrderModel(order.raw_data), order.problema, order.factura,
      ...log.entries.map(row => row.tecnico_nombre)].join(" ").toLowerCase().includes(query)) continue;
    if (!log.entries.length && Number(order.servicios_cantidad || 0) > 0) {
      issues.push({ key: log.os, os: log.os, technician: "", date: null, dateTo: null, state, sources: [], reason: "Sin jornadas importadas" });
    }
    for (const entry of log.entries) {
      const profile = profiles.find(row => row.id === entry.tecnico_profile_id)
        ?? matchTechnicianProfile(entry.tecnico_nombre, profiles);
      const fullProfile = profiles.find(row => row.id === profile?.id);
      const technician = profile?.nombre ?? normalizeTechnicianName(entry.tecnico_nombre);
      const participant = { profileId: profile?.id ?? null, activo: profile ? active.has(profile.id) : false,
        desactivadoEn: fullProfile?.desactivado_en ?? (fullProfile?.activo === false ? fullProfile.actualizado_en : null) ?? null };
      if (!matchesTechnicianStatus(participant, status)) continue;
      if (filters.fResponsablesOS.length && !filters.fResponsablesOS.includes(technician)) continue;
      const type = canonicalTipoTiempo(entry.tipo_tiempo);
      if (filters.fTiposTiempo.length && !filters.fTiposTiempo.map(canonicalTipoTiempo).includes(type)) continue;
      const days = workedDays(entry);
      if (!days || !technician) {
        const issue: WorkIssue = { key: `${log.os}:${entry.id}`, os: log.os, technician, date: entry.fecha_inicio,
          dateTo: entry.fecha_fin, state, sources: [{ os: log.os, entry }],
          reason: [log.missingOrder && "OS no importada", !technician ? "Sin técnico identificado" : inspectWorkInterval(entry).reason]
            .filter(Boolean).join(" · ") };
        if (!issueInPeriod(issue, filters.dateFrom, filters.dateTo)) continue;
        issues.push(issue);
        if (technician) names.set(technician, { technician, ...participant });
        continue;
      }
      if (log.missingOrder && days.some(day => day.date >= filters.dateFrom && day.date <= filters.dateTo)) {
        issues.push({ key: `${log.os}:${entry.id}:missing-order`, os: log.os, technician, date: entry.fecha_inicio,
          dateTo: entry.fecha_fin, state, sources: [{ os: log.os, entry }], reason: "OS no importada" });
      }
      for (const day of days) {
        if (day.date < filters.dateFrom || day.date > filters.dateTo) continue;
        const key = JSON.stringify([log.os, participant.profileId ?? technician, day.date, day.start, day.end]);
        const previous = seen.get(key);
        if (previous) {
          if (previous.type !== type) {
            excluded.add(key);
            issues.push({ key: `${key}:${entry.id}`, os: log.os, technician, date: day.date, dateTo: day.date, state,
              sources: [{ os: log.os, entry: previous.source }, { os: log.os, entry }], reason: "Tipo de tiempo contradictorio" });
          }
          continue;
        }
        const record = { key, os: log.os, ...day, technician, ...participant, type, inherited: entry.heredado, state, source: entry };
        seen.set(key, record); candidates.push(record);
      }
    }
  }
  // Different OS cannot silently double-book one person's same clock time.
  const byTechnicianDay = new Map<string, WorkedRecord[]>();
  for (const row of candidates) {
    const key = `${row.profileId ?? row.technician}:${row.date}`;
    const peers = byTechnicianDay.get(key) ?? [];
    const conflicts = peers.filter(peer => row.start < peer.end && row.end > peer.start);
    if (conflicts.length) {
      for (const block of [...conflicts, row]) excluded.add(block.key);
      issues.push({ key: row.key, os: row.os, technician: row.technician, date: row.date, dateTo: row.date, state: row.state,
        sources: [...conflicts, row].map(block => ({ os: block.os, entry: block.source })), reason: "Horarios superpuestos" });
    }
    peers.push(row); byTechnicianDay.set(key, peers);
  }
  // Retain participants/capacity, but never count an ambiguous block or pick a winner.
  // Exclusions are per worked day, so an unaffected day of an overnight entry survives.
  for (const record of candidates) names.set(record.technician, record);
  const records = candidates.filter(record => !excluded.has(record.key));
  // Keep active technicians with no work in the denominator, just as before.
  if (!restricted) for (const profile of profiles) {
    const participant = { profileId: profile.id, activo: active.has(profile.id), desactivadoEn: profile.desactivado_en };
    if (!participant.activo || !matchesTechnicianStatus(participant, status)) continue;
    if (filters.fSucursales.length && !filters.fSucursales.includes(profile.sucursal)) continue;
    names.set(profile.nombre, { ...participant, technician: profile.nombre });
  }
  const goal = (participant: Pick<WorkedRecord, "profileId" | "activo" | "desactivadoEn">, start = from, end = to) =>
    technicianGoalForRange(start, end, data.metaHorasMensual, participant.profileId, participant.activo, participant.desactivadoEn,
      data.disponibilidades.filter(row => row.tecnico_id === participant.profileId));
  const counts = (rows: { os: string; state: string }[]) => {
    const orders = [...new Map(rows.map(row => [row.os, row.state])).values()];
    return { totalOS: orders.length, cerradas: orders.filter(state => state === "Cerrada").length,
      otras: orders.filter(state => ["Cancelada", "Anulada"].includes(state)).length,
      abiertas: orders.filter(state => !["Cerrada", "Cancelada", "Anulada", "OS no importada"].includes(state)).length };
  };
  const tecnicos: ProductivityTechnicianRow[] = [...names.values()].map(participant => {
    const rows = records.filter(row => row.technician === participant.technician);
    const affected = issues.filter(issue => !issue.technician || issue.technician === participant.technician);
    const horas = rows.reduce((sum, row) => sum + row.hours, 0), horasDisponibles = goal(participant);
    return { ...participant, tecnico: participant.technician, ...counts([...candidates.filter(row => row.technician === participant.technician), ...affected.filter(issue => issue.technician)]), horas, horasDisponibles,
      incomplete: affected.length > 0, issueCount: affected.length,
      horasDesdeDetalle: rows.filter(row => !row.inherited).reduce((sum, row) => sum + row.hours, 0),
      horasDesdeOS: rows.filter(row => row.inherited).reduce((sum, row) => sum + row.hours, 0),
      km: 0, valorOS: 0, productividad: horasDisponibles > 0 ? horas / horasDisponibles * 100 : 0,
      evolucion: periods.map(period => {
        const worked = rows.filter(row => agendaBucketKey(row.date, filters.periodMode) === period.key);
        const hours = worked.reduce((sum, row) => sum + row.hours, 0), target = goal(participant, parseISO(period.dateFrom), parseISO(period.dateTo));
        return { ...period, ...counts(worked), horas: hours, metaHoras: target, productividad: target > 0 ? hours / target * 100 : 0 };
      }) };
  });
  const horasPersona = records.reduce((sum, row) => sum + row.hours, 0);
  const available = tecnicos.reduce((sum, row) => sum + row.horasDisponibles, 0);
  const evolucion: ProductivityPeriodRow[] = periods.map(period => {
    const rows = records.filter(row => agendaBucketKey(row.date, filters.periodMode) === period.key);
    const hours = rows.reduce((sum, row) => sum + row.hours, 0);
    const uniqueBlocks = [...new Map(rows.map(row => [JSON.stringify([row.os, row.date, row.start, row.end]), row.hours])).values()];
    const targets = [...names.values()].filter(participant => !restricted || rows.some(row => row.technician === participant.technician)
      || issues.some(issue => issue.technician === participant.technician && issueInPeriod(issue, period.dateFrom, period.dateTo)))
      .map(participant => goal(participant, parseISO(period.dateFrom), parseISO(period.dateTo)));
    const target = targets.reduce((sum, value) => sum + value, 0);
    return { ...period, ...counts(rows), incomplete: issues.some(issue => issueInPeriod(issue, period.dateFrom, period.dateTo)),
      horasOS: uniqueBlocks.reduce((sum, value) => sum + value, 0), horasPersona: hours,
      tecnicosBase: targets.filter(value => value > 0).length, horasDisponibles: target, utilizacion: target > 0 ? hours / target * 100 : 0 };
  });
  return { period, records: records.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.technician.localeCompare(b.technician)),
    issues, tecnicos, evolucion, horasPersona, capacidad: { horasDisponibles: available, porcentaje: available > 0 ? horasPersona / available * 100 : 0 } };
}
