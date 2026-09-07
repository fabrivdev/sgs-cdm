import { normalizeMachineBrand } from "./machineBrands";
import { canonicalMachineSubgroup, normalizeMachineModelKey } from "./machineModels";

export const upperMachineText = (value: unknown) => typeof value === "string" ? value.toLocaleUpperCase("es") : "";
export function normalizeNpCode(value: unknown): string | null {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/^(?:NP\s*[- ]?\s*)?(\d+)$/);
  if (!match) return null;
  const digits = match[1].replace(/^0+/, "") || "0";
  return digits.length <= 4 ? `NP${digits.padStart(4, "0")}` : null;
}

export type MachineCatalogBrand = { nombre: string; activa: boolean };
export type MachineCatalogModel = { id: string; nombre: string; marca_nombre: string; subgrupo: string; activo: boolean };
export type MachineCatalog = { brands: MachineCatalogBrand[]; models: MachineCatalogModel[] };
export type CatalogLine = { marca: string; modelo: string; subgrupo: string };
export const catalogLineKey = (line: CatalogLine) => JSON.stringify([normalizeMachineBrand(line.marca), canonicalMachineSubgroup(line.subgrupo), normalizeMachineModelKey(line.modelo)]);

function distance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next[j + 1] = Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1));
    previous = next;
  }
  return previous[b.length];
}

export function reviewCatalogLine(line: CatalogLine, catalog: MachineCatalog) {
  const brand = normalizeMachineBrand(line.marca);
  const key = normalizeMachineModelKey(line.modelo);
  const subgroup = canonicalMachineSubgroup(line.subgrupo);
  const brandEntry = catalog.brands.find(b => normalizeMachineBrand(b.nombre) === brand);
  const scoped = catalog.models.filter(m => normalizeMachineBrand(m.marca_nombre) === brand);
  const exact = scoped.filter(m => m.activo && normalizeMachineModelKey(m.nombre) === key && key);
  const withinSubgroup = exact.filter(m => m.subgrupo === subgroup);
  const match = withinSubgroup.length === 1 ? withinSubgroup[0] : exact.length === 1 ? exact[0] : undefined;
  const archived = brandEntry?.activa === false || (!match && scoped.some(m => !m.activo && m.subgrupo === subgroup && normalizeMachineModelKey(m.nombre) === key));
  const suggestions = key ? scoped.filter(m => m.activo).map(model => {
    const modelKey = normalizeMachineModelKey(model.nombre);
    return { model, score: 1 - distance(key, modelKey) / Math.max(key.length, modelKey.length, 1) };
  }).filter(s => s.score >= 0.55).sort((a, b) => b.score - a.score).slice(0, 3).map(s => s.model) : [];
  return { match, archived, unknownBrand: !brandEntry, needsConfirmation: !match || !brandEntry, suggestions };
}

export function reconcileCatalogLine<T extends CatalogLine>(line: T, catalog: MachineCatalog): T {
  const normalized = { ...line, marca: normalizeMachineBrand(line.marca), modelo: upperMachineText(line.modelo).trim(), subgrupo: canonicalMachineSubgroup(line.subgrupo) };
  const review = reviewCatalogLine(normalized, catalog);
  if (!review.match || review.archived) return normalized;
  return { ...normalized, modelo: review.match.nombre, subgrupo: review.match.subgrupo };
}

export function validMachineDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function exactCatalogName(value: string, names: string[]) {
  const key = normalizeMachineModelKey(value);
  const matches = [...new Set(names.filter(name => key && normalizeMachineModelKey(name) === key).map(name => upperMachineText(name).trim()))];
  return matches.length === 1 ? matches[0] : null;
}
