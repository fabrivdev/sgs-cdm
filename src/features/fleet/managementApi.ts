/* eslint-disable @typescript-eslint/no-explicit-any -- Regenerate Supabase types after applying the reviewed local migration. */
import { supabase } from "@/integrations/supabase/client";
import { loadFleetSnapshot } from "./api";
import type {
  ManagedVehicle,
  MaintenanceEntry,
  Invoice,
  FuelEntry,
} from "./managementModel";
const client = supabase as any;
export async function fleetRpc<T = string>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}
async function readAll<T>(table: string, order = "id"): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(order)
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
    offset += 500;
  }
  return rows;
}
export async function loadManagement() {
  const [base, fuel, history, invoices, changes] = await Promise.all([
    loadFleetSnapshot(),
    readAll<FuelEntry>("fleet_fuel_entries"),
    readAll<MaintenanceEntry>("fleet_maintenance_history"),
    readAll<Invoice>("fleet_maintenance_invoices"),
    readAll<{
      id: string;
      vehicle_id: string;
      occurred_at: string;
      actor: string;
      actor_name: string;
      before_data: Record<string, unknown>;
      after_data: Record<string, unknown>;
    }>("fleet_change_events"),
  ]);
  return {
    ...base,
    vehicles: base.vehicles as ManagedVehicle[],
    fuel: fuel.map((r) => ({
      ...r,
      liters: Number(r.liters),
      net_amount: Number(r.net_amount),
      odometer_km: r.odometer_km == null ? null : Number(r.odometer_km),
      previous_odometer_km:
        r.previous_odometer_km == null ? null : Number(r.previous_odometer_km),
      previous_liters:
        r.previous_liters == null ? null : Number(r.previous_liters),
    })),
    history,
    invoices: invoices.filter((i) => i.status === "uploaded"),
    changes,
  };
}
export async function submitInvoice(
  id: string,
  input: Record<string, unknown>,
  file: File,
  onReserved?: () => void,
) {
  const path = await fleetRpc<string>("fleet_reserve_invoice", {
    p_id: id,
    p_data: {
      ...input,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
  });
  onReserved?.();
  const { error } = await supabase.storage
    .from("fleet-invoices")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error && !("statusCode" in error && String(error.statusCode) === "409"))
    throw error;
  await fleetRpc("fleet_finalize_invoice", { p_id: path.split("/").at(-1) });
}
export async function invoiceUrl(invoice: Invoice) {
  const { data, error } = await supabase.storage
    .from("fleet-invoices")
    .createSignedUrl(invoice.storage_path, 60);
  if (error) throw error;
  return data.signedUrl;
}
