import type { FleetVehicle } from "./model";
export const maintenanceCategories = [
  "Filtros",
  "Aceites y fluidos",
  "Correas",
  "Cubiertas",
  "Batería",
  "Otros trabajos y repuestos",
] as const;
export const operationalStates = [
  "Operativa",
  "En taller",
  "Inoperativa",
  "Sin informar",
] as const;
export const lifecycleStates = ["Activa", "Vendida", "Baja"] as const;
export interface ManagedVehicle extends FleetVehicle {
  chassis: string | null;
  department: string | null;
  branch: string | null;
  operational_status: string;
  lifecycle_status: string;
  color: string | null;
  vehicle_type: string | null;
  fuel_provider: string | null;
  notes: string | null;
  source_data?: { raw_data?: Record<string, unknown> } | null;
}
export interface WorkItem {
  work: string;
  value: unknown;
  comment: string | null;
  cell?: string;
}
export interface MaintenanceEntry {
  id: string;
  vehicle_id: string | null;
  plate: string;
  occurred_on: string | null;
  odometer_km: number | null;
  supplier: string | null;
  invoice_number: string | null;
  works: WorkItem[];
  source_key: string;
  raw_data: Record<string, unknown>;
}
export interface Invoice {
  id: string;
  vehicle_id: string | null;
  plate: string;
  supplier: string;
  supplier_tax_id?: string | null;
  invoice_number: string;
  invoice_date: string;
  categories: string[];
  description: string;
  amount: number | null;
  currency: string | null;
  storage_path: string;
  filename: string;
  status: "pending" | "uploaded" | "void";
  version?: number;
  performed_on?: string | null;
  odometer_km?: number | null;
}
export interface FuelEntry {
  id: string;
  vehicle_id: string | null;
  plate: string;
  occurred_at: string;
  liters: number;
  net_amount: number;
  currency: string | null;
  odometer_km: number | null;
  previous_odometer_km: number | null;
  previous_liters: number | null;
  product: string;
  station: string;
  source_key: string;
  raw_data: Record<string, unknown>;
}
export function canManageFleet(
  roles: readonly string[],
  sectionAccess: boolean,
) {
  return (
    sectionAccess &&
    roles.some((role) => ["jefatura", "admin", "superadmin"].includes(role))
  );
}
export function canSubmitInvoice(
  roles: readonly string[],
  sectionAccess: boolean,
) {
  return (
    sectionAccess &&
    (roles.includes("operativo") || canManageFleet(roles, sectionAccess))
  );
}
export function invoiceValidation(
  input: {
    plate: string;
    supplier: string;
    invoice_number: string;
    invoice_date: string;
    categories: string[];
    description: string;
  },
  file?: File | null,
) {
  if (!/^[A-Z0-9 -]{3,20}$/i.test(input.plate.trim()))
    return "Ingresá una chapa válida.";
  if (
    !input.supplier.trim() ||
    !input.invoice_number.trim() ||
    !input.description.trim()
  )
    return "Completá proveedor, número y descripción.";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.invoice_date) ||
    Number.isNaN(Date.parse(input.invoice_date)) ||
    new Date(input.invoice_date).toISOString().slice(0, 10) !==
      input.invoice_date
  )
    return "Ingresá una fecha válida.";
  if (
    !input.categories.length ||
    input.categories.some(
      (c) =>
        !maintenanceCategories.includes(
          c as (typeof maintenanceCategories)[number],
        ),
    )
  )
    return "Seleccioná una clasificación.";
  if (
    !file ||
    !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
    file.size <= 0 ||
    file.size > 20 * 1024 * 1024
  )
    return "Seleccioná un PDF, JPG o PNG de hasta 20 MB.";
  return null;
}
/** Exclude incomplete/cross-month or discontinuous intervals. Purchased liters remain an estimate. */
export function estimatedConsumption(rows: readonly FuelEntry[]) {
  const ordered = [...rows].sort(
    (a, b) =>
      (a.vehicle_id ?? "").localeCompare(b.vehicle_id ?? "") ||
      a.occurred_at.localeCompare(b.occurred_at),
  );
  const occurrences = new Map<string, number>();
  for (const r of rows) {
    const key = r.vehicle_id + "|" + r.occurred_at;
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }
  let intervals = 0;
  const coveredDates: string[] = [];
  let km = 0,
    liters = 0;
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1],
      b = ordered[i];
    if (
      !a.vehicle_id ||
      a.vehicle_id !== b.vehicle_id ||
      a.occurred_at === b.occurred_at ||
      a.occurred_at.slice(0, 7) !== b.occurred_at.slice(0, 7)
    )
      continue;
    if (
      occurrences.get(a.vehicle_id + "|" + a.occurred_at) !== 1 ||
      occurrences.get(b.vehicle_id + "|" + b.occurred_at) !== 1
    )
      continue;
    if (/aceite|lubricante/i.test(a.product + " " + b.product)) continue;
    if (
      a.liters <= 0 ||
      b.liters <= 0 ||
      a.net_amount < 0 ||
      b.net_amount < 0 ||
      a.odometer_km == null ||
      b.odometer_km == null ||
      b.odometer_km <= a.odometer_km
    )
      continue;
    if (
      b.previous_odometer_km !== a.odometer_km ||
      b.previous_liters !== a.liters
    )
      continue;
    if (
      !/diesel|nafta|gasolina|gasoil/i.test(a.product) ||
      !/diesel|nafta|gasolina|gasoil/i.test(b.product)
    )
      continue;
    // Both endpoints of a rollback are excluded.
    if (
      i > 1 &&
      ordered[i - 2].vehicle_id === a.vehicle_id &&
      ordered[i - 2].odometer_km != null &&
      ordered[i - 2].odometer_km! > a.odometer_km
    )
      continue;
    if (
      i + 1 < ordered.length &&
      ordered[i + 1].vehicle_id === b.vehicle_id &&
      ordered[i + 1].odometer_km != null &&
      ordered[i + 1].odometer_km! < b.odometer_km
    )
      continue;
    intervals++;
    coveredDates.push(a.occurred_at.slice(0, 10), b.occurred_at.slice(0, 10));
    km += b.odometer_km - a.odometer_km;
    liters += a.liters;
  }
  return {
    km,
    liters,
    intervals,
    from: coveredDates.sort()[0] ?? null,
    to: coveredDates.sort().at(-1) ?? null,
    l100: km > 0 ? (liters / km) * 100 : null,
  };
}
export function monthlyFuel(rows: readonly FuelEntry[]) {
  const groups = new Map<string, FuelEntry[]>();
  for (const row of rows) {
    const key = row.occurred_at.slice(0, 7) + "|" + (row.currency ?? "");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      month: key.slice(0, 7),
      currency: items[0].currency,
      loaded: items.reduce((s, r) => s + Math.max(0, r.liters), 0),
      adjustments: items.reduce((s, r) => s + Math.min(0, r.liters), 0),
      liters: items.reduce((s, r) => s + r.liters, 0),
      amount: items.reduce((s, r) => s + r.net_amount, 0),
    }));
}
