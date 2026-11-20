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
};

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

export function standings(current: SalesPeriod[], previous: SalesPeriod[], by: Dimension, names: string[] = [],
  parent?: { by: Dimension; name: string }): MarketStanding[] {
  const now = group(current, by, parent);
  if (!now) return [];
  const before = group(previous, by, parent);
  const dealerAttribution = by === "distribuidor" || parent?.by === "distribuidor";
  const comparable = before && (!dealerAttribution || ![...current, ...previous].some(({ detalle }) =>
    detalle?.some((sale) => sale.distribuidor === null && (!parent || parent.by === "distribuidor" || sale.marca === parent.name))));
  const priorCounts = comparable ? before : null;
  const total = salesTotal(current);
  const priorTotal = salesTotal(previous);
  const rank = positions(now);
  const priorRank = positions(priorCounts ?? new Map());
  return [...new Set([...now.keys(), ...(priorCounts?.keys() ?? []), ...names])].map((name) => {
    const units = now.get(name) ?? 0;
    const priorUnits = priorCounts ? priorCounts.get(name) ?? 0 : null;
    const share = ratio(units, total);
    const priorShare = priorUnits === null ? null : ratio(priorUnits, priorTotal);
    return {
      name, units, priorUnits, share, priorShare,
      delta: priorUnits === null ? null : units - priorUnits,
      points: share === null || priorShare === null ? null : (share - priorShare) * 100,
      rank: rank.get(name) ?? null, priorRank: priorRank.get(name) ?? null,
    };
  }).sort((a, b) => b.units - a.units || (b.priorUnits ?? 0) - (a.priorUnits ?? 0) || a.name.localeCompare(b.name, "es"));
}

export function marketContributions(brands: MarketStanding[], benchmark: string) {
  const changes = brands.flatMap(({ name, delta }) => delta ? [{ name, delta }] : []);
  const ascending = [...changes].sort((a, b) => a.delta - b.delta);
  const gains = ascending.filter((row) => row.delta > 0);
  const losses = ascending.filter((row) => row.delta < 0);
  const leaders = [...gains.slice(losses.length ? -3 : -5).reverse(), ...losses.slice(0, gains.length ? 3 : 5)];
  const reference = changes.find((row) => row.name === benchmark);
  if (reference && !leaders.includes(reference)) leaders.push(reference);
  const remaining = changes.filter((row) => !leaders.includes(row));
  leaders.sort((a, b) => b.delta - a.delta);
  if (remaining.length) leaders.push({ name: "Otras marcas", delta: remaining.reduce((sum, row) => sum + row.delta, 0) });
  return leaders;
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
    topThree: known.length ? ratio(known.slice(0, 3).reduce((sum, row) => sum + row.units, 0), total) : null,
    priorTopThree: dealers.some((row) => row.priorShare !== null)
      ? [...dealers].filter((row) => row.name !== unknownDealer).sort((a, b) => (b.priorShare ?? 0) - (a.priorShare ?? 0))
        .slice(0, 3).reduce((sum, row) => sum + (row.priorShare ?? 0), 0)
      : null,
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
