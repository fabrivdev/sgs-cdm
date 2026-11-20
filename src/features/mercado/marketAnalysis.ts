import { compare, label, totals, type Movement } from "./model";

export const hpBands = [
  "Hasta 80 HP",
  "81–120 HP",
  "121–170 HP",
  "171–230 HP",
  "Más de 230 HP",
];

const identified = (row: Movement) =>
  Boolean(row[3].trim() && row[4].trim()) &&
  row[4].toLowerCase() !== "sin identificar";

export function priceBridge(current: Movement[], previous: Movement[]) {
  const withPrice = (rows: Movement[]) => rows.filter((row) => row[10] > 0);
  const recent = withPrice(current),
    prior = withPrice(previous);
  const currentTotal = totals(recent),
    priorTotal = totals(prior);
  if (!currentTotal.units || !priorTotal.units) return null;
  const before = priorTotal.fob / priorTotal.units;
  const after = currentTotal.fob / currentTotal.units;
  const matched = compare(
    recent.filter(identified),
    prior.filter(identified),
    (row) => JSON.stringify([row[3], row[4], row[8]]),
  ).filter((group) => group.units > 0 && group.prior > 0);
  const recentUnits = matched.reduce((sum, group) => sum + group.units, 0);
  const priorUnits = matched.reduce((sum, group) => sum + group.prior, 0);
  const coverage = {
    priorUnits,
    recentUnits,
    priorTotal: priorTotal.units,
    recentTotal: currentTotal.units,
  };
  if (!matched.length) return { before, after, coverage, steps: [] };
  const priorComparable =
    matched.reduce((sum, group) => sum + group.priorFob, 0) / priorUnits;
  const mix =
    matched.reduce(
      (sum, group) => sum + (group.units * group.priorFob) / group.prior,
      0,
    ) / recentUnits;
  const recentComparable =
    matched.reduce((sum, group) => sum + group.fob, 0) / recentUnits;
  return {
    before,
    after,
    coverage,
    steps: [
      { name: "Sin par anterior", from: before, to: priorComparable },
      { name: "Mezcla de modelos", from: priorComparable, to: mix },
      { name: "FOB en comparables", from: mix, to: recentComparable },
      { name: "Sin par actual", from: recentComparable, to: after },
    ],
  };
}

export function positioning(current: Movement[], state: string) {
  const priced = current.filter((row) => row[10] > 0 && row[8] === state);
  const comparable = priced.filter(
    (row) => identified(row) && hpBands.includes(row[5]),
  );
  const points = compare(comparable, [], (row) =>
    JSON.stringify([label(row, "modelos"), row[5]]),
  ).map((group) => {
    const [model, band] = JSON.parse(group.name) as [string, string];
    return {
      model,
      band,
      power: hpBands.indexOf(band),
      units: group.units,
      price: group.fob / group.units,
    };
  });
  return {
    points,
    covered: totals(comparable).units,
    priced: totals(priced).units,
  };
}

export function seasonality(
  rows: Movement[],
  scoped: Movement[],
  year: number,
  months: number[],
) {
  const coverage = new Map<number, [number, number]>();
  const quantities = new Map<number, number[]>();
  for (const row of rows) {
    if (row[1] > year) continue;
    const [first, last] = coverage.get(row[1]) ?? [12, 1];
    coverage.set(row[1], [Math.min(first, row[2]), Math.max(last, row[2])]);
  }
  for (const row of scoped) {
    const values = quantities.get(row[1]) ?? Array<number>(12).fill(0);
    values[row[2] - 1] += row[9];
    quantities.set(row[1], values);
  }
  const grid = [...coverage.entries()]
    .sort(([left], [right]) => right - left)
    .map(([period, [first, last]]) => ({
      year: period,
      values: months.map((month) =>
        month >= first && month <= last
          ? (quantities.get(period)?.[month - 1] ?? 0)
          : null,
      ),
    }));
  const baseline = months.map((_, i) => {
    const samples = grid
      .filter((row) => row.year < year)
      .map((row) => row.values[i])
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    if (!samples.length) return null;
    return (
      (samples[Math.floor((samples.length - 1) / 2)] +
        samples[Math.floor(samples.length / 2)]) /
      2
    );
  });
  return { grid, baseline };
}
