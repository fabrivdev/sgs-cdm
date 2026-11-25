import { describe, expect, it } from "vitest";
import { dealerConcentration, distributorHistory, marketContributions, marketHistory, standings, unknownDealer } from "./marketShareAnalytics";
import type { Sale, SalesPeriod } from "./marketShareModel";

function period(anio: number, mes: number, rows: [string, string | null, number][]): SalesPeriod {
  const detalle: Sale[] = rows.map(([marca, distribuidor, unidades]) => ({ marca, distribuidor, unidades }));
  return { familia: "tractores", anio, mes, total: detalle.reduce((sum, row) => sum + row.unidades, 0), detalle };
}

describe("Market Share analytics", () => {
  it("reconciles all named brand drivers to the net change, including departures", () => {
    const previous = [period(2025, 1, [["A", "D1", 6], ["B", "D2", 20], ["C", "D2", 10]])];
    const current = [period(2026, 1, [["A", "D1", 30], ["B", "D2", 21], ["D", "D3", 8], ["E", "D4", 9], ["F", "D5", 3]])];
    const brands = standings(current, previous, "marca", ["G"]);
    const drivers = marketContributions(brands, "B");
    expect(drivers.map(({ name, delta }) => ({ name, delta }))).toEqual([
      { name: "A", delta: 24 }, { name: "C", delta: -10 }, { name: "E", delta: 9 },
      { name: "D", delta: 8 }, { name: "F", delta: 3 }, { name: "B", delta: 1 },
    ]);
    expect(drivers.find(({ name }) => name === "A")).toEqual({ name: "A", delta: 24, priorUnits: 6, units: 30, share: 30 / 71 });
    expect(drivers.find(({ name }) => name === "C")).toEqual({ name: "C", delta: -10, priorUnits: 10, units: 0, share: 0 });
    expect(drivers.reduce((sum, row) => sum + row.delta, 0)).toBe(71 - 36);
    expect(brands.find(({ name }) => name === "B")?.points).toBeLessThan(0);
    expect(brands.find(({ name }) => name === "G")?.share).toBe(0);
  });

  it("preserves the market denominator in detail and handles incomplete dealer attribution", () => {
    const previous = [period(2025, 1, [["A", null, 40], ["B", "D1", 30]])];
    const current = [period(2026, 1, [["A", "D1", 35], ["A", "D2", 35], ["B", null, 30]])];
    const dealers = standings(current, previous, "distribuidor");
    expect(dealers.map(({ name, rank, priorUnits }) => [name, rank, priorUnits]))
      .toEqual([["D1", 1, 30], ["D2", 2, null], [unknownDealer, null, 40]]);
    expect(dealers[0]).toMatchObject({ delta: 5, partialComparison: true, priorRank: null });
    expect(dealers.slice(1).every((row) => row.delta === null && row.priorRank === null)).toBe(true);
    const details = standings(current, previous, "distribuidor", [], { by: "marca", name: "A" });
    expect(details.map(({ share, priorShare }) => [share, priorShare])).toEqual([[.35, null], [.35, null], [0, 40 / 70]]);
    expect(standings(current, previous, "marca", [], { by: "distribuidor", name: "D1" }))
      .toContainEqual(expect.objectContaining({ name: "B", priorUnits: 30, delta: null }));
    const concentration = dealerConcentration(dealers, 100);
    expect(concentration.rows[1]).toMatchObject({ name: "D2", cumulative: 70 });
    expect(concentration.rows.at(-1)).toMatchObject({ name: "Sin identificar", cumulative: 100 });
  });

  it.each(["marca", "distribuidor"] as const)("assigns consecutive positions for %s and keeps ties stable across years", (by) => {
    const rows: [string, string, number][] = [["C", "D3", 2], ["B", "D2", 5], ["A", "D1", 5]];
    const current = [period(2026, 1, rows)];
    const previous = [period(2025, 1, [...rows].reverse())];
    const ranked = standings(current, previous, by);
    expect(ranked.map(({ name }) => name)).toEqual(by === "marca" ? ["A", "B", "C"] : ["D1", "D2", "D3"]);
    expect(ranked.map(({ rank, priorRank }) => [rank, priorRank])).toEqual([[1, 1], [2, 2], [3, 3]]);

    const differentPrevious = [period(2025, 1, [["B", "D2", 6], ["A", "D1", 4]])];
    expect(standings(current, differentPrevious, by).map(({ rank, priorRank }) => [rank, priorRank]))
      .toEqual([[1, 2], [2, 1], [3, null]]);
  });

  it("keeps all source years in history without assigning aggregate sales or treating missing detail as zero", () => {
    const data = [
      period(2026, 1, [["A", "D1", 15], ["B", "D2", 5]]),
      period(2025, 1, [["A", "D1", 10], ["A", null, 4]]),
      { ...period(2024, 1, []), total: 19, detalle: null },
      period(2023, 2, [["A", "D1", 16]]),
    ];
    const history = distributorHistory(data, [2026, 2025, 2024, 2023], 1);
    expect(history.periods.map(({ year, units }) => [year, units])).toEqual([[2023, null], [2024, 19], [2025, 14], [2026, 20]]);
    expect(history.rows).toEqual([
      { name: "D1", values: [null, null, 10, 15], total: 25 },
      { name: "D2", values: [null, null, null, 5], total: 5 },
      { name: unknownDealer, values: [null, null, 4, 0], total: 4 },
    ]);
    expect(history.aggregateOnly).toEqual([null, 19, null, null]);
  });

  it("treats a reported zero as data and does not draw an accumulated point beyond a missing month", () => {
    const history = marketHistory([period(2026, 1, []), period(2026, 3, [["A", "D1", 4]])], [2026], 3);
    expect(history).toEqual([{ month: "Ene", 2026: 0 }, { month: "Feb", 2026: null }, { month: "Mar", 2026: null }]);
  });
});
