import type { ServicioOSRow } from "@/components/dashboard/types";

export interface OrderBilling {
  os: string;
  matched: boolean;
  ambiguous: boolean;
  documents: string[];
  date: string | null;
  labor: number | null;
  parts: number | null;
  travel: number | null;
  thirdParty: number | null;
  total: number | null;
  laborLines: number;
  missingRates: number;
  billedHours: number | null;
}
export const billingKey = (os: string) => os.trim().toUpperCase();

/** Compare complete, billed, closed orders, not technicians or invoice rows. */
export function billingEfficiency(rows: ServicioOSRow[]) {
  let billedHours = 0, workedHours = 0, orders = 0, incomplete = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    const key = billingKey(row.os);
    if (seen.has(key) || row.estadoOS !== "Cerrada") continue;
    seen.add(key);
    const bill = row.billing;
    if (!bill || bill.ambiguous) { incomplete++; continue; }
    // Orders without billed labor are not treated as zero-efficiency work.
    if (!bill.matched || !bill.laborLines) continue;
    if (bill.billedHours === null || !Number.isFinite(bill.billedHours) || bill.missingRates > 0 ||
        !Number.isFinite(row.horas) || row.horas <= 0) { incomplete++; continue; }
    billedHours += bill.billedHours;
    workedHours += row.horas;
    orders++;
  }
  return { billedHours, workedHours, orders, incomplete,
    percentage: incomplete === 0 && workedHours > 0 ? billedHours / workedHours * 100 : null };
}

function validBilling(value: unknown): value is OrderBilling {
  if (!value || typeof value !== "object") return false;
  const row = value as OrderBilling;
  return typeof row.os === "string" && typeof row.matched === "boolean" && typeof row.ambiguous === "boolean" &&
    Array.isArray(row.documents) && row.documents.every(d => typeof d === "string") &&
    (row.date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.date)) &&
    [row.labor, row.parts, row.travel, row.thirdParty, row.total, row.billedHours].every(v => v === null || (typeof v === "number" && Number.isFinite(v))) &&
    [row.laborLines, row.missingRates].every(v => Number.isInteger(v) && v >= 0) &&
    (!row.matched || [row.labor, row.parts, row.travel, row.thirdParty, row.total].every(v => typeof v === "number"));
}

// The RPC returns one aggregate for every requested OS, including unmatched ones.
// JSON avoids PostgREST's row cap. Batches are disjoint and validated before publishing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadOrderBilling(client: any, orders: string[], cutoff: string, signal?: AbortSignal): Promise<Record<string, OrderBilling>> {
  const keys = [...new Set(orders.map(billingKey))].sort();
  const result: Record<string, OrderBilling> = {};
  for (let offset = 0; offset < keys.length; offset += 250) {
    signal?.throwIfAborted();
    const batch = keys.slice(offset, offset + 250);
    const request = client.rpc("service_orders_billing_v1", { p_os_numeros: batch, p_hasta: cutoff });
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== batch.length) throw new Error("Facturación incompleta.");
    const expected = new Set(batch);
    for (const row of data) {
      if (!validBilling(row) || !expected.delete(billingKey(row.os))) throw new Error("Facturación no válida.");
      result[billingKey(row.os)] = row;
    }
  }
  signal?.throwIfAborted();
  return result;
}

export function billingWarning(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["42883", "PGRST202"].includes(code)) return "Facturación de OS pendiente de actualizar en la base.";
  if (code === "42501") return "Facturación de OS no disponible con estos permisos.";
  return "No se pudo cargar la facturación de OS.";
}
