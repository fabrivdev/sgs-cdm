import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TractorDashboard } from "./TractorDashboard";
import { leadingBrands, compare, type Movement } from "./model";

const sample: Movement[] = [
  [
    "A",
    2026,
    10,
    "CLAAS",
    "AXION",
    "Más de 230 HP",
    "USD 150.000 o más",
    "Importador A",
    "NUEVO",
    2,
    400000,
  ],
  [
    "B",
    2026,
    9,
    "Marca B",
    "Modelo 2",
    "Hasta 80 HP",
    "Menos de USD 25.000",
    "Importador B",
    "NUEVO",
    1,
    10000,
  ],
  [
    "C",
    2025,
    10,
    "Marca B",
    "Modelo 2",
    "Hasta 80 HP",
    "Menos de USD 25.000",
    "Importador B",
    "NUEVO",
    3,
    30000,
  ],
];
describe("Mercado de tractores", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("conserva el tramo de precio al abrir marca, modelo e importador", () => {
    render(
      <MemoryRouter initialEntries={["/mercado/tractores/precios"]}>
        <TractorDashboard rows={sample} />
      </MemoryRouter>,
    );
    for (const title of ["USD 150.000 o más ›", "CLAAS ›", "CLAAS · AXION ›"]) {
      fireEvent.click(
        within(screen.getByRole("table")).getByRole("link", { name: title }),
      );
    }
    const table = screen.getByRole("table");
    expect(within(table).getByText("Importador A")).toBeTruthy();
    expect(within(table).queryByText("Importador B")).toBeNull();
    expect(screen.queryByRole("link", { name: "Movimientos" })).toBeNull();
  });
  it("incluye CLAAS una vez fuera del top seis", () => {
    const input: Movement[] = Array.from({ length: 7 }, (_, i) => [
      String(i),
      2026,
      1,
      String(i),
      "X",
      "HP",
      "Precio",
      "Empresa",
      "NUEVO",
      5,
      100,
    ]);
    const ranking = leadingBrands(
      compare([...input, sample[0]], [], (r) => r[3]),
    );
    expect(ranking).toHaveLength(7);
    expect(ranking.at(-1)?.name).toBe("CLAAS");
  });
});
