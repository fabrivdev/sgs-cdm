import { describe, expect, it } from "vitest";
import { cumulativeUnits, positioning, seasonality } from "./marketAnalysis";
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
  it("compara acumulados y cuartiles desde enero bajo el mismo filtro", () => {
    const scoped = [
      movement(2023, 1, "A", 10, 100),
      movement(2023, 3, "A", 30, 300),
      movement(2024, 1, "A", 20, 200),
      movement(2024, 2, "A", 30, 300),
      movement(2025, 1, "A", 30, 300),
      movement(2025, 2, "A", 50, 500),
      movement(2026, 1, "A", 40, 400),
      movement(2026, 2, "A", 60, 0),
    ];
    const rows = [
      ...scoped,
      movement(2022, 2, "A", 300, 0),
      movement(2026, 3, "B", 1, 100),
    ];
    expect(cumulativeUnits(rows, scoped, 2026, 4)).toEqual([
      { month: 1, current: 40, previous: 30, median: 20, range: [15, 25] },
      { month: 2, current: 100, previous: 80, median: 50, range: [30, 65] },
      { month: 3, current: 100, previous: null, median: 40, range: null },
      { month: 4, current: null, previous: null, median: null, range: null },
    ]);
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

it("trata un hueco del histórico de sembradoras como un mes sin cobertura", () => {
  const rows = [
    movement(2025, 1, "A", 4, 800),
    movement(2025, 3, "A", 6, 800),
    movement(2026, 1, "A", 3, 600),
    movement(2026, 2, "B", 4, 800),
    movement(2026, 3, "A", 5, 800),
  ];
  const filtered = rows.filter((row) => row[4] === "A");
  const { grid } = seasonality(rows, filtered, 2026, [1, 2, 3], true);
  expect(grid.map((row) => row.values)).toEqual([[3, 0, 5], [4, null, 6]]);
  expect(cumulativeUnits(rows, filtered, 2026, 3, true).map((month) => month.previous))
    .toEqual([4, null, null]);
});
