import type { FuelEntry } from "./managementModel";

/** Diagnosis only: retain source values and never interpolate a replacement. */
export function fuelOdometerIssues(
  rows: readonly FuelEntry[],
  groupKey: (row: FuelEntry) => string | null = (row) => row.vehicle_id,
) {
  const issues = new Map<FuelEntry, string>();
  const groups = new Map<string, FuelEntry[]>();
  for (const row of rows) {
    const key = groupKey(row);
    if (
      !key ||
      row.liters <= 0 ||
      row.net_amount < 0 ||
      /aceite|lubricante/i.test(row.product) ||
      !/diesel|nafta|gasolina|gasoil/i.test(row.product)
    )
      continue;
    if (row.odometer_km == null) continue;
    if (!Number.isFinite(row.odometer_km) || row.odometer_km < 0) {
      issues.set(row, "Kilometraje inválido");
      continue;
    }
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    // An isolated low reading must not invalidate the entire earlier history.
    for (let i = 1; i < group.length - 1; i++) {
      const previous = group[i - 1],
        current = group[i],
        next = group[i + 1];
      if (
        previous.occurred_at < current.occurred_at &&
        current.occurred_at < next.occurred_at &&
        current.odometer_km! < previous.odometer_km! &&
        next.odometer_km! >= previous.odometer_km!
      ) {
        issues.set(
          current,
          "Retroceso aislado; la siguiente carga recupera la secuencia",
        );
      }
    }
    let laterMinimum = Infinity;
    for (let i = group.length - 1; i >= 0; i--) {
      const current = group[i];
      if (issues.has(current)) continue;
      if (current.odometer_km! > laterMinimum) {
        issues.set(
          current,
          "Lectura superior a una lectura posterior; revisar tramo",
        );
      } else {
        laterMinimum = current.odometer_km!;
      }
    }
  }
  return issues;
}
