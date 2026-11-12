import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FLEET_PREVIEW_SNAPSHOT } from "@/features/fleet/previewData";
import FleetWorkspace from "./FleetWorkspace";
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const mocks = vi.hoisted(() => ({
  roles: ["jefatura"],
  load: vi.fn(),
  submit: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test" },
    roles: mocks.roles,
    hasSectionAccess: () => true,
    can: () => true,
  }),
}));
vi.mock("@/features/fleet/invoiceExtraction", () => ({
  extractFleetInvoice: vi.fn(async () => ({
    plate: "AUTO123",
    odometer_km: "41971",
    performed_on: "",
    supplier_tax_id: "80000001-1",
    supplier: "Nombre leído",
    invoice_number: "001-002-0000123",
    invoice_date: "2026-10-02",
    description: "Cambio de cubiertas",
    categories: ["Cubiertas"],
  })),
}));
vi.mock("@/features/fleet/managementApi", () => ({
  loadManagement: mocks.load,
  submitInvoice: mocks.submit,
  fleetRpc: vi
    .fn()
    .mockImplementation(async (name: string) =>
      name === "fleet_search_invoice_plates"
        ? [{ plate: "TEST123" }]
        : [{ ruc: "80000001-1", razon_social: "Taller" }],
    ),
  invoiceUrl: vi.fn(),
}));
const data = {
  ...FLEET_PREVIEW_SNAPSHOT,
  vehicles: FLEET_PREVIEW_SNAPSHOT.vehicles.map((v) => ({
    ...v,
    operational_status: "Operativa",
    lifecycle_status: "Activa",
  })),
  fuel: [],
  history: [],
  invoices: [],
  changes: [],
};
function mount(path = "/servicios/flota") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <FleetWorkspace />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.roles = ["jefatura"];
});
describe("Fleet role journeys", () => {
  it("shows operators only the submission form, without loading fleet data even on an expense URL", () => {
    mocks.roles = ["operativo"];
    mount("/servicios/flota/combustible?vehicle=private");
    expect(
      screen.getByRole("heading", { name: "Cargar factura de mantenimiento" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Nuevo vehículo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Descripción del trabajo"),
    ).toBeInTheDocument();
  });
  it("preserves listing filters on returning and gives vehicle tabs independent views", async () => {
    mocks.load.mockResolvedValue(data);
    mount();
    await screen.findByRole("button", { name: "DEMO-001" });
    fireEvent.change(screen.getAllByRole("searchbox")[0], {
      target: { value: "MAXUS" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "DEMO-002" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "DEMO-001" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Combustible" }), {
      button: 0,
      ctrlKey: false,
    });
    expect((await screen.findAllByRole("searchbox"))[0]).toHaveValue("");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Mantenimiento" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByLabelText("Ver")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Vehículos" }));
    expect((await screen.findAllByRole("searchbox"))[0]).toHaveValue("MAXUS");
  });
  it("fills invoice fields on attachment and keeps manual input", async () => {
    mocks.roles = ["operativo"];
    mount();
    fireEvent.change(screen.getByLabelText("Chapa"), {
      target: { value: "MANUAL123" },
    });
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "factura.pdf", { type: "application/pdf" })],
      },
    });
    await screen.findByText(
      "Revisá los datos completados y los campos que falten.",
    );
    expect(screen.getByLabelText("Chapa")).toHaveValue("MANUAL123");
    expect(screen.getByLabelText("Kilometraje del trabajo")).toHaveValue(
      "41971",
    );
    expect(screen.getByLabelText("Fecha del trabajo")).toHaveValue("");
    expect(screen.getByLabelText("Proveedor")).toHaveValue("Taller");
    expect(screen.getByLabelText("N.º de factura")).toHaveValue(
      "001-002-0000123",
    );
    expect(screen.getByLabelText("Fecha de factura")).toHaveValue("2026-10-02");
    expect(
      screen.getByRole("button", { name: "Quitar Cubiertas" }),
    ).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("keeps a failed reservation editable so an operator can correct the input", async () => {
    mocks.roles = ["operativo"];
    mocks.submit.mockRejectedValue(Error("Factura duplicada"));
    mount();
    for (const [label, value] of [
      ["Chapa", "TES"],
      ["RUC del proveedor", "80000001-1"],
      ["N.º de factura", "001-001-0000001"],
      ["Fecha de factura", "2026-10-01"],
      ["Descripción del trabajo", "Filtro"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText("N.º de factura"), {
      target: { value: "001-001-1" },
    });
    fireEvent.blur(screen.getByLabelText("N.º de factura"));
    expect(screen.getByLabelText("N.º de factura")).toHaveValue(
      "001-001-0000001",
    );
    const plate = screen.getByRole("combobox", { name: "Chapa" });
    await screen.findByRole("option", { name: "TEST123" });
    fireEvent.keyDown(plate, { key: "ArrowDown" });
    fireEvent.keyDown(plate, { key: "Enter" });
    expect(plate).toHaveValue("TEST123");
    fireEvent.focus(screen.getByLabelText("RUC del proveedor"));
    fireEvent.click(await screen.findByRole("option", { name: /Taller/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Clasificación" }), {
      target: { value: "Filtros" },
    });
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "factura.pdf", { type: "application/pdf" })],
      },
    });
    await screen.findByText(
      "Revisá los datos completados y los campos que falten.",
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Cargar factura" }).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(screen.getByLabelText("N.º de factura")).not.toBeDisabled();
  });
  it("restores an interrupted operator upload after reopening, without loading management data", async () => {
    mocks.roles = ["operativo"];
    sessionStorage.setItem(
      "fleet-invoice-draft:test",
      JSON.stringify({
        id: "attempt",
        reserved: true,
        values: {
          plate: "TEST123",
          supplier: "Taller",
          supplier_tax_id: "80000001-1",
          invoice_number: "001-001-0000001",
          invoice_date: "2026-10-01",
          description: "Filtro",
          categories: ["Filtros"],
        },
        file: { name: "factura.pdf", size: 3, type: "application/pdf" },
      }),
    );
    mocks.submit.mockResolvedValue(undefined);
    mount();
    expect(screen.getByLabelText("Chapa")).toHaveValue("TEST123");
    expect(screen.getByLabelText("Chapa")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Descripción del trabajo"), {
      target: { value: "Trabajo corregido" },
    });
    expect(screen.getByLabelText("Archivo de factura")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "factura.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Reintentar carga" }).closest("form")!,
    );
    await screen.findByText(
      "Factura 001-001-0000001 · TEST123: carga completada",
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      "attempt",
      expect.objectContaining({
        plate: "TEST123",
        description: "Trabajo corregido",
      }),
      expect.any(File),
      expect.any(Function),
      true,
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("shows incomplete invoices directly in the maintenance detail table", async () => {
    mocks.load.mockResolvedValue({
      ...data,
      invoices: [
        {
          id: "pending",
          plate: "TEST123",
          invoice_date: "2026-10-01",
          supplier: "Taller",
          invoice_number: "PEND001",
          categories: ["Filtros"],
          description: "Trabajo",
          status: "pending",
          amount: 100,
          currency: "PYG",
        },
      ],
    });
    mount("/servicios/flota/mantenimientos?maintenance%3Aview=Facturas");
    const table = await screen.findByRole("table", { name: "Mantenimiento" });
    expect(within(table).getByText("PEND001")).toBeInTheDocument();
    expect(within(table).getByText("TEST123")).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(
      screen.queryByRole("region", { name: "Resumen" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sucursales" }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("columnheader", { name: /Origen|Estado/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "01/10/2026" }));
    expect(
      await screen.findByText("Descripción del trabajo"),
    ).toBeInTheDocument();
    expect(screen.getByText("Trabajo")).toBeInTheDocument();
  });
});

it("opens a vehicle from an empty cache and keeps consumption independent of search", async () => {
  const v = data.vehicles[0];
  mocks.load.mockResolvedValue({
    ...data,
    fuel: [0, 1, 2].map((n) => ({
      id: "f" + n,
      vehicle_id: v.id,
      plate: v.plate,
      occurred_at: "2026-10-0" + (n + 1) + "T10:00:00",
      liters: 40,
      net_amount: 100,
      currency: "PYG",
      odometer_km: 1000 + n * 400,
      previous_odometer_km: 600 + n * 400,
      previous_liters: 40,
      product: "Diesel",
      station: n === 1 ? "Coincidencia" : "Otra",
      raw_data: {},
    })),
  });
  mount(
    "/servicios/flota?vehicle=" +
      v.id +
      "&vehicle:" +
      v.id +
      ":from=2026-10-01&vehicle:" +
      v.id +
      ":to=2026-10-31",
  );
  await screen.findByRole("heading", { name: v.plate });
  expect(
    within(screen.getByRole("region", { name: "Resumen" })).getByText("10"),
  ).toBeInTheDocument();
  fireEvent.change(screen.getAllByRole("searchbox")[0], {
    target: { value: "Coincidencia" },
  });
  await waitFor(() =>
    expect(
      within(screen.getByRole("table", { name: "Combustible" })).getAllByRole(
        "row",
      ),
    ).toHaveLength(2),
  );
  expect(
    within(screen.getByRole("region", { name: "Resumen" })).getByText("10"),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(2);
});
it("reports invalid date ranges without presenting an unexplained empty result", async () => {
  mocks.load.mockResolvedValue(data);
  mount("/servicios/flota?vehicles%3Afrom=2026-11-30&vehicles%3Ato=2026-11-01");
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "DEMO-001" })).toBeInTheDocument();
});

