import { shortPersonName } from "./personName";

// Exact pairs from the cross-system seller export (2026-09-15).
// Do not infer identities from first/last words: JAVIER NALERIO is FRANCISCO NALERIO.
export const partsSellerIdentities = [
  ["FERNANDO PETTER", ["FERNANDO PETTER ANTES", "FERNANDO PETTER"]],
  ["LUCAS MAUGER", ["LUCAS MAUGER QUIRING", "LUCAS MAUGER"]],
  ["FRANCISCO NALERIO", ["FRANCISCO JAVIER NALERIO LAURENT", "JAVIER NALERIO", "FRANCISCO NALERIO"]],
  ["MAURO CABALLERO", ["MAURO CABALLERO LOPEZ", "MAURO CABALLERO"]],
  ["WILLIAM CHAVEZ", ["WILLIAM DAVID CHAVEZ", "WILLIAM CHAVEZ"]],
  ["PEDRO SERVIAN", ["PEDRO HECTOR SERVIAN ACUÑA", "PEDRO SERVIAN"]],
  ["TIAGO LANDO", ["TIAGO ALEX LANDO DE MOURA", "TIAGO LANDO"]],
  ["ROQUE ZARATE", ["ROQUE ANTONIO ZARATE MEDINA", "ROQUE ZARATE"]],
  ["MONICA ROCHA", ["MONICA ROCHA RABELO", "MONICA ROCHA"]],
] as const;

const key = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const names = new Map<string, string>(partsSellerIdentities.flatMap(([name, aliases]) =>
  aliases.map(alias => [key(alias), name] as [string, string]),
));

export function partsSellerName(value: unknown): string {
  const name = String(value ?? "").trim()
    .replace(/^(?:\d+(?:\s*[-–—:]\s*|\s+)|[a-z]{1,4}\d+\s*[-–—:]\s*)/i, "")
    .replace(/\s+/g, " ").trim();
  if (!name || /^[-–—]+$/.test(name) || /^(?:\d+|[a-z]{1,4}\d+)$/i.test(name)) return "Sin vendedor";
  return names.get(key(name)) ?? shortPersonName(name).toLocaleUpperCase("es-PY");
}
