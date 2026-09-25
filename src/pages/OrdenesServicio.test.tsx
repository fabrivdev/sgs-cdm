import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrdenesServicio from "./OrdenesServicio";
import { demoOrder, operationsFixture } from "@/test/serviceOrdersFixture";
import { machineBrandClass } from "@/lib/machineBrands";
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
  it.each([320, 768, 1280])("uses the shared brand palette in every list presentation and drawer at %i px", width => {
    mocks.width = width;
    const brands = ["CLAAS", "HORSCH", "OTROS"];
    response.data.data.ordenesServicio = brands.map((marca, index) => demoOrder({ os_numero: `01-0000000${index + 1}`, trabajo_id: null, marca }));
    setup();
    const table = within(screen.getByRole("table", { name: "Órdenes de servicio" }));
    for (const [index, marca] of brands.entries()) {
      for (const text of table.getAllByText(marca, { exact: true })) {
        expect(text.parentElement).toHaveClass(...machineBrandClass(marca).split(" "));
      }
      fireEvent.click(screen.getByRole("button", { name: `Ver OS 01-0000000${index + 1}` }));
      const detail = within(screen.getByRole("dialog"));
      expect(detail.getByText(marca, { exact: true }).parentElement).toHaveClass(...machineBrandClass(marca).split(" "));
      fireEvent.click(detail.getByRole("button", { name: "Cerrar" }));
    }
  });
  it("respects the guide: no permanent explanatory paragraphs in the three views or OS detail", () => {
    mocks.width = 1280; setup();
    for (const name of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(name);
      expect(screen.queryByText(/Cerradas por fecha|Horas de las OS seleccionadas|Por fecha de jornada|Cada agrupación representa|Detalle de la matriz|Solo resultados registrados|Se requieren dos periodos cerrados|Sin desvíos cerrados|El número indica/)).not.toBeInTheDocument();
    }
    tab("Órdenes"); fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000002" }));
    expect(screen.queryByText(/Los importes corresponden|Sin factura identificada no significa/)).not.toBeInTheDocument();
  });
  it.each([320, 390, 639, 640, 768, 1280])("adapts columns without dropping source rows at %i px", width => {
    mocks.width = width; setup();
    const table = screen.getByRole("table", { name: "Órdenes de servicio" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(width < 640 ? 2 : 8);
    expect(screen.queryByText("01/09/2026 — 25/09/2026")).not.toBeInTheDocument();
    expect(screen.queryByText("Estado, tipo y sucursal")).not.toBeInTheDocument();
    expect(within(table).queryByText("TECNICO UNO")).not.toBeInTheDocument();
    expect(within(table).queryByText("TECNICO DOS")).not.toBeInTheDocument();
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
    expect(payload.rows).toHaveLength(1); expect(payload.rows[0].key).toBe("01-00000002");
    expect(payload.columns).toHaveLength(25);
    expect(payload.columns.find((c: { key: string }) => c.key === "tecnicos").value(payload.rows[0])).toBe(1);
    expect(payload.columns.find((c: { key: string }) => c.key === "nombresTecnicos").value(payload.rows[0])).toBe("TECNICO DOS");
    expect(payload.columns.find((c: { key: string }) => c.key === "diasCierre").value(payload.rows[0])).toBeNull();
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
  it("groups the OS detail without losing dates, invoice identity, zero or signed amounts", () => {
    Object.assign(response.data.data.ordenesServicio[0], {
      factura: "000000000001; 000000000002", servicios_valor: 1240.25, repuesto_valor: -18.7,
      fecha_emision_factura: "2026-09-20", km_cantidad: 300, raw_data: { canonical_model: "TRION 740" },
    });
    setup(); fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000001" }));
    const detail = within(screen.getByRole("dialog"));
    for (const name of ["Orden de servicio", "Trabajo y técnicos", "Facturación e importes"]) {
      expect(detail.getByRole("heading", { name })).toBeVisible();
    }
    for (const text of ["10/08/2026", "10/09/2026", "20/09/2026", "41", "TRION 740", "TECNICO UNO", "300", "000000000001; 000000000002", "$ 1.240,25", "$ -18,70", "$ 1.221,55"]) {
      expect(detail.getByText(text, { exact: true })).toBeVisible();
    }
    expect(detail.getAllByText("$ 0,00")).toHaveLength(2);
    expect(detail.queryByText("Situación de facturación")).not.toBeInTheDocument();
  });
  it("keeps five order KPIs, three in other views and one export menu", () => {
    setup();
    for (const name of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(name);
      expect(screen.getAllByRole("region", { name: "Indicadores" })).toHaveLength(1);
      expect(screen.getByRole("region", { name: "Indicadores" }).children).toHaveLength(name === "Órdenes" ? 5 : 3);
      expect(screen.getAllByRole("button", { name: "Acciones de la sección" })).toHaveLength(1);
    }
  });
  it("shows invoice-based closure days and recalculates both indicators with the list filters", async () => {
    response.data.data.ordenesServicio[0].fecha_emision_factura = "2026-09-20";
    setup();
    const kpis = within(screen.getByRole("region", { name: "Indicadores" }));
    expect(kpis.getByText("50%")).toBeVisible();
    expect(kpis.getByText("41", { exact: true })).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "00000002" } });
    await waitFor(() => expect(kpis.getByText("0%")).toBeVisible());
    expect(kpis.getByText("—")).toBeVisible();
    expect(kpis.queryByText("41", { exact: true })).not.toBeInTheDocument();
  });
  it.each([390, 1280])("shows equipment, technician count, hours and distance in the list at %i px", width => {
    mocks.width = width;
    Object.assign(response.data.data.ordenesServicio[0], { km_cantidad: 300, raw_data: { canonical_model: "TRION 740", tecnicos_participantes: ["TECNICO UNO", "TECNICO DOS"] } });
    setup();
    const table = within(screen.getByRole("table", { name: "Órdenes de servicio" }));
    expect(table.getByText(/TRION 740/)).toBeVisible();
    expect(table.queryByText(/TECNICO UNO/)).not.toBeInTheDocument();
    if (width < 640) expect(table.getByText("2 técnicos · 10 h · 300 km")).toBeVisible();
    else {
      expect(table.getByText("2", { exact: true })).toBeVisible();
      expect(table.getByText("300", { exact: true })).toBeVisible();
      expect(table.getByRole("columnheader", { name: /Km recorridos/ })).toBeVisible();
    }
  });
  it("does not display empty goal columns but keeps them in the complete productivity export", async () => {
    mocks.width = 1280;
    response.data.data.metaHorasMensual = 0; response.data.capacityWarning = "Meta de productividad no disponible.";
    setup(); tab("Productividad");
    const table = within(screen.getByRole("table", { name: "Productividad por técnico" }));
    expect(table.getAllByRole("columnheader")).toHaveLength(3);
    expect(table.queryByRole("columnheader", { name: /Meta disponible/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Productividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.fileName).toBe("productividad-tecnicos.xlsx");
    expect(payload.columns).toHaveLength(13);
    expect(payload.columns.find((c: { key: string }) => c.key === "meta").value(payload.rows[0])).toBeNull();
  });
  it("separates absence rows from journeys without collapsing same-day journeys or excluding them from Excel", async () => {
    response.data.data.disponibilidades = [{ id: "ABS1", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "Capacitación", observacion: null, bloquea_agenda: true }];
    response.data.data.jornadas.push({ ...response.data.data.jornadas[0], id: "J4" });
    setup(); tab("Cumplimiento");
    const activity = within(screen.getByRole("table", { name: "Actividad por técnico" }));
    expect(activity.getAllByRole("row")).toHaveLength(5);
    expect(activity.queryByText("Capacitación")).not.toBeInTheDocument();
    const availability = within(screen.getByRole("table", { name: "Disponibilidad de técnicos" }));
    expect(availability.getByText("Capacitación")).toBeVisible();
    expect(availability.getByText("sept. 2026")).toBeVisible();
    expect(availability.queryByText("TR")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Actividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.rows).toHaveLength(5);
    expect(new Set(payload.rows.map((row: { key: string }) => row.key)).size).toBe(5);
    expect(payload.rows.find((row: { estado: string }) => row.estado === "No disponible").trabajo).toBe("Capacitación");
  });
  it("uses the original compliance counts and exposes complete period export", async () => {
    setup(); tab("Cumplimiento");
    const table = screen.getByRole("table", { name: "Cumplimiento por período" });
    expect(table).toHaveTextContent("1 de 3 realizadas");
    expect(table).toHaveTextContent("33%");
    expect(screen.getByText("50%", { exact: true })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Cumplimiento por período" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.fileName).toBe("cumplimiento-periodos.xlsx");
    expect(payload.columns).toHaveLength(7);
    expect(payload.rows[0]).toMatchObject({ programadas: 3, realizadas: 1, noRealizadas: 1, pendientes: 1, porcentaje: 33 });
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
