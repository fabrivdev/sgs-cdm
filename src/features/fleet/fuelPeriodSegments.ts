import { fuelIntervals, type FuelEntry } from "./managementModel";
import { fuelOdometerIssues } from "./fuelOdometer";

export function fuelPeriodSegments(
  rows: readonly FuelEntry[],
  identity: (row: FuelEntry) => string | null,
) {
  const distances = new Map<string, number>();
  fuelIntervals(rows, false, undefined, undefined, identity, distances);
  const issues = fuelOdometerIssues(rows, identity);
  const groups = new Map<string, FuelEntry[]>();
  const reversals = new Set(
    rows
      .filter((row) => row.liters < 0 && row.net_amount < 0)
      .map((row) =>
        JSON.stringify([
          row.source_key.split(":")[1],
          row.station,
          row.product,
          -row.liters,
          -row.net_amount,
        ]),
      ),
  );
  const isReversed = (row: FuelEntry) =>
    reversals.has(
      JSON.stringify([
        row.source_key.split(":")[1],
        row.station,
        row.product,
        row.liters,
        row.net_amount,
      ]),
    );
  for (const row of rows) {
    const key = identity(row);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const segments = new Map<string, { km: number; liters: number }>();
  for (const group of groups.values()) {
    group.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const times = new Map<string, number>();
    for (const row of group)
      times.set(row.occurred_at, (times.get(row.occurred_at) ?? 0) + 1);
    const validLoad = (row: FuelEntry) =>
      times.get(row.occurred_at) === 1 &&
      !isReversed(row) &&
      row.liters > 0 &&
      row.net_amount >= 0 &&
      /diesel|nafta|gasolina|gasoil/i.test(row.product) &&
      !/aceite|lubricante/i.test(row.product) &&
      row.odometer_km != null &&
      Number.isFinite(row.odometer_km) &&
      row.odometer_km >= 0;
    let anchor: number | null = null;
    for (const [index, row] of group.entries()) {
      if (!validLoad(row)) {
        anchor = null;
        continue;
      }
      if (issues.has(row)) continue;
      const previous = group[index - 1];
      const distance = distances.get(row.id);
      if (distance != null && previous && !isReversed(previous)) {
        segments.set(row.id, { km: distance, liters: previous.liters });
      } else if (anchor != null && index > anchor + 1) {
        const start = group[anchor];
        const km = row.odometer_km! - start.odometer_km!;
        const span = group.slice(anchor, index);
        const continuous = span.every((load, offset) => {
          const next = group[anchor! + offset + 1];
          return (
            next.previous_odometer_km === load.odometer_km &&
            next.previous_liters === load.liters
          );
        });
        if (km > 0 && continuous)
          segments.set(row.id, {
            km,
            liters: span.reduce((sum, load) => sum + load.liters, 0),
          });
      }
      anchor = index;
    }
  }
  return segments;
}
