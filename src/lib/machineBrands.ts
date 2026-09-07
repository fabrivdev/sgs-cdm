import type { Marca } from "@/lib/constants";

export const DEFAULT_MACHINE_BRANDS = ["CLAAS", "HORSCH"] as const;

export function normalizeMachineBrand(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es");
}

export function legacyMachineBrand(value: unknown): Marca {
  const brand = normalizeMachineBrand(value);
  return brand === "CLAAS" || brand === "HORSCH" ? brand : "OTROS";
}

export function visibleMachineBrand(value: unknown): string {
  const brand = normalizeMachineBrand(value);
  return brand && brand !== "OTROS" ? brand : "Sin marca";
}
