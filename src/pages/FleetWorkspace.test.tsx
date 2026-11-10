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
  fleetRpc: vi.fn(),
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
    expect(screen.getAllByRole("searchbox")[0]).toHaveValue("");
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
    expect(screen.getAllByRole("searchbox")[0]).toHaveValue("MAXUS");
  });
  it("keeps a failed reservation editable so an operator can correct the input", async () => {
    mocks.roles = ["operativo"];
    mocks.submit.mockRejectedValue(Error("Factura duplicada"));
    mount();
    for (const [label, value] of [
      ["Chapa", "TEST123"],
      ["Proveedor", "Taller"],
      ["N.º de factura", "001"],
      ["Fecha de factura", "2026-10-01"],
      ["Descripción del trabajo", "Filtro"],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
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
});
