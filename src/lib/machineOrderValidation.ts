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
export type MachineCatalogAlias = { marca: string; alias: string; modelo_catalogo_id: string; revisado_manual?: boolean };
export type MachineCatalog = { brands: MachineCatalogBrand[]; models: MachineCatalogModel[]; aliases?: MachineCatalogAlias[] };
export type CatalogLine = { marca: string; modelo: string; subgrupo: string };
export const catalogLineKey = (line: CatalogLine) => JSON.stringify([normalizeMachineBrand(line.marca), canonicalMachineSubgroup(line.subgrupo), normalizeMachineModelKey(line.modelo)]);

// Aliases that change/add model numbers need human review, not automatic substitution.
export const safeMachineModelAlias = (alias: string, name: string) =>
  normalizeMachineModelKey(alias).replace(/[^0-9]/g, "") === normalizeMachineModelKey(name).replace(/[^0-9]/g, "");

// Ancho/configuración no crea otro modelo comercial. Solo se unifica cuando el
// catálogo también contiene explícitamente el modelo base de la misma marca y tipo.
function configuredHeaderBase(value: string) {
  const normalized = upperMachineText(value).replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.match(/^(CONVIO FLEX \d+)\s+(?:RICE\s+)?\d+\s+(?:PIES|FT)$/)?.[1] ?? null;
}

function canonicalConfiguredModel(model: MachineCatalogModel, models: MachineCatalogModel[]) {
  const base = configuredHeaderBase(model.nombre);
  if (!base) return model;
  return models.find(candidate => candidate.activo
    && normalizeMachineBrand(candidate.marca_nombre) === normalizeMachineBrand(model.marca_nombre)
    && canonicalMachineSubgroup(candidate.subgrupo) === canonicalMachineSubgroup(model.subgrupo)
    && normalizeMachineModelKey(candidate.nombre) === normalizeMachineModelKey(base)) ?? model;
}

export function catalogModelsForBrand(catalog: MachineCatalog, brand: string) {
  const normalized = normalizeMachineBrand(brand);
  if (catalog.brands.some(b => normalizeMachineBrand(b.nombre) === normalized && !b.activa)) return [];
  const scoped = catalog.models.filter(m => m.activo && normalizeMachineBrand(m.marca_nombre) === normalized);
  const unique = new Map<string, MachineCatalogModel>();
  scoped.forEach(model => {
    const canonical = canonicalConfiguredModel(model, scoped);
    unique.set(`${canonicalMachineSubgroup(canonical.subgrupo)}|${normalizeMachineModelKey(canonical.nombre)}`, canonical);
  });
  return [...unique.values()]
    .sort((a, b) => a.subgrupo.localeCompare(b.subgrupo) || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

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
  const exactNames = scoped.filter(m => m.activo && normalizeMachineModelKey(m.nombre) === key && key)
    .map(model => canonicalConfiguredModel(model, scoped));
  const aliases = (catalog.aliases ?? []).filter(a => normalizeMachineBrand(a.marca) === brand && key && normalizeMachineModelKey(a.alias) === key);
  const aliasIds = new Set(aliases.filter(alias => alias.revisado_manual).map(alias => alias.modelo_catalogo_id));
  const safeAliasIds = new Set(aliases.filter(alias => !alias.revisado_manual).map(alias => alias.modelo_catalogo_id));
  const exact = exactNames.length ? [...new Map(exactNames.map(model => [model.id, model])).values()]
    : scoped.filter(m => m.activo && (aliasIds.has(m.id) || (safeAliasIds.has(m.id) && safeMachineModelAlias(line.modelo, m.nombre))));
  const withinSubgroup = exact.filter(m => m.subgrupo === subgroup);
  const match = withinSubgroup.length === 1 ? withinSubgroup[0] : exact.length === 1 ? exact[0] : undefined;
  const archived = brandEntry?.activa === false || (!match && scoped.some(m => !m.activo && normalizeMachineModelKey(m.nombre) === key));
  const suggestions = key && !match ? scoped.filter(m => m.activo).map(model => {
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
