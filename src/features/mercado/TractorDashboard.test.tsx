import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TractorDashboard } from "./TractorDashboard";
import {
  harvestPriceBand,
  leadingBrands,
  compare,
  type Movement,
} from "./model";
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

describe("Mercado de tractores", () => {
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
      .getByRole("heading", { name: "Participación por modelo" })
      .closest<HTMLElement>(".market-panel")!;
    expect(
      within(ranking).getByText("AXION").closest(".market-rank"),
    ).toHaveClass("market-benchmark");
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
      .getByRole("heading", { name: "Concentración por importador" })
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

describe("Mercado de cosechadoras", () => {
  const harvesters: Movement[] = sample.map((row, i) => [
    row[0],
    row[1],
    row[2],
    row[3],
    i === 0 ? "LEXION 7600" : "S550",
    i === 0 ? "Clase 8" : "Clase 5",
    harvestPriceBand(row[10] / row[9]),
    row[7],
    i === 0 ? "NUEVO" : "USADO",
    row[9],
    row[10],
  ]);

  it("usa los mismos títulos en los gráficos compartidos de las dos familias", () => {
    const titles = () =>
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
    const tractors = render(
      <MemoryRouter initialEntries={["/mercado/tractores"]}>
        <TractorDashboard rows={sample} />
      </MemoryRouter>,
    );
    const tractorTitles = titles();
    tractors.unmount();
    render(
      <MemoryRouter initialEntries={["/mercado/cosechadoras"]}>
        <TractorDashboard rows={harvesters} family="cosechadoras" />
      </MemoryRouter>,
    );
    expect(titles().filter((title) => title !== "Nuevas y usadas")).toEqual(
      tractorTitles,
    );
    expect(tractorTitles).toEqual(
      expect.arrayContaining([
        "Unidades por segmento",
        "Indicadores por segmento",
        "FOB por segmento",
      ]),
    );
  });

  it("abre las clases y conserva la clase al desglosar por marca", () => {
    render(
      <MemoryRouter initialEntries={["/mercado/cosechadoras/clases"]}>
        <TractorDashboard rows={harvesters} family="cosechadoras" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Cosechadoras" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Clases" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Clase 8 ›" }));
    expect(screen.getByRole("heading", { name: "Marcas" })).toBeVisible();
    expect(screen.getByRole("link", { name: "CLAAS ›" })).toBeVisible();
    expect(screen.queryByText("Marca B")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Clases · Clase 8 ×" }),
    ).toBeVisible();
  });
});

it("conserva el tipo de grano al abrir un segmento de Sembradoras", () => {
  const planters: Movement[] = [
    ["A", 2026, 9, "HORSCH", "MAESTRO", "17–18 líneas", "$100.000 a <$200.000", "A", "NUEVO", 2, 250000, 18, "Grano grueso", "Autotransportable"],
    ["B", 2026, 9, "OTRA", "MODELO", "21–24 surcos", "$25.000 a <$50.000", "B", "NUEVO", 1, 30000, 24, "Grano fino", "Lateral"],
  ];
  render(
    <MemoryRouter initialEntries={["/mercado/sembradoras?grano=Grano+grueso"]}>
      <TractorDashboard rows={planters} family="sembradoras" />
    </MemoryRouter>,
  );
  expect(screen.getByRole("columnheader", { name: "Cuota HORSCH" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Segmentos" }));
  fireEvent.click(screen.getByRole("link", { name: "15–18 líneas ›" }));
  expect(screen.getByRole("link", { name: "HORSCH ›" })).toBeVisible();
  expect(screen.queryByText("OTRA")).toBeNull();
});

it("agrupa los mismos números de líneas con independencia del grano", () => {
  const planter = (id: string, year: number, band: string, units: number): Movement =>
    [id, year, 1, "HORSCH", "MAESTRO", band, "$50.000 a <$100.000", "A", "NUEVO", units, 75_000];
  render(
    <MemoryRouter initialEntries={["/mercado/sembradoras"]}>
      <TractorDashboard family="sembradoras" rows={[
        planter("A", 2026, "11–12 líneas", 4),
        planter("B", 2026, "13–14 líneas", 7),
        planter("C", 2025, "Hasta 10 líneas", 9),
        planter("D", 2026, "21–24 surcos", 6),
        planter("E", 2026, "25–29 surcos", 8),
        planter("F", 2026, "Sin segmento informado", 100),
        ["G", 2026, 1, "HORSCH", "MAESTRO", "24–27 líneas", "$50.000 a <$100.000", "A", "NUEVO", 3, 75_000, 24, "Grano grueso", "Lateral"],
      ]} />
    </MemoryRouter>,
  );
  const panel = screen.getByRole("heading", { name: "Unidades por segmento" }).closest<HTMLElement>(".market-panel")!;
  expect(within(panel).getByTitle("2025: 9 · 2026: 11")).toHaveTextContent("Hasta 14 líneas");
  expect(within(panel).getByTitle("2025: 0 · 2026: 8")).toHaveTextContent("25–29 líneas");
  expect(within(panel).getByText("2026 · 100")).toBeVisible();
  expect(within(panel).getByTitle("2025: 0 · 2026: 9")).toHaveTextContent("19–24 líneas");
  expect(screen.getByRole("heading", { name: "Tipo de grano" })).toBeVisible();
  expect(within(panel).queryByText("13–14 líneas")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Líneas de siembra por segmento" })).toBeNull();
  const indicators = screen.getByRole("region", { name: "Comparación por segmento" });
  const until14 = within(indicators).getByRole("row", { name: /Hasta 14 líneas/ });
  expect(within(until14).getByText("11")).toBeVisible();
  expect(within(until14).getByText("$13.636")).toBeVisible();
  expect(within(indicators).queryByText("13–14 líneas")).toBeNull();
  const fob = screen.getByTitle("HORSCH · MAESTRO · FOB $13.636");
  expect(fob.closest(".market-range")).toHaveTextContent("Hasta 14 líneas");
  fireEvent.click(screen.getByRole("link", { name: "Segmentos" }));
  expect(screen.getByRole("link", { name: "Hasta 14 líneas ›" })).toBeVisible();
});

it("ubica una Maestro GV guardada en su banda y muestra su FOB original", () => {
  const rows: Movement[] = [
    ["GV", 2026, 8, "HORSCH", "MAESTRO 40.45 GV", "Sin segmento informado", "$200.000 o más", "A", "NUEVO", 1, 447_301.39, null, "Sin tipo informado", "Sin transporte informado"],
    ["DK", 2026, 4, "HORSCH", "DAKAR 8 CF", "Más de 37 surcos", "$100.000 a <$200.000", "A", "NUEVO", 1, 155_104.13, 60, "Grano fino", "Autotransportable"],
  ];
  render(
    <MemoryRouter initialEntries={["/mercado/sembradoras"]}>
      <TractorDashboard family="sembradoras" rows={rows} />
    </MemoryRouter>,
  );
  const maestro = screen.getByTitle("HORSCH · MAESTRO 40.45 GV F · FOB $447.301");
  expect(maestro.closest(".market-range")).toHaveTextContent("30 líneas o más");
  const dakar = screen.getByTitle("HORSCH · DAKAR 8 CF · FOB $155.104");
  expect(dakar.closest(".market-range")).toHaveTextContent("30 líneas o más");
  expect(screen.getByText("$500.000")).toBeVisible();
});

it("oculta el filtro de estado en un período de sembradoras sin equipos usados", () => {
  const rows: Movement[] = [
    ["new", 2026, 1, "HORSCH", "MAESTRO", "17–18 líneas", "$100.000 a <$200.000", "A", "NUEVO", 2, 200_000, 18, "Grano grueso", "Lateral"],
    ["old", 2025, 1, "HORSCH", "DAKAR", "Más de 37 surcos", "$100.000 a <$200.000", "A", "USADO", 1, 125_000, 60, "Grano fino", "Lateral"],
  ];
  render(
    <MemoryRouter initialEntries={["/mercado/sembradoras?estado=USADO"]}>
      <TractorDashboard family="sembradoras" rows={rows} />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Estado", { exact: true })).toBeNull();
  expect(screen.getByRole("link", { name: /Unidades importadas/ })).toHaveTextContent("2");
  const panel = screen.getByRole("heading", { name: "Tipo de grano" }).closest<HTMLElement>(".market-panel")!;
  expect(within(panel).getByText("Grano grueso")).toBeVisible();
  expect(within(panel).getByText("Grano fino")).toBeVisible();
});

it.each(["tractores", "cosechadoras", "sembradoras", "pulverizadores"] as const)(
  "marca la cuota del año anterior sobre la misma escala en %s",
  (family) => {
    const rows: Movement[] = [
      ["A26", 2026, 1, "MARCA A", "M1", "Sin segmento informado", "", "EMPRESA", "NUEVO", 3, 0],
      ["B26", 2026, 1, "MARCA B", "M2", "Sin segmento informado", "", "EMPRESA", "NUEVO", 7, 0],
      ["A25", 2025, 1, "MARCA A", "M1", "Sin segmento informado", "", "EMPRESA", "NUEVO", 2, 0],
      ["C25", 2025, 1, "MARCA C", "M3", "Sin segmento informado", "", "EMPRESA", "NUEVO", 2, 0],
    ];
    render(
      <MemoryRouter initialEntries={["/mercado/" + family]}>
        <TractorDashboard family={family} rows={rows} />
      </MemoryRouter>,
    );
    const panel = screen.getByRole("heading", { name: "Participación por marca" }).closest<HTMLElement>(".market-panel")!;
    const row = within(panel).getByText("MARCA A").closest<HTMLElement>(".market-rank")!;
    const marker = within(row).getByRole("img", { name: /2025 · 50,0/ });
    expect(marker).toHaveStyle("--market-prior-share: 50%");
    expect(marker.closest(".market-rank")).toHaveTextContent(/MARCA A.*30,0/);
    expect(within(panel).getByRole("img", { name: /2025 · 0,0/ })).toHaveStyle("--market-prior-share: 0%");
  },
);

it("abre la banda de tanque de Pulverizadores con el FOB y la referencia HORSCH", () => {
  const rows: Movement[] = [
    ["h", 2026, 1, "HORSCH", "LEEB 5.280 VL", "Más de 4.500 l", "$300.000 o más", "Campos del Mañana", "NUEVO", 1, 330_000, 5000, "Más de 27 a 36 m", "221–280 HP"],
    ["j", 2026, 1, "JACTO", "UNIPORT 3030", "2.501–3.500 l", "$150.000 a <$200.000", "Jacto", "NUEVO", 1, 185_000, 3000, "Más de 27 a 36 m", "221–280 HP"],
  ];
  render(
    <MemoryRouter initialEntries={["/mercado/pulverizadores"]}>
      <TractorDashboard family="pulverizadores" rows={rows} />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Ancho de barra" })).toBeVisible();
  expect(screen.getByTitle("HORSCH · LEEB 5.280 VL · FOB $330.000")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Tanques" }));
  fireEvent.click(screen.getByRole("link", { name: "Más de 4.500 l ›" }));
  expect(screen.getByRole("link", { name: "HORSCH ›" })).toBeVisible();
});
