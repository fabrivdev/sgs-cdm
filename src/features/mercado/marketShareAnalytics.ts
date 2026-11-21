import { months, ratio } from "./model";
import { salesTotal, type SalesPeriod } from "./marketShareModel";

export type Dimension = "marca" | "distribuidor";
export const unknownDealer = "Sin distribuidor informado";
const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const integer = new Intl.NumberFormat("de-DE", { signDisplay: "exceptZero" });

export const signedUnits = (value: number | null) => value === null ? "—" : integer.format(value);
export const pointsLabel = (value: number | null) => value === null ? "—" : decimal.format(value) + " p. p.";

export type MarketStanding = {
  name: string;
  units: number;
  priorUnits: number | null;
  share: number | null;
  priorShare: number | null;
  delta: number | null;
  points: number | null;
  rank: number | null;
  priorRank: number | null;
  partialComparison: boolean;
};

export type StandingColumn = "rank" | "name" | "priorUnits" | "units" | "delta" | "growth" | "priorShare" | "share" | "points";
export type StandingSort = { key: StandingColumn; asc: boolean };
export const defaultStandingSort: StandingSort = { key: "units", asc: false };
export const standingGrowth = (row: MarketStanding) => row.delta === null ? null : ratio(row.delta, row.priorUnits ?? 0);
const searchable = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function visibleStandings(rows: MarketStanding[], query: string, sort: StandingSort) {
  const term = searchable(query.trim());
  return rows.filter(({ name }) => searchable(name).includes(term)).sort((a, b) => {
    const left = sort.key === "growth" ? standingGrowth(a) : a[sort.key];
    const right = sort.key === "growth" ? standingGrowth(b) : b[sort.key];
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const order = typeof left === "string" ? left.localeCompare(String(right), "es") : left - Number(right);
    return sort.asc ? order : -order;
  });
}

export function salesCalendar(dataset: SalesPeriod[], years: number[], cutoff: number) {
  const rows = years.map((year) => {
    const reported = new Map(dataset.filter((period) => period.anio === year).map((period) => [period.mes, period.total]));
    const values = months.map((_, index) => reported.get(index + 1) ?? null);
    const accumulate = (limit: number) => values.slice(0, limit).every((value) => value !== null)
      ? values.slice(0, limit).reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
    return { year, values, total: accumulate(cutoff), fullYear: accumulate(12) };
  });
  return rows.map((row) => {
    const prior = rows.find((candidate) => candidate.year === row.year - 1)?.total ?? null;
    return { ...row, growth: row.total === null || prior === null ? null : ratio(row.total - prior, prior) };
  });
}

function positions(counts: Map<string, number>) {
  const sorted = [...counts].filter(([name, units]) => name !== unknownDealer && units > 0)
    .sort((a, b) => b[1] - a[1]);
  let rank = 0;
  return new Map(sorted.map(([name, units], index) => {
    if (units !== sorted[index - 1]?.[1]) rank = index + 1;
    return [name, rank];
  }));
}

function group(periods: SalesPeriod[], by: Dimension, parent?: { by: Dimension; name: string }) {
  if (!periods.length || periods.some((period) => period.detalle === null)) return null;
  const counts = new Map<string, number>();
  for (const { detalle } of periods) {
    for (const sale of detalle ?? []) {
      if (parent && (sale[parent.by] ?? unknownDealer) !== parent.name) continue;
      const name = sale[by] ?? unknownDealer;
      counts.set(name, (counts.get(name) ?? 0) + sale.unidades);
    }
  }
  return counts;
}

export function unattributedUnits(periods: SalesPeriod[], brand?: string) {
  if (!periods.length || periods.some(({ detalle }) => detalle === null)) return null;
  return periods.reduce((total, { detalle }) => total + (detalle ?? []).reduce((units, sale) =>
    sale.distribuidor === null && (!brand || sale.marca === brand) ? units + sale.unidades : units, 0), 0);
}

