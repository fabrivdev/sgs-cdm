// Helpers compartidos de match de sucursal y deteccion de tablas faltantes,
// usados tanto por ImportarTab.tsx (flujos viejos) como por
// newSystemPersist.ts (el trio OS+Facturacion+Productos extraido de ahi).
// Viven en lib, no en un componente, para evitar que lib importe de un
// componente (dependencia circular).
import { SUCURSALES, type Sucursal } from "@/lib/constants";

const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();

export const normText = (s: unknown) => lower(s).replace(/\s+/g, " ");
export const normCode = (s: unknown) => norm(s).replace(/\s+/g, "").toLowerCase();

export const REGION_TO_SUCURSAL: Record<string, Sucursal> = {
  central: "Santa Rita",
  "santa rita": "Santa Rita",
  "santa rosa del aguaray": "Santa Rosa",
  "santa rosa": "Santa Rosa",
  "campo 9": "Campo 9",
  "campo nueve": "Campo 9",
  misiones: "Misiones",
  "loma plata": "Loma Plata",
  katuete: "Katuete",
  "katueté": "Katuete",
};

export const matchSucursalFromRegion = (region: unknown): Sucursal | null => {
  const v = lower(region).replace(/\s*\(\d+\)\s*$/, "");
  return REGION_TO_SUCURSAL[v] ?? null;
};

export const matchSucursal = (s: unknown): Sucursal | null => {
  const v = lower(s);
  return (SUCURSALES.find((x) => x.toLowerCase() === v) ?? null) as Sucursal | null;
};

export const isMissingOsImportTableError = (error: unknown) => {
  const message = String((error as any)?.message ?? "");
  const code = String((error as any)?.code ?? "");
  return (code === "PGRST205" || code === "PGRST204" || code === "42P01") && message.includes("ordenes_servicio_importadas");
};

export const isMissingBillingLinesTableError = (error: unknown) => {
  const message = String((error as any)?.message ?? "");
  const code = String((error as any)?.code ?? "");
  return (code === "PGRST205" || code === "PGRST204" || code === "42P01") && message.includes("facturacion_lineas_importadas");
};