it("locates vehicle actions immediately after More filters, not in the table or header", async () => {
  mocks.load.mockResolvedValue(data);
  mount();
  const menu = await screen.findByRole("button", {
    name: "Acciones de la sección",
  });
  const filters = screen.getByRole("button", { name: "Más filtros" });
  expect(filters.nextElementSibling).toContainElement(menu);
  expect(
    screen.getAllByRole("button", { name: "Acciones de la sección" }),
  ).toHaveLength(1);
  expect(
    within(screen.getByRole("region", { name: "Vehículos" })).queryByRole(
      "button",
      { name: "Acciones de la sección" },
    ),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/\d+ registros/)).not.toBeInTheDocument();
});
import { quickPeriodPresets } from "@/components/filters/quickPeriodPresets";
it("defaults to this year and changes both dates atomically using the shared shortcut", async () => {
  mocks.load.mockResolvedValue(data);
  const { container } = mount();
  const selector = await screen.findByRole("combobox", {
    name: "Período rápido",
  });
  const presets = quickPeriodPresets(new Date());
  const year = presets.find((p) => p.key === "current-year")!;
  const month = presets.find((p) => p.key === "current-month")!;
  const dates = () =>
    Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="date"]'),
    ).map((x) => x.value);
  expect(selector).toHaveValue("current-year");
  expect(dates()).toEqual([year.from, year.to]);
  fireEvent.change(selector, { target: { value: "current-month" } });
  expect(dates()).toEqual([month.from, month.to]);
  fireEvent.click(screen.getByRole("button", { name: "DEMO-001" }));
  expect(dates()).toEqual([month.from, month.to]);
  fireEvent.click(screen.getByRole("button", { name: "← Vehículos" }));
  expect(dates()).toEqual([month.from, month.to]);
  fireEvent.change(container.querySelector('input[type="date"]')!, {
    target: { value: "2025-02-01" },
  });
  expect(screen.getByRole("combobox", { name: "Período rápido" })).toHaveValue(
    "",
  );
  expect(dates()[0]).toBe("2025-02-01");
});

