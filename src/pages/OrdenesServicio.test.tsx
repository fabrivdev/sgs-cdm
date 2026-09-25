import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrdenesServicio from "./OrdenesServicio";
import { demoOrder, demoBilling, operationsFixture } from "@/test/serviceOrdersFixture";
import { machineBrandClass } from "@/lib/machineBrands";
import { demoWorkEntry, demoWorkLog } from "@/test/workLogFixture";
import type { OrderWorkLog } from "@/features/service-orders/workLog";
const mocks = vi.hoisted(() => ({ width: 390, query: vi.fn(), billing: vi.fn(), work: vi.fn(), workRetry: vi.fn(), billingRetry: vi.fn(), can: vi.fn(), set: vi.fn(), clear: vi.fn(), refetch: vi.fn(), export: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: (breakpoint = 768) => mocks.width < breakpoint }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: mocks.can, hasSectionAccess: () => true }) }));
vi.mock("@/contexts/AssistantPageContext", () => ({ useAssistantPageContext: () => ({ setPageFilters: mocks.set, clearPageFilters: mocks.clear }) }));
vi.mock("@/features/service-orders/useServiceOrders", () => ({ useServiceOrders: mocks.query }));
vi.mock("@/features/service-orders/useOrdersBilling", () => ({ useOrdersBilling: mocks.billing }));
vi.mock("@/features/service-orders/useWorkLog", () => ({ useWorkLog: mocks.work }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable: mocks.export }));
let response: { data: { data: ReturnType<typeof operationsFixture>; capacityWarning: string | null }; isPending: boolean; isFetching: boolean; isError: boolean; refetch: typeof mocks.refetch };
let billingState: { isPending: boolean; isFetching: boolean; isError: boolean; error: unknown };
let workLogs: OrderWorkLog[];
let workState: { isPending: boolean; isFetching: boolean; isError: boolean };
beforeEach(() => {
  vi.clearAllMocks(); mocks.width = 390; mocks.can.mockReturnValue(true);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-25T12:00:00"));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  response = { data: { data: operationsFixture(), capacityWarning: null }, isPending: false, isFetching: false, isError: false, refetch: mocks.refetch };
  mocks.query.mockImplementation(() => response);
  billingState = { isPending: false, isFetching: false, isError: false, error: null };
  mocks.billing.mockImplementation(() => ({ ...billingState, data: response.data.data.billing, refetch: mocks.billingRetry }));
  workLogs = [demoWorkLog(), demoWorkLog([demoWorkEntry({ id: "TWO", tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2", hora_fin: "09:00" })], "01-00000002")];
  workState = { isPending: false, isFetching: false, isError: false };
  mocks.work.mockImplementation((_from, _to, _enabled, os) => ({ ...workState, data: os ? workLogs.filter(row => row.os === os) : workLogs, refetch: mocks.workRetry }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = () => render(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
const tab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
const technicianStatus = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "Estado de técnicos" })).getByRole("button", { name }));
describe("orders workspace", () => {
  it("uses work dates for productivity while keeping the order list and efficiency on their original cohort", () => {
    workLogs = [demoWorkLog([demoWorkEntry({ fecha_inicio: "2026-08-15", fecha_fin: "2026-08-15" }),
      demoWorkEntry({ id: "SEPT", hora_fin: "11:00" })], "01-00000099")];
    workLogs[0].order_data.fecha_cierre_os = "2026-10-01";
    setup(); tab("Productividad");
    expect(screen.getByText("Horas-persona", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("3");
    expect(screen.getByText("Productividad", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("3%");
    fireEvent.click(screen.getByRole("button", { name: /TECNICO UNO.*OS/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("01-00000099");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("15/08/2026");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    tab("Órdenes");
    expect(screen.queryByRole("button", { name: "Ver OS 01-00000099" })).not.toBeInTheDocument();
  });
  it.each([320, 768, 1280])("shows the complete dated OS work history, not just the current month, at %i px", width => {
    mocks.width = width;
    workLogs[0].entries.push(demoWorkEntry({ id: "AUGUST", fecha_inicio: "2026-08-15", fecha_fin: "2026-08-15", hora_fin: "12:00" }));
    setup();
    expect(mocks.work.mock.calls.every(call => call[2] === false)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000001" }));
    const table = within(screen.getByRole("dialog")).getByRole("table", { name: "Jornadas trabajadas" });
    expect(table).toHaveTextContent("15/08/2026"); expect(table).toHaveTextContent("10/09/2026");
    expect(table).toHaveTextContent("08:00"); expect(table).toHaveTextContent("12:00");
    expect(mocks.work).toHaveBeenLastCalledWith("2026-09-01", "2026-09-25", true, "01-00000001");
  });
  it("keeps operational views usable while work is loading or fails and never substitutes closure hours", () => {
    workState.isPending = true; const rendered = setup();
    expect(screen.getByRole("table", { name: "Órdenes de servicio" })).toBeVisible();
    tab("Productividad");
    expect(screen.getByText("Cargando jornadas trabajadas…")).toBeVisible();
    expect(screen.getByText("Horas-persona", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("—");
    workState.isPending = false; workState.isError = true;
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(screen.queryByRole("table", { name: "Productividad por técnico" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(mocks.workRetry).toHaveBeenCalled();
    tab("Cumplimiento"); expect(screen.getByRole("table", { name: "Actividad por técnico" })).toBeVisible();
  });
  it("leaves productivity unknown and exposes unassignable records instead of inventing work dates", () => {
    workLogs[0].entries[0].fecha_inicio = null;
    setup(); tab("Productividad");
    expect(screen.getByRole("alert")).toHaveTextContent("1 registros pendientes");
    expect(screen.getByText("Productividad", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("—");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver registros" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("01-00000001");
  });
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
    expect(payload.columns).toHaveLength(34);
    expect(payload.columns.find((c: { key: string }) => c.key === "tecnicos").value(payload.rows[0])).toBe(1);
    expect(payload.columns.find((c: { key: string }) => c.key === "nombresTecnicos").value(payload.rows[0])).toBe("TECNICO DOS");
    expect(payload.columns.find((c: { key: string }) => c.key === "diasCierre").value(payload.rows[0])).toBeNull();
  });
  it("drills into dated work, not the technician's closure cohort", () => {
    setup(); tab("Productividad");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /TECNICO DOS.*OS/ }));
    expect(within(screen.getByRole("dialog")).getByRole("table", { name: "Jornadas trabajadas" })).toHaveTextContent("01-00000002");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("tab", { name: "Productividad" })).toHaveAttribute("aria-selected", "true");
  });
  it("warns when capacity is missing and still shows known hours", () => {
    response.data.data.metaHorasMensual = 0; response.data.capacityWarning = "Meta de productividad no disponible.";
    setup(); tab("Productividad");
    expect(screen.getByRole("alert")).toHaveTextContent("no disponible");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).not.toHaveTextContent("0%");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
  it.each([320, 768, 1280])("shows exact goal progress, including above 100 percent, at %i px", width => {
    mocks.width = width;
    response.data.data.ordenesServicio[0].servicios_cantidad = 150;
    workLogs[0].entries = Array.from({ length: 15 }, (_, i) => demoWorkEntry({ id: String(i), fecha_inicio: `2026-09-${String(i + 1).padStart(2, "0")}`, fecha_fin: `2026-09-${String(i + 1).padStart(2, "0")}` }));
    setup(); tab("Productividad");
    const meter = screen.getByRole("meter", { name: "Meta de TECNICO UNO" });
    expect(meter).toHaveAttribute("aria-valuenow", "150"); // 120 × 25/30 = 100 h target
    expect(meter).toHaveAttribute("aria-valuetext", "150 de 100 horas; 150% de meta");
    expect(meter.firstElementChild).toHaveStyle({ width: "100%" });
    expect(screen.getByRole("meter", { name: "Meta de TECNICO DOS" })).toHaveAttribute("aria-valuenow", "1.6666666666666667");
  });
  it.each([320, 768, 1280])("uses a single compact technician header, not another navigation row, at %i px", width => {
    mocks.width = width;
    setup(); tab("Productividad");
    const group = screen.getByRole("group", { name: "Estado de técnicos" });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(group.parentElement?.nextElementSibling).toContainElement(screen.getByRole("table", { name: "Productividad por técnico" }));
    expect(screen.queryByRole("heading", { name: "Por técnico" }) !== null).toBe(width >= 640);
    technicianStatus("Activos");
    expect(within(group).getByRole("button", { name: "Activos" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
  });
  it("filters active/inactive/unmatched technicians consistently in KPIs, periods and exports", async () => {
    mocks.width = 390;
    response.data.data.ordenesServicio[0].raw_data = { tecnicos_participantes: ["TECNICO UNO", "TECNICO DOS"] };
    response.data.data.ordenesServicio.push(demoOrder({ os_numero: "01-00000003", responsable: "TECNICO SIN FICHA", servicios_cantidad: 7 }));
    workLogs[1].entries[0].hora_fin = "18:00";
    workLogs.push(demoWorkLog([demoWorkEntry({ id: "UNKNOWN", tecnico_profile_id: null, tecnico_nombre: "TECNICO SIN FICHA", hora_fin: "15:00" })], "01-00000003"));
    setup(); tab("Productividad"); technicianStatus("Activos");
    let table = within(screen.getByRole("table", { name: "Productividad por técnico" }));
    expect(table.getAllByRole("row")).toHaveLength(2);
    expect(table.getByText("TECNICO UNO")).toBeVisible();
    let kpis = within(screen.getByRole("region", { name: "Indicadores" }));
    expect(kpis.getByText("10", { exact: true })).toBeVisible();
    expect(kpis.getByText("100", { exact: true })).toBeVisible();
    expect(kpis.getByText("10%", { exact: true })).toBeVisible();
    expect(screen.getByRole("table", { name: "Horas por período" })).toHaveTextContent("10");
    technicianStatus("Inactivos");
    table = within(screen.getByRole("table", { name: "Productividad por técnico" }));
    expect(table.getAllByRole("row")).toHaveLength(2);
    expect(table.queryByText("TECNICO SIN FICHA")).not.toBeInTheDocument();
    kpis = within(screen.getByRole("region", { name: "Indicadores" }));
    expect(kpis.getByText("60", { exact: true })).toBeVisible(); // before Sep 16 deactivation
    expect(kpis.getByText("16,7%", { exact: true })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Productividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    expect(mocks.export.mock.calls[0][0].rows.map((r: { tecnico: string }) => r.tecnico)).toEqual(["TECNICO DOS"]);
    technicianStatus("Sin ficha");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).toHaveTextContent("TECNICO SIN FICHA");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Indicadores" })).getByText("7", { exact: true })).toBeVisible();
    tab("Órdenes");
    expect(within(screen.getByRole("table", { name: "Órdenes de servicio" })).getAllByRole("row")).toHaveLength(4);
  });
  it("preserves OS identity but never presents operational money as billing when unavailable", () => {
    Object.assign(response.data.data.ordenesServicio[0], {
      factura: "000000000001; 000000000002", servicios_valor: 1240.25, repuesto_valor: -18.7,
      fecha_emision_factura: "2026-09-20", km_cantidad: 300, raw_data: { canonical_model: "TRION 740" },
    });
    setup(); fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000001" }));
    const detail = within(screen.getByRole("dialog"));
    for (const name of ["Orden de servicio", "Trabajo y técnicos", "Facturación e importes"]) {
      expect(detail.getByRole("heading", { name })).toBeVisible();
    }
    for (const text of ["10/08/2026", "10/09/2026", "20/09/2026", "41", "TRION 740", "TECNICO UNO", "300", "000000000001; 000000000002"]) {
      expect(detail.getAllByText(text, { exact: true })[0]).toBeVisible();
    }
    expect(detail.queryByText("$ 0,00")).not.toBeInTheDocument();
    expect(detail.queryByText("Situación de facturación")).not.toBeInTheDocument();
    expect(detail.queryByText("$ 1.240,25")).not.toBeInTheDocument();
    expect(detail.getByText("Facturación no disponible.")).toBeVisible();
  });
  it("keeps five order KPIs, four in productivity, three in compliance and one export menu", () => {
    setup();
    for (const name of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(name);
      expect(screen.getAllByRole("region", { name: "Indicadores" })).toHaveLength(1);
      expect(screen.getByRole("region", { name: "Indicadores" }).children).toHaveLength(name === "Órdenes" ? 5 : name === "Productividad" ? 4 : 3);
      expect(screen.getAllByRole("button", { name: "Acciones de la sección" })).toHaveLength(1);
    }
  });
  it.each([320, 768, 1280])("shows reconciled Sales money and efficiency based on OS hours at %i px", width => {
    mocks.width = width;
    Object.assign(response.data.data.ordenesServicio[0], { servicios_valor: 1.66, servicios_cantidad: 35,
      raw_data: { canonical_auxiliary_technicians: ["TECNICO DOS"] } });
    response.data.data.billing = { "01-00000001": demoBilling({ labor: 1000, total: 1161.3, parts: -18.7, billedHours: 20, date: "2026-09-22" }) };
    setup(); fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000001" }));
    const detail = within(screen.getByRole("dialog"));
    expect(detail.queryByText("$ 1,66")).not.toBeInTheDocument();
    expect(detail.getByText("22/09/2026")).toBeVisible();
    expect(detail.getByText("43", { exact: true })).toBeVisible();
    for (const text of ["$ 1.000,00", "$ -18,70", "$ 180,00", "$ 0,00", "$ 1.161,30", "57,14%", "Horas facturadas", "Total facturado"]) expect(detail.getByText(text)).toBeVisible();
    fireEvent.click(detail.getByRole("button", { name: "Cerrar" }));
    tab("Productividad");
    const card = screen.getByText("Eficiencia").closest(".kpi-item")!;
    expect(card).toHaveTextContent("57,1%");
    expect(card).not.toHaveTextContent(/\d+ OS/);
    expect(screen.getByText("Productividad", { selector: ".kpi-item span", exact: true })).toBeVisible();
    expect(screen.queryByText("% de meta", { selector: ".kpi-item span" })).not.toBeInTheDocument();
    expect(screen.getByText("Meta disponible", { selector: ".kpi-item span" })).toBeVisible();
  });
  it("exports financial values separately from reported OS amounts and preserves unknowns", async () => {
    response.data.data.ordenesServicio[0].servicios_valor = 1.66;
    response.data.data.billing = { "01-00000001": demoBilling({ labor: 1000, total: 1161.3, parts: -18.7, billedHours: 5 }) };
    setup();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Órdenes de servicio" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    const row = payload.rows.find((r: { os: string }) => r.os === "01-00000001");
    const value = (key: string, selected = row) => payload.columns.find((c: { key: string }) => c.key === key).value(selected);
    expect(value("servicios")).toBe(1.66);
    expect(value("moFacturada")).toBe(1000); expect(value("repuestosFacturados")).toBe(-18.7);
    expect(value("tercerosFacturados")).toBe(0); expect(value("totalFacturado")).toBe(1161.3);
    expect(value("horasFacturadas")).toBe(5); expect(value("eficiencia")).toBe(0.5);
    expect(value("documentos")).toBe("000000000001");
    expect(value("totalFacturado", payload.rows.find((r: { os: string }) => r.os === "01-00000002"))).toBeNull();
  });
  it("recalculates efficiency with technician status and search without duplicating an OS", async () => {
    Object.assign(response.data.data.ordenesServicio[0], { servicios_cantidad: 20 });
    Object.assign(response.data.data.ordenesServicio[1], { servicios_cantidad: 10, situacion_os: "Cerrada", fecha_cierre_os: "2026-09-15" });
    response.data.data.billing = { "01-00000001": demoBilling({ billedHours: 10 }), "01-00000002": demoBilling({ os: "01-00000002", billedHours: 10 }) };
    setup(); tab("Productividad");
    const card = () => screen.getByText("Eficiencia").closest(".kpi-item")!;
    expect(card()).toHaveTextContent("66,7%");
    technicianStatus("Activos"); expect(card()).toHaveTextContent("50%");
    technicianStatus("Inactivos"); expect(card()).toHaveTextContent("100%");
    technicianStatus("Todos");
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "00000001" } });
    await waitFor(() => expect(card()).toHaveTextContent("50%"));
  });
  it("exposes billing failures with retry and no invented efficiency or stale money", () => {
    billingState.isError = true; billingState.error = { code: "PGRST202" };
    setup(); tab("Productividad");
    expect(screen.getByRole("alert")).toHaveTextContent("actualizar en la base");
    expect(screen.getByText("Eficiencia").closest(".kpi-item")).toHaveTextContent("—");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.billingRetry).toHaveBeenCalledOnce();
    expect(mocks.refetch).not.toHaveBeenCalled();
  });
  it("keeps the list, operational KPIs and compliance usable while billing waits", async () => {
    billingState.isPending = true; billingState.isFetching = true;
    setup();
    expect(screen.getByRole("table", { name: "Órdenes de servicio" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Indicadores" }).children).toHaveLength(5);
    expect(screen.queryByText("Cargando órdenes y actividad…")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Exportar Órdenes de servicio" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    tab("Productividad");
    expect(screen.getByText("Eficiencia").closest(".kpi-item")).toHaveTextContent("Calculando…");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).toBeVisible();
    tab("Cumplimiento");
    expect(mocks.billing).toHaveBeenLastCalledWith(expect.any(Array), "2026-09-25", false);
    expect(screen.getByRole("table", { name: "Actividad por técnico" })).toBeVisible();
  });
  it("requests only filtered OS, not the one-year operational lookback", async () => {
    setup();
    expect(mocks.billing).toHaveBeenLastCalledWith(["01-00000002", "01-00000001"], "2026-09-25", true);
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "00000002" } });
    await waitFor(() => expect(mocks.billing).toHaveBeenLastCalledWith(["01-00000002"], "2026-09-25", true));
  });
  it("updates an open drawer when billing arrives and clears it during refresh", () => {
    billingState.isPending = true; billingState.isFetching = true;
    const rendered = setup();
    fireEvent.click(screen.getByRole("button", { name: "Ver OS 01-00000001" }));
    const detail = () => within(screen.getByRole("dialog"));
    expect(detail().getByText("Cargando facturación…")).toBeVisible();
    response.data.data.billing = { "01-00000001": demoBilling() };
    billingState.isPending = false; billingState.isFetching = false;
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(detail().getByText("$ 780,00")).toBeVisible();
    billingState.isFetching = true;
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(detail().queryByText("$ 780,00")).not.toBeInTheDocument();
    expect(detail().getByText("Cargando facturación…")).toBeVisible();
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
    expect(payload.columns).toHaveLength(11);
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
