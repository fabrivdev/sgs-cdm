import type { ServicioOSRow } from "@/components/dashboard/types";

/** Read equipment identity from the imported OS, never from the billed product. */
export function importedOrderModel(raw: Record<string, unknown> | null): string | null {
  for (const key of ["canonical_model", "MODELO", "Modelo", "modelo"]) {
    const value = raw?.[key];
    if (typeof value !== "string") continue;
    const model = value.trim();
    if (model && !/^[-_.\s]+$/.test(model)) return model;
  }
  return null;
}

function calendarDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const stamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date) return null;
  return stamp / 86_400_000;
}

/** Calendar days from opening to invoicing, not the operational closing date. */
export function orderClosingDays(row: Pick<ServicioOSRow, "fechaApertura" | "fechaFacturacion">): number | null {
  const start = calendarDay(row.fechaApertura);
  const end = calendarDay(row.fechaFacturacion);
  return start === null || end === null || end < start ? null : end - start;
}

/** The caller supplies the complete filtered OS population, one row per OS. */
export function orderClosureMetrics(rows: readonly ServicioOSRow[]) {
  const days = rows.map(orderClosingDays).filter((value): value is number => value !== null);
  return {
    percentage: rows.length ? rows.filter(row => row.estadoOS === "Cerrada").length / rows.length * 100 : null,
    averageDays: days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : null,
    datedOrders: days.length,
  };
}
