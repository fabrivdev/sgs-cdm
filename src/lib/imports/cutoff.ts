export const LEGACY_IMPORT_CUTOFF = "2026-06-30";
export const NEW_SYSTEM_START = "2026-07-01";

export type ImportEra = "legacy" | "new";

const stripTime = (value: string) => value.trim().slice(0, 10);

export function compareIsoDate(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return stripTime(a).localeCompare(stripTime(b));
}

export function resolveImportEra(dateIso: string | null | undefined): ImportEra | null {
  if (!dateIso) return null;
  return compareIsoDate(dateIso, NEW_SYSTEM_START) >= 0 ? "new" : "legacy";
}

export function isLegacyDate(dateIso: string | null | undefined) {
  return resolveImportEra(dateIso) === "legacy";
}

export function isNewSystemDate(dateIso: string | null | undefined) {
  return resolveImportEra(dateIso) === "new";
}

export function shouldReplaceNewSystemSlice(dateIso: string | null | undefined) {
  return isNewSystemDate(dateIso);
}