it("shows linked maintenance from past years and undated originals, with independent dates", async () => {
  const v = data.vehicles[0];
  mocks.load.mockResolvedValue({
    ...data,
    history: [
      {
        id: "h1",
        vehicle_id: v.id,
        plate: v.plate,
        occurred_on: "2024-01-10",
        odometer_km: 10000,
        supplier: "Taller",
        invoice_number: "1",
        works: [
          { work: "MOTOR / Filtro.Comb.", value: "X", comment: "Original" },
        ],
        raw_data: {},
      },
      {
        id: "h2",
        vehicle_id: v.id,
        plate: v.plate,
        occurred_on: null,
        odometer_km: null,
        supplier: "Otro",
        invoice_number: "2",
        works: [{ work: "Aceite", value: 5, comment: null }],
      },
      {
        id: "outside",
        vehicle_id: null,
        plate: "AJENO",
        occurred_on: "2024-01-10",
        works: [],
      },
    ],
  });
  mount("/servicios/flota?vehicle=" + v.id + "&vehicleTab=Mantenimiento");
  await screen.findByRole("button", { name: "Consultar Filtros" });
  expect(
    within(screen.getByRole("table", { name: "Mantenimiento" }))
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.replace(/[↑↓]/g, "").trim()),
  ).toEqual([
    "Fecha",
    "N.º de factura",
    "Proveedor",
    "Kilometraje",
    "Aceites",
    "Filtros",
    "Cubiertas",
    "Repuestos",
    "Otros",
    "Monto",
  ]);
  expect(
    screen.getByRole("button", { name: "Consultar Aceites" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Original")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Clasificación" }), {
    target: { value: "Filtros" },
  });
  expect(screen.queryByText("Otro")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "10/01/2024" }));
  expect(await screen.findByText("Filtro de combustible")).toBeInTheDocument();
  expect(screen.getByText("Original")).toBeInTheDocument();
  expect(screen.queryByText("Registro original")).not.toBeInTheDocument();
  expect(screen.queryByText("X", { selector: "div" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Cerrar$/ }));
  expect(screen.queryByText("AJENO")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("tab", { name: "Lecturas" }),
  ).not.toBeInTheDocument();
  expect(document.querySelector('input[type="date"]')).toHaveValue("");
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Acciones de la sección" }),
    { key: "Enter" },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Kilometraje y responsable" }),
  );
  expect(
    (
      await screen.findAllByRole("heading", {
        name: "Kilometraje y responsable",
      })
    )[0],
  ).toBeInTheDocument();
});
