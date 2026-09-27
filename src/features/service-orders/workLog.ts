import { normalizeCommissionTime } from "@/lib/imports/workDuration";
import type { OrdenServicioImportada } from "./useOperationsModel";

export interface WorkEntry {
  id: string;
  fecha_inicio: string | null; hora_inicio: string | null;
  fecha_fin: string | null; hora_fin: string | null;
  tecnico_nombre: string; tecnico_profile_id: string | null;
  sucursal: string | null; tipo_tiempo: string;
  estado_validacion: string; heredado: boolean;
}
export interface OrderWorkLog { os: string; order_data: OrdenServicioImportada; entries: WorkEntry[] }
export interface WorkedDay { date: string; start: string; end: string; hours: number }
const DAY = 86_400_000;
function stamp(date: string | null, time: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const normalized = normalizeCommissionTime(time);
  if (!normalized) return null;
  // Wall-clock math, independent of the browser timezone and DST.
  const value = Date.parse(`${date}T${normalized}Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : null;
}
/** Preserve the source values; validation describes why a clock cannot be counted. */
export function inspectWorkInterval(entry: WorkEntry) {
  const start = stamp(entry.fecha_inicio, entry.hora_inicio);
  let end = stamp(entry.fecha_fin, entry.hora_fin);
  if (start !== null && end !== null && end < start && entry.fecha_inicio === entry.fecha_fin) end += DAY;
  const hours = start !== null && end !== null ? (end - start) / 3_600_000 : null;
  const reason = !entry.fecha_inicio ? "Falta fecha de inicio"
    : !entry.fecha_fin ? "Falta fecha de fin"
    : stamp(entry.fecha_inicio, "00:00") === null ? "Fecha de inicio inválida"
    : stamp(entry.fecha_fin, "00:00") === null ? "Fecha de fin inválida"
    : !entry.hora_inicio ? "Falta hora de inicio"
    : !entry.hora_fin ? "Falta hora de fin"
    : start === null ? "Hora de inicio inválida"
    : end === null ? "Hora de fin inválida"
    : hours === 0 ? "Inicio y fin iguales"
    : hours! < 0 ? "Fin anterior al inicio"
    : hours! > 16 ? "Duración mayor a 16 horas"
    : entry.estado_validacion === "INVALIDA" ? "Registro marcado como inválido en origen"
    : null;
  return { start, end, hours, reason };
}
/** Only recorded clock intervals; never OS dates, invoiced quantity or commission-payment overrides. */
export function workedDays(entry: WorkEntry): WorkedDay[] | null {
  const { start, end, reason } = inspectWorkInterval(entry);
  if (reason || start === null || end === null) return null;
  const result: WorkedDay[] = [];
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, (Math.floor(cursor / DAY) + 1) * DAY);
    result.push({ date: new Date(cursor).toISOString().slice(0, 10),
      start: new Date(cursor).toISOString().slice(11, 19),
      end: next % DAY === 0 ? "24:00:00" : new Date(next).toISOString().slice(11, 19),
      hours: (next - cursor) / 3_600_000 });
    cursor = next;
  }
  return result;
}

// The RPC exposes no payment/validation actions or financial ledger.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadWorkLog(client: any, from: string, to: string, os: string | null, signal?: AbortSignal): Promise<OrderWorkLog[]> {
  if (signal?.aborted) throw signal.reason ?? new Error("Consulta cancelada.");
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new Error("Las jornadas están demorando demasiado.")), 25_000);
  try {
    return await Promise.race([loadPages(client, from, to, os, controller.signal),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }))]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPages(client: any, from: string, to: string, os: string | null, signal: AbortSignal): Promise<OrderWorkLog[]> {
  const result: OrderWorkLog[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    if (signal.aborted) throw signal.reason ?? new Error("Consulta cancelada.");
    const query = client.rpc("service_orders_work_log_v1", { p_desde: from, p_hasta: to, p_os: os }).range(offset, offset + 499);
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => !row?.order_data || row.os !== row.order_data.os_numero || !Array.isArray(row.entries)
      || row.entries.some((entry: WorkEntry) => !entry || typeof entry.id !== "string" || typeof entry.tecnico_nombre !== "string"))) {
      throw new Error("Detalle de trabajo incompleto.");
    }
    for (const row of data) {
      if (seen.has(row.os) || (os !== null && row.os !== os)) throw new Error("Identidad de jornadas inconsistente.");
      seen.add(row.os);
    }
    result.push(...data);
    if (data.length < 500) {
      if (signal.aborted) throw signal.reason ?? new Error("Consulta cancelada.");
      return result;
    }
  }
}
