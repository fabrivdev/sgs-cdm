import { supabase } from "@/integrations/supabase/client";
import { cargarTodo } from "@/hooks/useCatalogos";

export type ParkBillingIdentity = { id: string; ruc: string | null };

export function parkBillingRuc(value: string | null | undefined) {
  const ruc = (value ?? "").replace(/\s/g, "");
  if (!/^\d{5,9}-?\d$/.test(ruc)) return "";
  const digits = ruc.replace("-", "");
  return /^(\d)\1+$/.test(digits.slice(0, -1)) ? "" : digits;
}

export const parkBillingIdentityKey = (userId: string | undefined) => ["parque", "facturacion-identidades", userId] as const;

export function loadParkBillingIdentities() {
  return cargarTodo<ParkBillingIdentity>(
    supabase.from("clientes").select("id, ruc").not("ruc", "is", null).order("id"),
  );
}

export function parkBillingClientIds(id: string, identities: ParkBillingIdentity[]) {
  const ruc = parkBillingRuc(identities.find((client) => client.id === id)?.ruc);
  return ruc ? identities.filter((client) => parkBillingRuc(client.ruc) === ruc).map((client) => client.id) : [id];
}

type BillingSummary = {
  fact_actual: number;
  fact_prev: number;
  tiene_rep_rango: boolean;
  tiene_srv_rango: boolean;
  ult_repuesto: string | null;
  ult_servicio: string | null;
};

export function groupParkBilling<T extends BillingSummary>(
  summaries: Map<string, T>,
  parkClients: ParkBillingIdentity[],
  identities: ParkBillingIdentity[],
) {
  const parkIds = new Map<string, string[]>();
  for (const client of parkClients) {
    const ruc = parkBillingRuc(client.ruc);
    if (ruc) parkIds.set(ruc, [...(parkIds.get(ruc) ?? []), client.id]);
  }

  const result = new Map(summaries);
  for (const { id, ruc } of identities) {
    const holders = parkIds.get(parkBillingRuc(ruc));
    // If the park still has multiple holders, keep each existing allocation.
    if (holders?.length !== 1 || holders[0] === id) continue;
    const source = summaries.get(id);
    if (!source) continue;
    const targetId = holders[0];
    const target = result.get(targetId);
    result.delete(id);
    if (!target) {
      result.set(targetId, source);
      continue;
    }

    result.set(targetId, {
      ...target,
      fact_actual: target.fact_actual + source.fact_actual,
      fact_prev: target.fact_prev + source.fact_prev,
      tiene_rep_rango: target.tiene_rep_rango || source.tiene_rep_rango,
      tiene_srv_rango: target.tiene_srv_rango || source.tiene_srv_rango,
      ult_repuesto: source.ult_repuesto && (!target.ult_repuesto || source.ult_repuesto > target.ult_repuesto)
        ? source.ult_repuesto : target.ult_repuesto,
      ult_servicio: source.ult_servicio && (!target.ult_servicio || source.ult_servicio > target.ult_servicio)
        ? source.ult_servicio : target.ult_servicio,
    });
  }
  return result;
}
