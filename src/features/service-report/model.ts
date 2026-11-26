import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { canonicalClientName } from "@/lib/clientIdentity";
import { NEW_SYSTEM_START } from "@/lib/imports/cutoff";
import { normalizeTechnicianName } from "@/lib/technicianMatching";
import { canonicalSituacion, canonicalTipoTiempo } from "@/features/service-orders/useOperationsModel";
import type { IndicadorTipo } from "@/components/ventas/useServiciosIndicadores";

export const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const TIME_TYPES = ["Cliente", "Garantia", "Interno", "Agrega al costo", "Sin tipo"] as const;
export type TimeType = typeof TIME_TYPES[number];
export const TIME_LABELS: Record<TimeType, string> = { Cliente: "Cliente", Garantia: "Garantía", Interno: "Interno", "Agrega al costo": "Agrega al costo", "Sin tipo": "Sin clasificar" };

const columns = "os_numero,fecha_abierta_os,situacion_os,nro_chasis,cliente_nombre,responsable,tipo_tiempo,servicios_cantidad,servicios_valor,kilometro_valor,raw_data";
export type ReportOrder = Pick<Tables<"ordenes_servicio_importadas">,
  "os_numero" | "fecha_abierta_os" | "situacion_os" | "nro_chasis" | "cliente_nombre" | "responsable" |
  "tipo_tiempo" | "servicios_cantidad" | "servicios_valor" | "kilometro_valor" | "raw_data">;
type BillingMonth = { periodo: string; mo: number; km: number };
export type ReportBilling = { months: BillingMonth[]; byType: Record<number, IndicadorTipo[]> };
export type ReportWindow = { from: string; to: string };
export const MIN_YEAR = 2025;

export function yearWindow(year: number, month = 12): ReportWindow {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: String(year) + "-01-01", to: [year, String(month).padStart(2, "0"), lastDay].join("-") };
}

export async function loadReportOrders(from: string, to: string, signal: AbortSignal) {
  const orders: ReportOrder[] = [];
  const size = 1000;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await supabase.from("ordenes_servicio_importadas")
      .select(columns).ilike("situacion_os", "%cerrad%")
      .gte("fecha_abierta_os", from).lt("fecha_abierta_os", nextDay(to))
      .order("os_numero").range(offset, offset + size - 1).abortSignal(signal);
    if (error) throw error;
    orders.push(...data);
    if (data.length < size) return orders;
  }
}

