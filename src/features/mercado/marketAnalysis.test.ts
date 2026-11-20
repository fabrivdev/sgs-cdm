import { describe, expect, it } from "vitest";
import { positioning, priceBridge, seasonality } from "./marketAnalysis";
import type { Movement } from "./model";

function movement(
  year: number,
  month: number,
  model: string,
  units: number,
  fob: number,
): Movement {
  return [
    String(year) + month + model,
    year,
    month,
    "CLAAS",
    model,
    "121–170 HP",
    "",
    "",
    "NUEVO",
    units,
    fob,
  ];
}

describe("Análisis de mercado de tractores", () => {
  it("concilia la cascada con los promedios de ambos períodos", () => {
    const previous = [
      movement(2025, 1, "A", 2, 200),
      movement(2025, 1, "B", 2, 400),
      movement(2025, 2, "SALE", 1, 500),
    ];
    const current = [
      movement(2026, 1, "A", 3, 360),
      movement(2026, 1, "B", 1, 220),
      movement(2026, 2, "ENTRA", 1, 250),
      movement(2026, 2, "Sin FOB", 1, 0),
    ];
    const bridge = priceBridge(current, previous)!;
    expect(bridge.coverage).toEqual({
      priorUnits: 4,
      recentUnits: 4,
      priorTotal: 5,
      recentTotal: 5,
    });
    expect(bridge.steps.map((step) => step.to - step.from)).toEqual([
      -70, -25, 20, 21,
    ]);
    expect(
      bridge.before +
        bridge.steps.reduce((sum, step) => sum + step.to - step.from, 0),
    ).toBe(bridge.after);
    expect(priceBridge([current[2]], previous)?.steps).toEqual([]);
  });

  it("pondera el FOB por unidad y excluye los modelos sin potencia de la dispersión", () => {
    const unknown = movement(2026, 2, "B", 4, 800);
    unknown[5] = "Sin potencia informada";
    const result = positioning(
      [movement(2026, 1, "A", 1, 50), movement(2026, 2, "A", 3, 750), unknown],
      "NUEVO",
    );
    expect(result.points[0]).toMatchObject({
      model: "CLAAS · A",
      units: 4,
      price: 200,
    });
    expect(result.covered).toBe(4);
    expect(result.priced).toBe(8);
  });

  it("distingue meses fuera de la cobertura de meses sin unidades filtradas", () => {
    const prior = movement(2025, 1, "A", 4, 800);
    const current = movement(2026, 1, "A", 3, 600);
    const coverage = movement(2025, 3, "B", 1, 100);
    const result = seasonality(
      [prior, current, coverage],
      [prior, current],
      2026,
      [1, 2, 3],
    );
    expect(result.grid.map((row) => row.values)).toEqual([
      [3, null, null],
      [4, 0, 0],
    ]);
    expect(result.baseline).toEqual([4, 0, 0]);
  });
});
