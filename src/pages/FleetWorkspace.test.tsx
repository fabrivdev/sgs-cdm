import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
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
vi.mock("@/features/fleet/managementApi", () => ({
  loadManagement: mocks.load,
  submitInvoice: mocks.submit,
  fleetRpc: vi
    .fn()
    .mockResolvedValue([{ ruc: "80000001-1", razon_social: "Taller" }]),
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
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "Historial" }),
      ).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Facturas" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      screen.getByRole("button", { name: "Cargar factura" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Vehículos" }));
    expect((await screen.findAllByRole("searchbox"))[0]).toHaveValue("MAXUS");
  });
  it("keeps a failed reservation editable so an operator can correct the input", async () => {
    mocks.roles = ["operativo"];
    mocks.submit.mockRejectedValue(Error("Factura duplicada"));
    mount();
    for (const [label, value] of [
      ["Chapa", "TEST123"],
      ["RUC del proveedor", "80000001-1"],
      ["N.º de factura", "001"],
      ["Fecha de factura", "2026-10-01"],
      ["Descripción del trabajo", "Filtro"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.focus(screen.getByLabelText("RUC del proveedor"));
    fireEvent.click(await screen.findByRole("option", { name: /Taller/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clasificación" }));
    fireEvent.click(screen.getByLabelText("Filtros"));
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "factura.pdf", { type: "application/pdf" })],
      },
    });
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
          invoice_number: "001",
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
    expect(screen.getByLabelText("Chapa")).toBeDisabled();
    expect(screen.getByLabelText("Archivo de factura")).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Archivo de factura"), {
      target: {
        files: [new File(["pdf"], "factura.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Reintentar carga" }).closest("form")!,
    );
    await screen.findByText("Factura 001 · TEST123: carga completada");
    expect(mocks.submit).toHaveBeenCalledWith(
      "attempt",
      expect.objectContaining({ plate: "TEST123" }),
      expect.any(File),
      expect.any(Function),
    );
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("shows incomplete invoices to management without adding them to documented totals", async () => {
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
    await screen.findByText("PEND001");
    expect(screen.getAllByText("Incompleta").length).toBeGreaterThan(0);
    expect(screen.getByText("Cargas incompletas: 1")).toBeInTheDocument();
    expect(screen.queryByText(/Importe documentado/)).not.toBeInTheDocument();
  });
});
