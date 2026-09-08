import type { Marca } from "@/lib/constants";
import type { CSSProperties } from "react";

export const DEFAULT_MACHINE_BRANDS = ["CLAAS", "HORSCH"] as const;

export function normalizeMachineBrand(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("es");
  return normalized === "NB MAQUINAS" ? "NB" : normalized;
}

export function legacyMachineBrand(value: unknown): Marca {
  const brand = normalizeMachineBrand(value);
  return brand === "CLAAS" || brand === "HORSCH" ? brand : "OTROS";
}

export function visibleMachineBrand(value: unknown): string {
  const brand = normalizeMachineBrand(value);
  return brand && brand !== "OTROS" ? brand : "Sin marca";
}

export function machineBrandStyle(value: unknown): CSSProperties | undefined {
  const brand = normalizeMachineBrand(value);
  if (!brand || brand === "OTROS" || brand === "SIN MARCA" || brand === "CLAAS" || brand === "HORSCH") return undefined;

  let hash = 0;
  for (const character of brand) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return {
    backgroundColor: `hsl(${hue} 68% 94%)`,
    borderColor: `hsl(${hue} 52% 72%)`,
    color: `hsl(${hue} 62% 28%)`,
  };
}