function nextDay(iso: string) {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function loadReportBilling(year: number, month: number, signal: AbortSignal): Promise<ReportBilling> {
  const { to } = yearWindow(year, month);
  const monthly = supabase.rpc("ventas_servicios_panorama_v2", {
    p_desde: yearWindow(year - 3).from, p_hasta: to, p_agrupacion: "mes",
  }).abortSignal(signal);
  const types = [year - 1, year].map(async target => {
    const { from, to: end } = yearWindow(target, month);
    if (end < NEW_SYSTEM_START) return [target, []] as const;
    const { data, error } = await supabase.rpc("ventas_servicios_indicadores_v1", {
      p_desde: from > NEW_SYSTEM_START ? from : NEW_SYSTEM_START, p_hasta: end,
    }).abortSignal(signal);
    if (error) throw error;
    const payload = data as { por_tipo?: IndicadorTipo[] } | null;
    if (!Array.isArray(payload?.por_tipo)) throw new Error("Desglose de facturación incompleto.");
    return [target, payload.por_tipo] as const;
  });
  const [result, byType] = await Promise.all([monthly, Promise.all(types)]);
  if (result.error) throw result.error;
  const payload = result.data as { periodos?: BillingMonth[] } | null;
  if (!Array.isArray(payload?.periodos)) throw new Error("Serie de facturación incompleta.");
  return { months: payload.periodos, byType: Object.fromEntries(byType) };
}

const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const typeTotals = () => Object.fromEntries(TIME_TYPES.map(type => [type, 0])) as Record<TimeType, number>;
const normal = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function timeType(value: string | null): TimeType {
  const candidate = canonicalTipoTiempo(value);
  return TIME_TYPES.find(type => type === candidate) ?? "Sin tipo";
}

function customerName(order: ReportOrder) {
  const raw = record(order.raw_data);
  const name = canonicalClientName(text(raw.Nombre) || (raw.CLIFAC == null ? order.cliente_nombre : null));
  return normal(name).replace(/[^A-Z0-9]+/g, " ").trim().replace(/ (SOCIEDAD ANONIMA|S A|SA|S R L|SRL|E A S|EAS)$/, "");
}

function customerKey(name: string) {
  return /^(CAMPOS DEL MANANA|CDM|SIN CLIENTE|CLIENTE GENERICO|VARIOS)$/.test(name) ? "" : name;
}

function serial(value: string | null) {
  const key = normal(value ?? "").replace(/[^A-Z0-9]/g, "");
  return key.length >= 5 && (key.match(/\d/g)?.length ?? 0) >= 3 && !/^(0+|1+|9+|12345(?:67890?)?)$/.test(key) ? key : "";
}

function buckets(order: ReportOrder, legacy: boolean, owner: string) {
  const raw = record(order.raw_data);
  const byType = Object.entries(record(raw.totales_por_tipo));
  if (byType.length) return byType.map(([type, totals]) => ({
    type: timeType(type), hours: amount(record(totals).horas),
    value: amount(record(totals).valor_servicio) + amount(record(totals).valor_kilometraje),
  }));
  // In Dolphin only, use the entity on the closed OS when the source type was empty.
  const type = legacy && !text(order.tipo_tiempo) && owner
    ? owner === "CAMPOS DEL MANANA" ? "Interno" : customerKey(owner) ? "Cliente" : "Sin tipo"
    : timeType(order.tipo_tiempo);
  return [{ type, hours: amount(order.servicios_cantidad), value: amount(order.servicios_valor) + amount(order.kilometro_valor) }];
}

export function summarizeReport(orders: ReportOrder[], billing: ReportBilling | undefined, year: number, lastMonth: number) {
  const monthlySales = new Map(billing?.months.map(row => [row.periodo.slice(0, 7), amount(row.mo) + amount(row.km)]));
  const closed = orders.filter(order => canonicalSituacion(order.situacion_os) === "Cerrada" && order.fecha_abierta_os)
    .map(order => {
      const day = order.fecha_abierta_os!.slice(0, 10);
      const owner = customerName(order);
      return { order, day, customer: customerKey(owner), machine: serial(order.nro_chasis), items: buckets(order, day < NEW_SYSTEM_START, owner) };
    }).sort((a, b) => a.day.localeCompare(b.day));
  const periods = [year - 1, year].map(target => {
    const prefix = String(target) + "-";
    const all = closed.filter(row => row.day.startsWith(prefix));
    const previousCustomers = new Set(closed.filter(row => row.day.startsWith(String(target - 1) + "-")).map(row => row.customer).filter(Boolean));
    const machines = new Set<string>();
    const customers = new Set<string>();
    const technicians = new Set<string>();
    const hours = typeTotals();
    const billedType = typeTotals();
    let internal = 0, warranty = 0;
    const monthly = MONTHS.slice(0, lastMonth).map((name, index) => {
      const key = prefix + String(index + 1).padStart(2, "0");
      let intern = 0, newCustomers = 0;
      const split = typeTotals();
      for (const row of all.filter(item => item.day.startsWith(key))) {
        if (row.machine) machines.add(row.machine);
        if (row.customer) {
          if (!customers.has(row.customer) && previousCustomers.size && !previousCustomers.has(row.customer)) newCustomers++;
          customers.add(row.customer);
        }
        const technician = normalizeTechnicianName(row.order.responsable);
        if (technician && row.items.some(item => item.hours > 0)) technicians.add(technician);
        for (const item of row.items) {
          split[item.type] += item.hours;
          hours[item.type] += item.hours;
          if (row.day >= NEW_SYSTEM_START) continue;
          if (item.type === "Interno") intern += item.value;
          if (item.type === "Garantia") warranty += item.value;
        }
      }
      internal += intern;
      const invoiced = monthlySales.get(key) ?? 0;
      if (key < NEW_SYSTEM_START.slice(0, 7)) billedType.Cliente += invoiced;
      return { name, invoiced, internal: intern, hours: split, machines: machines.size, customers: customers.size, newCustomers };
    });
    const invoiced = sum(monthly.map(row => row.invoiced));
    for (const item of billing?.byType[target] ?? []) billedType[timeType(item.tipo_tiempo)] += amount(item.mo) + amount(item.km);
    // Reconcile the type breakdown to the signed monthly sales source.
    billedType["Sin tipo"] += Number((invoiced - sum(Object.values(billedType))).toFixed(2));
    return { year: target, monthly, invoiced, internal, warranty, total: invoiced + internal, billedType, hours,
      totalHours: sum(Object.values(hours)), machines: machines.size, customers: customers.size,
      newCustomers: previousCustomers.size ? sum(monthly.map(row => row.newCustomers)) : null,
      technicians: technicians.size, hasOrders: all.some(row => row.day <= yearWindow(target, lastMonth).to) };
  });
  const current = periods[1];
  const previous = periods[0];
  const history = Array.from({ length: 4 }, (_, index) => year - 3 + index).flatMap(target => {
    const rows = billing?.months.filter(row => row.periodo.startsWith(String(target) + "-") && Number(row.periodo.slice(5, 7)) <= lastMonth) ?? [];
    if (!rows.length) return [];
    return [{ name: String(target), invoiced: sum(rows.map(row => amount(row.mo) + amount(row.km))),
      internal: periods.find(period => period.year === target)?.internal ?? 0 }];
  });
  return { current, previous, history };
}
