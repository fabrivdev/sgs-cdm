import type { Invoice, MaintenanceEntry } from "./managementModel";
import { money, within, type FleetFilters } from "./workspaceModel";

export function maintenanceExpenseMoney(
  history: MaintenanceEntry[],
  invoices: Invoice[],
  vehicleIds: ReadonlySet<string>,
  filters: Pick<FleetFilters, "from" | "to">,
) {
  return money([
    ...invoices.filter(
      (r) =>
        r.status === "uploaded" &&
        vehicleIds.has(r.vehicle_id ?? "") &&
        within(r.performed_on ?? r.invoice_date, filters),
    ),
    ...history
      .filter(
        (r) =>
          vehicleIds.has(r.vehicle_id ?? "") && within(r.occurred_on, filters),
      )
      .map(maintenanceHistoryMoney),
  ]);
}

/** Only consume amounts explicitly prepared by the reviewed TOTVS import. */
export function maintenanceHistoryMoney(
  entry: Pick<MaintenanceEntry, "raw_data">,
) {
  const value = entry.raw_data.totvs_financial;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const data = value as Record<string, unknown>;
    const { base, tax, total } = data;
    if (
      data.version === 1 &&
      data.currency === "PYG" &&
      typeof base === "number" &&
      typeof tax === "number" &&
      typeof total === "number" &&
      [base, tax, total].every((n) => Number.isSafeInteger(n) && n >= 0) &&
      base + tax === total
    ) {
      return { amount: total, currency: "PYG" };
    }
  }
  return { amount: null, currency: null };
}