export function standings(current: SalesPeriod[], previous: SalesPeriod[], by: Dimension, names: string[] = [],
  parent?: { by: Dimension; name: string }): MarketStanding[] {
  const now = group(current, by, parent);
  if (!now) return [];
  const before = group(previous, by, parent);
  const dealerAttribution = by === "distribuidor" || parent?.by === "distribuidor";
  const parentBrand = parent?.by === "marca" ? parent.name : undefined;
  const priorUnknown = dealerAttribution ? unattributedUnits(previous, parentBrand) : 0;
  const currentUnknown = dealerAttribution ? unattributedUnits(current, parentBrand) : 0;
  const comparable = before !== null && !priorUnknown && !currentUnknown;
  const total = salesTotal(current);
  const priorTotal = salesTotal(previous);
  const rank = positions(now);
  const priorRank = positions(comparable && before ? before : new Map());
  return [...new Set([...now.keys(), ...(before?.keys() ?? []), ...names])].map((name) => {
    const units = now.get(name) ?? 0;
    const priorUnits = before ? before.get(name) ?? (priorUnknown && name !== unknownDealer ? null : 0) : null;
    const share = ratio(units, total);
    const priorShare = priorUnits === null ? null : ratio(priorUnits, priorTotal);
    const canCompare = priorUnits !== null && name !== unknownDealer && (!currentUnknown || now.has(name));
    return {
      name, units, priorUnits, share, priorShare,
      delta: canCompare ? units - priorUnits : null,
      points: !canCompare || share === null || priorShare === null ? null : (share - priorShare) * 100,
      rank: rank.get(name) ?? null, priorRank: priorRank.get(name) ?? null,
      partialComparison: canCompare && !comparable,
    };
  }).sort((a, b) => b.units - a.units || (b.priorUnits ?? 0) - (a.priorUnits ?? 0) || a.name.localeCompare(b.name, "es"));
}

export function distributorHistory(dataset: SalesPeriod[], years: number[], cutoff: number) {
  const periods = [...years].sort((a, b) => a - b).map((year) => {
    const entries = dataset.filter((period) => period.anio === year && period.mes <= cutoff);
    const complete = entries.length === cutoff;
    return {
      year,
      units: complete ? salesTotal(entries) : null,
      counts: complete ? group(entries, "distribuidor") : null,
    };
  });
  const names = new Set(periods.flatMap(({ counts }) => [...(counts?.keys() ?? [])]));
  const rows = [...names].map((name) => {
    const values = periods.map(({ counts }) => counts?.get(name)
      ?? (counts && (!counts.has(unknownDealer) || name === unknownDealer) ? 0 : null));
    return { name, values, total: values.reduce<number>((sum, units) => sum + (units ?? 0), 0) };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  const aggregateOnly = periods.map(({ units, counts }) => counts ? null : units);
  return { periods, rows, aggregateOnly };
}

export function marketContributions(brands: MarketStanding[], benchmark: string) {
  return brands.flatMap(({ name, delta, priorUnits, units, share }) => delta !== null && priorUnits !== null && (delta !== 0 || name === benchmark)
    ? [{ name, delta, priorUnits, units, share }] : []).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.delta - a.delta);
}

export function dealerConcentration(dealers: MarketStanding[], total: number) {
  const known = dealers.filter(({ name, units }) => name !== unknownDealer && units > 0);
  const leaders = known.slice(0, 5).map(({ name, units }) => ({ name, units }));
  const rest = known.slice(5).reduce((sum, row) => sum + row.units, 0);
  const unknown = dealers.find(({ name }) => name === unknownDealer)?.units ?? 0;
  if (rest) leaders.push({ name: "Otros distribuidores", units: rest });
  if (unknown) leaders.push({ name: "Sin identificar", units: unknown });
  let accumulated = 0;
  return {
    rows: leaders.map((row) => {
      accumulated += row.units;
      return { ...row, share: 100 * (ratio(row.units, total) ?? 0), cumulative: 100 * (ratio(accumulated, total) ?? 0) };
    }),
  };
}

export function marketHistory(dataset: SalesPeriod[], years: number[], cutoff: number) {
  const byYear = new Map(years.map((year) => [
    year, new Map(dataset.filter((period) => period.anio === year).map((period) => [period.mes, period.total])),
  ]));
  return months.slice(0, cutoff).map((month, index) => ({
    month,
    ...Object.fromEntries(years.map((year) => {
      const values = byYear.get(year);
      const elapsed = months.slice(0, index + 1).map((_, i) => values?.get(i + 1));
      return [String(year), elapsed.every((units) => units !== undefined)
        ? elapsed.reduce<number>((sum, units) => sum + (units ?? 0), 0)
        : null];
    })),
  }));
}
