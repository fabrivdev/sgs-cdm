import type { ManagedVehicle, FuelEntry, Invoice } from "./managementModel";
import { estimatedConsumption, fuelIntervals } from "./managementModel";
import { periodMileage, todayInParaguay } from "./period";
import {
  currentFleetResponsibility,
  type FleetOdometerReading,
  type FleetResponsibilityEvent,
} from "./model";
export const fmt = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-PY", { maximumFractionDigits: 2 });
export interface FleetFilters {
  search: string;
  from: string;
  to: string;
  state: string;
  branch: string;
  department: string;
  brand: string;
  plate: string;
  supplier: string;
  type: string;
  invoiceState: string;
  category?: string;
}
export const initialFilters: FleetFilters = {
  search: "",
  from: "",
  to: "",
  state: "",
  branch: "",
  department: "",
  brand: "",
  plate: "",
  supplier: "",
  type: "",
  invoiceState: "",
  category: "",
};
export type FilterChange = (
  key: keyof FleetFilters | "period" | "reset",
  value: string,
  to?: string,
) => void;
export const options = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v))].sort();
export function rangeError(f: Pick<FleetFilters, "from" | "to">) {
  const valid = (d: string) =>
    !d ||
    (/^\d{4}-\d{2}-\d{2}$/.test(d) &&
      !isNaN(Date.parse(d)) &&
      new Date(d).toISOString().slice(0, 10) === d);
  return !valid(f.from) || !valid(f.to)
    ? "Ingresá fechas válidas"
    : f.from && f.to && f.from > f.to
      ? "La fecha desde no puede ser posterior a hasta"
      : "";
}
export function within(
  date: string | null,
  filters: Pick<FleetFilters, "from" | "to">,
) {
  if (rangeError(filters)) return true;
  return (
    (!filters.from && !filters.to) ||
    (!!date &&
      (!filters.from || date.slice(0, 10) >= filters.from) &&
      (!filters.to || date.slice(0, 10) <= filters.to))
  );
}
export const matches = (search: string, ...values: unknown[]) =>
  !search ||
  values
    .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v ?? "")))
    .join(" ")
    .toLocaleLowerCase()
    .includes(search.toLocaleLowerCase());
export function mileage(
  readings: FleetOdometerReading[],
  id: string,
  f: FleetFilters,
  fuel: FuelEntry[] = [],
) {
  if (rangeError(f)) return null;
  const result = periodMileage(
    readings.filter((r) => r.vehicle_id === id),
    {
      from: f.from || "0001-01-01",
      to: f.to || todayInParaguay(),
      valid: true,
    },
  );
  if (result.coverageFrom) return result.exactKm;
  // Do not add overlapping sources or fabricate dates for initial mileage.
  const imported = fuelIntervals(
    fuel.filter((r) => r.vehicle_id === id),
    false,
    f.from,
    f.to || todayInParaguay(),
  );
  return imported.intervals ? imported.km : null;
}
export function responsible(id: string, events: FleetResponsibilityEvent[]) {
  return (
    currentFleetResponsibility(id, events, todayInParaguay())
      ?.responsible_name_snapshot ?? null
  );
}
export function moneyCell(
  amount: number | null | undefined,
  currency: string | null | undefined,
) {
  if (amount == null) return "—";
  const unit = currency === "PYG" ? "Gs" : currency;
  return unit ? `${unit} ${fmt(amount)}` : fmt(amount);
}
export function money(
  rows: { amount: number | null; currency: string | null }[],
) {
  const known = rows.filter((r) => r.amount != null && r.currency);
  const groups = new Map<string, number>();
  for (const r of known)
    groups.set(r.currency!, (groups.get(r.currency!) ?? 0) + Number(r.amount));
  return groups.size
    ? [...groups].map(([c, n]) => moneyCell(n, c)).join(" · ")
    : "—";
}
export const fuelMoney = (rows: FuelEntry[]) =>
  money(rows.map((r) => ({ amount: r.net_amount, currency: r.currency })));
export const invoiceMoney = (rows: Invoice[]) =>
  money(rows.filter((r) => r.status === "uploaded"));
export function fleetConsumption(
  fuel: FuelEntry[],
  vehicles: ManagedVehicle[],
  filters: Pick<FleetFilters, "from" | "to"> = initialFilters,
) {
  const intervals = vehicles.map((v) =>
    estimatedConsumption(
      fuel.filter((f) => f.vehicle_id === v.id),
      rangeError(filters) ? "" : filters.from,
      rangeError(filters) ? "9999-12-31" : filters.to || "9999-12-31",
    ),
  );
  const km = intervals.reduce((n, r) => n + r.km, 0),
    liters = intervals.reduce((n, r) => n + r.liters, 0);
  return km > 0 ? (liters / km) * 100 : null;
}
