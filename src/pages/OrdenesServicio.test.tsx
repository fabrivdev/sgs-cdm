import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrdenesServicio from "./OrdenesServicio";
import { operationsFixture } from "@/test/serviceOrdersFixture";
const mocks = vi.hoisted(() => ({ width: 390, query: vi.fn(), can: vi.fn(), set: vi.fn(), clear: vi.fn(), refetch: vi.fn(), export: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: (breakpoint = 768) => mocks.width < breakpoint }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: mocks.can, hasSectionAccess: () => true }) }));
vi.mock("@/contexts/AssistantPageContext", () => ({ useAssistantPageContext: () => ({ setPageFilters: mocks.set, clearPageFilters: mocks.clear }) }));
vi.mock("@/features/service-orders/useServiceOrders", () => ({ useServiceOrders: mocks.query }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable: mocks.export }));
let response: { data: { data: ReturnType<typeof operationsFixture>; capacityWarning: string | null }; isPending: boolean; isFetching: boolean; isError: boolean; refetch: typeof mocks.refetch };
beforeEach(() => {
  vi.clearAllMocks(); mocks.width = 390; mocks.can.mockReturnValue(true);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-25T12:00:00"));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  response = { data: { data: operationsFixture(), capacityWarning: null }, isPending: false, isFetching: false, isError: false, refetch: mocks.refetch };
  mocks.query.mockImplementation(() => response);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = () => render(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
const tab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
describe("orders workspace", () => {
  it("respects the guide: no permanent explanatory paragraphs in the three views or OS detail", () => {
    setup();
    for (const name of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(name);
      expect(screen.queryByText(/Cerradas por fecha|Horas de las OS seleccionadas|Por fecha de jornada|Cada agrupación representa|Detalle de la matriz|Solo resultados registrados|Se requieren dos periodos cerrados|Sin desvíos cerrados/)).not.toBeInTheDocument();
    }
    tab("Órdenes"); fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000002" }));
    expect(screen.queryByText(/Los importes corresponden|Sin factura identificada no significa/)).not.toBeInTheDocument();
  });
  it.each([320, 390, 639, 640, 768, 1280])("adapts columns without dropping source rows at %i px", width => {
    mocks.width = width; setup();
    const table = screen.getByRole("table", { name: "Órdenes de servicio" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(width < 640 ? 2 : 6);
    expect(screen.getByText("01/09/2026 — 25/09/2026")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000002" }));
    const detail = within(screen.getByRole("dialog"));
    expect(detail.getByText("OS 01-00000002")).toBeVisible();
    expect(detail.getAllByText("0").length).toBeGreaterThan(1);
  });
  it("filters OS without changing the financial area and exports complete filtered rows", async () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "00000002" } });
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Órdenes de servicio" })).getAllByRole("row")).toHaveLength(2));
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Órdenes de servicio" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.fileName).toBe("ordenes-de-servicio.xlsx");
    expect(payload.rows).toHaveLength(1); expect(payload.rows[0].key).toBe("O2");
    expect(payload.columns).toHaveLength(21);
  });
  it("shows productivity and drills into the selected technician's orders", () => {
    setup(); tab("Productividad");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /TECNICO DOS.*OS/ }));
    expect(screen.getByRole("tab", { name: "Órdenes" })).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByRole("table", { name: "Órdenes de servicio" })).getAllByRole("row")).toHaveLength(2);
  });
  it("warns when capacity is missing and still shows known hours", () => {
    response.data.data.metaHorasMensual = 0; response.data.capacityWarning = "Meta de productividad no disponible.";
    setup(); tab("Productividad");
    expect(screen.getByRole("alert")).toHaveTextContent("no disponible");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).not.toHaveTextContent("0%");
  });
  it("keeps compliance visible on phones without a wide matrix", () => {
    setup(); tab("Cumplimiento");
    expect(screen.getByRole("table", { name: "Actividad por técnico" })).toBeVisible();
    expect(screen.queryByText("Matriz de técnicos por período")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Seguimiento OS y TR" })).toHaveTextContent("TR-DEMO1");
  });
  it("never exposes stale figures or exports after source errors", () => {
    response.isError = true; setup();
    expect(screen.getByRole("alert")).toHaveTextContent("No se muestran resultados parciales");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it("hides export when capability is missing", () => {
    mocks.can.mockReturnValue(false); setup();
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).not.toBeInTheDocument();
  });
});
