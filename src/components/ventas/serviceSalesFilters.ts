import { serviceSalesError } from "@/lib/serviceSalesError";

export type ServiceSalesFilters = {
  cliente?: string; propietario?: string; factura?: string; os?: string;
  chasis?: string; descripcion?: string; codigo?: string; componente?: string;
  origen?: string; documento?: string; vinculo?: string;
};
export const SERVICE_FILTER_FIELDS = [
  ["cliente", "Cliente facturado"], ["propietario", "Propietario actual"],
  ["factura", "Factura"], ["os", "OS"], ["chasis", "Chasis"], ["descripcion", "Descripción"], ["codigo", "Código"],
] as const;

export function serviceFiltersKey(filters?: ServiceSalesFilters): string {
  return JSON.stringify(Object.fromEntries(Object.entries(filters ?? {})
    .map(([key, value]) => [key, value?.trim()]).filter(([, value]) => value)
    .sort(([a], [b]) => a!.localeCompare(b!))));
}
// Only advanced filters need the new SQL. Never silently fall back if it is
// missing: that would display unfiltered totals as if they matched the controls.
export function serviceFilteredRequest(name: string, key: string) {
  return key === "{}" ? { name, params: {} } : {
    name: `${name}_filtrado`, params: { p_filtros: JSON.parse(key) as ServiceSalesFilters },
  };
}
export function serviceFilteredError(error: { code?: string; message?: string }, key: string) {
  if (key !== "{}" && (error.code === "PGRST202" || error.message?.includes("Could not find the function"))) {
    return "Actualización de filtros pendiente: ejecutá el SQL 20260917180000 de Servicios y recargá la página.";
  }
  return serviceSalesError(error);
}
