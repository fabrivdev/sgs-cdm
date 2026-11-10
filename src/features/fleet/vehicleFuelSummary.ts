import { estimatedConsumption, type FuelEntry } from "./managementModel";
import { fuelMoney, fmt, within, type FleetFilters } from "./workspaceModel";
import { todayInParaguay } from "./period";

export function usesMonthlyFuel(f: Pick<FleetFilters, "from" | "to">) {
  return !f.from || !f.to || f.from.slice(0, 7) !== f.to.slice(0, 7);
}

/** Search never changes the mileage chain or the monthly comparison. */
export function fuelMonthRows(
  rows: FuelEntry[],
  f: Pick<FleetFilters, "from" | "to">,
  today = todayInParaguay(),
) {
  const months = [
    ...new Set(
      rows
        .filter((r) => within(r.occurred_at, f))
        .map((r) => r.occurred_at.slice(0, 7)),
    ),
  ].sort();
  return months.map((month) => {
    const start = month + "-01";
    const end = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    const from = f.from > start ? f.from : start;
    const to = f.to && f.to < end ? f.to : end;
    const items = rows.filter((r) => within(r.occurred_at, { from, to }));
    const result = estimatedConsumption(rows, from, to);
    const priorEnd = new Date(Date.parse(start) - 86400000)
      .toISOString()
      .slice(0, 10);
    const priorStart = priorEnd.slice(0, 7) + "-01";
    const previous = estimatedConsumption(rows, priorStart, priorEnd);
    const comparable =
      from === start &&
      to === end &&
      end < today &&
      result.l100 != null &&
      previous.l100 != null &&
      previous.l100 > 0;
    const change = comparable
      ? (result.l100! / previous.l100! - 1) * 100
      : null;
    return {
      id: month,
      date: start,
      from,
      to,
      loads: items.length,
      liters: items.reduce((n, r) => n + r.liters, 0),
      expense: fuelMoney(items),
      km: result.km || null,
      consumption: result.l100,
      trend: change == null ? "—" : `${change > 0 ? "+" : ""}${fmt(change)} %`,
    };
  });
}
