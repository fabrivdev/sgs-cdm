import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TractorDashboard } from "./TractorDashboard";
import { leadingBrands, compare, type Movement } from "./model";
import { completePower } from "./power";

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
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("conserva el tramo de precio al abrir marca, modelo e importador", () => {
    render(
      <MemoryRouter initialEntries={["/mercado/tractores/precios"]}>
        <TractorDashboard rows={sample} />
      </MemoryRouter>,
    );
    for (const title of ["$150.000 o más ›", "CLAAS ›", "CLAAS · AXION ›"]) {
      fireEvent.click(
        within(screen.getByRole("table")).getByRole("link", { name: title }),
      );
    }
    const table = screen.getByRole("table");
    expect(within(table).getByText("Importador A")).toBeTruthy();
    expect(within(table).queryByText("Importador B")).toBeNull();
    expect(screen.queryByRole("link", { name: "Movimientos" })).toBeNull();
  });
  it("muestra el ranking de modelos cuando el tablero está filtrado por marca", () => {
    render(
      <MemoryRouter initialEntries={["/mercado/tractores?marcas=CLAAS"]}>
        <TractorDashboard rows={sample} />
      </MemoryRouter>,
    );
    const ranking = screen
      .getByRole("heading", { name: "Modelos principales" })
      .closest<HTMLElement>(".market-panel")!;
    expect(
      within(ranking).getByText("AXION").closest(".market-rank"),
    ).toHaveClass("market-claas");
  });
  it("oculta unidades sin FOB de la distribución y conserva el total de mercado", () => {
    const noFob: Movement = [...sample[0]];
    noFob[0] = "Sin FOB";
    noFob[6] = "Sin FOB positivo";
    noFob[10] = 0;
    render(
      <MemoryRouter initialEntries={["/mercado/tractores"]}>
        <TractorDashboard rows={[...sample, noFob]} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Sin FOB positivo")).toBeNull();
    expect(
      within(
        screen.getByRole("link", { name: /Unidades importadas/ }),
      ).getByText("5"),
    ).toBeTruthy();
    const october = screen.getByRole("img", {
      name: "Oct · 2025: 3 · 2026: 4",
    });
    expect(
      october.querySelector(".market-year-current strong"),
    ).toHaveTextContent("4");
    const importers = screen
      .getByRole("heading", { name: "Quiénes concentran las importaciones" })
      .closest<HTMLElement>(".market-panel")!;
    expect(within(importers).getByText("0")).toBeVisible();
    expect(within(importers).queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Precios" }));
    expect(
      within(screen.getByRole("table")).queryByText("Sin FOB positivo"),
    ).toBeNull();
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
  it("completa la potencia faltante sin reemplazar valores informados", () => {
    const missing: Movement = [...sample[0]];
    missing[4] = "AXION 870";
    missing[5] = "Sin potencia informada";
    const reported: Movement = [...missing];
    reported[5] = "171–230 HP";
    expect(completePower([missing, reported]).map((row) => row[5])).toEqual([
      "Más de 230 HP",
      "171–230 HP",
    ]);
  });
});
