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

export function positioning(
  current: Movement[],
  state: string,
  bands: readonly string[] = hpBands,
  groupBand = (band: string) => band,
) {
  const priced = current.filter((row) => row[10] > 0 && row[8] === state);
  const comparable = priced.filter(
    (row) => identified(row) && bands.includes(groupBand(row[5])),
  );
  const points = compare(comparable, [], (row) =>
    JSON.stringify([label(row, "modelos"), groupBand(row[5])]),
  ).map((group) => {
    const [model, band] = JSON.parse(group.name) as [string, string];
    return {
      model,
      band,
      power: bands.indexOf(band),
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

function monthlyUnits(
  rows: Movement[],
  scoped: Movement[],
  year: number,
  months: number[],
  observedMonthsOnly = false,
) {
  const coverage = new Map<number, [number, number]>();
  const quantities = new Map<number, number[]>();
  const observed = new Set<number>();
  for (const row of rows) {
    if (row[1] > year) continue;
    observed.add(row[1] * 12 + row[2]);
    const [first, last] = coverage.get(row[1]) ?? [12, 1];
    coverage.set(row[1], [Math.min(first, row[2]), Math.max(last, row[2])]);
  }
  for (const row of scoped) {
    const values = quantities.get(row[1]) ?? Array<number>(12).fill(0);
    values[row[2] - 1] += row[9];
    quantities.set(row[1], values);
  }
  return [...coverage.entries()]
    .sort(([left], [right]) => right - left)
    .map(([period, [first, last]]) => ({
      year: period,
      values: months.map((month) =>
        month >= first && month <= last && (!observedMonthsOnly || observed.has(period * 12 + month))
          ? (quantities.get(period)?.[month - 1] ?? 0)
          : null,
      ),
    }));
}

export function seasonality(
  rows: Movement[],
  scoped: Movement[],
  year: number,
  months: number[],
  observedMonthsOnly = false,
) {
  const grid = monthlyUnits(rows, scoped, year, months, observedMonthsOnly);
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

function quantile(sorted: number[], probability: number) {
  const rank = (sorted.length - 1) * probability;
  const lower = Math.floor(rank);
  return (
    sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) * (rank - lower)
  );
}

export function cumulativeUnits(
  rows: Movement[],
  scoped: Movement[],
  year: number,
  end: number,
  observedMonthsOnly = false,
) {
  const months = Array.from({ length: end }, (_, index) => index + 1);
  const byYear = new Map(
    monthlyUnits(rows, scoped, year, months, observedMonthsOnly).map((period) => {
      let total: number | null = 0;
      const cumulative = period.values.map((value) => {
        total = total === null || value === null ? null : total + value;
        return total;
      });
      return [period.year, cumulative] as const;
    }),
  );
  const history = [...byYear].filter(([period]) => period < year);
  return months.map((month, index) => {
    const samples = history
      .map(([, values]) => values[index])
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    return {
      month,
      current: byYear.get(year)?.[index] ?? null,
      previous: byYear.get(year - 1)?.[index] ?? null,
      median: samples.length ? quantile(samples, 0.5) : null,
      range:
        samples.length > 1
          ? ([quantile(samples, 0.25), quantile(samples, 0.75)] as [
              number,
              number,
            ])
          : null,
    };
  });
}
