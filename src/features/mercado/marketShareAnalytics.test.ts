import { describe, expect, it } from "vitest";
import { dealerConcentration, marketContributions, marketHistory, standings, unknownDealer } from "./marketShareAnalytics";
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
    expect(drivers.find(({ name }) => name === "C")).toEqual({ name: "C", delta: -10, priorUnits: 10, units: 0 });
    expect(drivers.reduce((sum, row) => sum + row.delta, 0)).toBe(71 - 36);
    expect(brands.find(({ name }) => name === "B")?.points).toBeLessThan(0);
    expect(brands.find(({ name }) => name === "G")?.share).toBe(0);
  });

  it("preserves the market denominator in detail and handles incomplete dealer attribution", () => {
    const previous = [period(2025, 1, [["A", null, 40], ["B", "D1", 30]])];
    const current = [period(2026, 1, [["A", "D1", 35], ["A", "D2", 35], ["B", null, 30]])];
    const dealers = standings(current, previous, "distribuidor");
    expect(dealers.map(({ name, rank, priorUnits }) => [name, rank, priorUnits]))
      .toEqual([["D1", 1, 30], ["D2", 1, null], [unknownDealer, null, 40]]);
    expect(dealers.every((row) => row.delta === null && row.priorRank === null)).toBe(true);
    const details = standings(current, previous, "distribuidor", [], { by: "marca", name: "A" });
    expect(details.map(({ share, priorShare }) => [share, priorShare])).toEqual([[.35, null], [.35, null], [0, 40 / 70]]);
    expect(standings(current, previous, "marca", [], { by: "distribuidor", name: "D1" }))
      .toContainEqual(expect.objectContaining({ name: "B", priorUnits: 30, delta: null }));
    const concentration = dealerConcentration(dealers, 100);
    expect(concentration.topThree).toBe(.7);
    expect(concentration.priorTopThree).toBeNull();
    expect(concentration.rows.at(-1)).toMatchObject({ name: "Sin identificar", cumulative: 100 });
  });

  it("treats a reported zero as data and does not draw an accumulated point beyond a missing month", () => {
    const history = marketHistory([period(2026, 1, []), period(2026, 3, [["A", "D1", 4]])], [2026], 3);
    expect(history).toEqual([{ month: "Ene", 2026: 0 }, { month: "Feb", 2026: null }, { month: "Mar", 2026: null }]);
  });
});
