import { normalizeMachineBrand } from "@/lib/machineBrands";
import type { IndicadorMarcaTipo, IndicadorMaquina } from "./useServiciosIndicadores";

export function serviceReportBrand(value: string): string {
  const brand = normalizeMachineBrand(value);
  if (!brand || /^(?:SIN|NO) (?:IDENTIFICAR|IDENTIFICADO|INFORMAR|INFORMADO|CLASIFICAR|CLASIFICADO|MARCA)$/.test(brand)) return value;
  return brand === "CLAAS" || brand === "HORSCH" ? brand : "OTROS";
}

const amountKeys = ["mo", "km", "repuestos", "terceros", "neto"] as const;

export function groupServiceBrandsByTime(rows: IndicadorMarcaTipo[]): IndicadorMarcaTipo[] {
  const groups = new Map<string, IndicadorMarcaTipo>();
  for (const row of rows) {
    const marca = serviceReportBrand(row.marca);
    const key = JSON.stringify([marca, row.tipo_tiempo, Boolean(row.sin_vinculo_historico)]);
    const group = groups.get(key);
    if (!group) groups.set(key, { ...row, marca });
    else {
      for (const field of amountKeys) group[field] += row[field];
      group.horas = group.horas == null || row.horas == null ? null : group.horas + row.horas;
    }
  }
  return [...groups.values()];
}

export function groupServiceBrandsByMachine(rows: IndicadorMaquina[]): IndicadorMaquina[] {
  const groups = new Map<string, IndicadorMaquina>();
  for (const row of rows) {
    const marca = serviceReportBrand(row.marca);
    const key = JSON.stringify([marca, row.tipo_maquina]);
    const group = groups.get(key);
    if (!group) groups.set(key, { ...row, marca });
    else {
      // RPC rows use one resolved brand/type per chassis: brand populations are disjoint.
      for (const field of [...amountKeys, "maquinas", "ordenes", "horas"] as const) group[field] += row[field];
    }
  }
  return [...groups.values()];
}
