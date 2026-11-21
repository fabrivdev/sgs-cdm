import { describe, expect, it } from "vitest";
import type { Sale, SalesPeriod } from "./marketShareModel";
import { combineMarketShareSources } from "./marketShareSources";

const a = (dealer: string | null, units: number, marca = "A"): Sale => ({ marca, distribuidor: dealer, unidades: units });
const period = (anio: number, mes: number, detalle: Sale[]): SalesPeriod => ({
  familia: "tractores", anio, mes, detalle, total: detalle.reduce((sum, line) => sum + line.unidades, 0),
});

describe("Market Share sources", () => {
  it("uses detailed historical months and reconciles missing distributors without changing the 2025 market totals", () => {
    const old = period(2024, 1, [a("D1", 5)]);
    const current = period(2025, 1, [a("D1", 2), a(null, 3), a(null, 1, "B")]);
    const cadam = period(2025, 1, [a("D1", 2), a("D2", 3), a("D2", 2, "B")]);
    const recent = period(2026, 1, [a("D1", 19)]);

    expect(combineMarketShareSources([{ ...old, detalle: null, total: 7 }, current, recent], [old, cadam])).toEqual([
      old, period(2025, 1, [a("D1", 2), a("D2", 3), a(null, 1, "B")]), recent,
    ]);
  });

  it("preserves named distributor counts when a conflicting history has the same brand total", () => {
    const current = period(2025, 1, [a("D1", 3), a(null, 2)]);
    const historical = period(2025, 1, [a("D1", 2), a("D2", 3)]);
    expect(combineMarketShareSources([current], [historical])).toEqual([current]);
  });
});
