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
const currentMonth = () => fireEvent.change(document.querySelectorAll<HTMLInputElement>('input[type="date"]')[0], { target: { value: "2026-09-01" } });
const technicianStatus = (name: string) => fireEvent.click(within(screen.getByRole("group", { name: "Estado de técnicos" })).getByRole("button", { name }));
describe("orders workspace", () => {
  it("defaults to July through today, keeps manual dates, and resets the whole filter set", async () => {
    mocks.width = 1280;
    setup();
    const quickPeriod = screen.getByRole("combobox", { name: "Período rápido" });
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(mocks.query).toHaveBeenLastCalledWith("2026-07-01", "2026-09-25");
    expect(dates[0]).toHaveValue("2026-07-01");
    expect(dates[1]).toHaveValue("2026-09-25");
    expect(quickPeriod).toHaveValue("");
    expect((screen.getByRole("option", { name: "Personalizado" }) as HTMLOptionElement).selected).toBe(true);

    fireEvent.change(dates[0], { target: { value: "2026-08-03" } });
    expect(dates[0]).toHaveValue("2026-08-03");
    expect(quickPeriod).toHaveValue("");

    fireEvent.change(quickPeriod, { target: { value: "current-month" } });
    expect(dates[0]).toHaveValue("2026-09-01");
    expect(dates[1]).toHaveValue("2026-09-25");
    expect(quickPeriod).toHaveValue("current-month");

    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    fireEvent.change(search, { target: { value: "demo" } });
    await waitFor(() => expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ busqueda: "demo" })));
    fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Limpiar (2)" }));
    expect(dates[0]).toHaveValue("2026-07-01");
    expect(dates[1]).toHaveValue("2026-09-25");
    expect(quickPeriod).toHaveValue("");
  });
  it.each([390, 1280])("keeps clear disabled for the default range in every view at %i px", width => {
    mocks.width = width;
    setup();
    for (const view of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(view);
      fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
      const panel = within(screen.getByRole("dialog"));
      expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();
      fireEvent.click(panel.getByRole("button", { name: "Aplicar" }));
    }
  });
  it.each([
    { field: "Desde", index: 0, value: "2026-08-03", original: "2026-07-01" },
    { field: "Hasta", index: 1, value: "2026-09-20", original: "2026-09-25" },
    { field: "Hasta vacío", index: 1, value: "", original: "2026-09-25" },
  ])("allows clearing a date-only $field change and recognizes manual restoration", ({ index, value, original }) => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
    const dialog = screen.getByRole("dialog");
    const panel = within(dialog);
    const dates = dialog.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[index], { target: { value } });
    expect(panel.getByRole("button", { name: "Limpiar (1)" })).toBeEnabled();
    fireEvent.change(dates[index], { target: { value: original } });
    expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();

    fireEvent.change(dates[index], { target: { value } });
    fireEvent.click(panel.getByRole("button", { name: "Limpiar (1)" }));
    expect(dates[0]).toHaveValue("2026-07-01");
    expect(dates[1]).toHaveValue("2026-09-25");
    expect(mocks.query).toHaveBeenLastCalledWith("2026-07-01", "2026-09-25");
    expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();
  });
  it.each([390, 1280])("clears a quick period back to Paraguay's default day at %i px", width => {
    mocks.width = width;
    vi.setSystemTime(new Date("2026-10-01T01:30:00Z"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
    const dialog = screen.getByRole("dialog");
    const panel = within(dialog);
    const dates = dialog.querySelectorAll<HTMLInputElement>('input[type="date"]');
    const quickPeriod = panel.getByRole("combobox", { name: "Período rápido" });
    expect(dates[1]).toHaveValue("2026-09-30");
    expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();

    fireEvent.change(quickPeriod, { target: { value: "previous-week" } });
    expect(quickPeriod).toHaveValue("previous-week");
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "dia", busqueda: "" }));
    fireEvent.click(panel.getByRole("button", { name: "Limpiar (1)" }));
    expect(dates[0]).toHaveValue("2026-07-01");
    expect(dates[1]).toHaveValue("2026-09-30");
    expect(quickPeriod).toHaveValue("");
    expect(mocks.query).toHaveBeenLastCalledWith("2026-07-01", "2026-09-30");
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "mes", busqueda: "" }));
    expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();
  });
  it.each([390, 1280])("keeps its view tabs inside the page header at %i px", width => {
    mocks.width = width;
    setup();
    const heading = screen.getByRole("heading", { name: "Órdenes de servicio" });
    expect(heading.closest("header")).toContainElement(screen.getByRole("tablist", { name: "Vistas de órdenes de servicio" }));
  });
  it.each([390, 1280])("keeps section actions beside filters instead of in the header at %i px", async width => {
    mocks.width = width;
    setup();
    const filters = screen.getByRole("button", { name: "Más filtros" });
    const actions = await screen.findByRole("button", { name: "Acciones de la sección" });
    expect(actions.closest("header")).toBeNull();
    expect(filters.parentElement).toContainElement(actions);
  });
  it("groups phone OS identity into three compact lines without dropping metrics", () => {
    mocks.width = 320;
    setup();
    const open = screen.getByRole("button", { name: "Ver OS 01-00000001" });
    const record = open.querySelector(".mobile-record");
    expect(record?.children).toHaveLength(3);
    expect(record?.children[0]).toHaveTextContent("OS 01-00000001");
    expect(record?.children[1]).toHaveTextContent(/CLAAS|HORSCH/);
    expect(record?.children[2]).toHaveTextContent(/técnico/);
    expect(record?.children[2]).toHaveTextContent(/h/);
    expect(record?.children[2]).toHaveTextContent(/km/);
  });
  it.each([320, 768, 1280])("does not repeat the effective productivity range in the title and keeps its behavior at %i px", width => {
    mocks.width = 1280;
    response.data.data.billing = { "01-00000001": demoBilling() };
    const legacy = demoWorkLog([], "LEGACY");
    Object.assign(legacy.order_data, { fecha_abierta_os: "2026-02-01", fecha_cierre_os: null });
    workLogs.push(legacy);
    const rendered = setup(); tab("Productividad");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-01-01" } });
    expect(screen.getByText("Meta disponible", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("340");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ fecha_desde: "2026-01-01", productividad_desde: "2026-07-01", productividad_hasta: "2026-09-25" }));
    mocks.width = width;
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(screen.queryByText(/Productividad ·/)).not.toBeInTheDocument();
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dates[0]).toHaveValue("2026-01-01");
    expect(dates[1]).toHaveValue("2026-09-25");
    expect(mocks.billing).toHaveBeenLastCalledWith(["01-00000001"], "2026-09-25", true);
    fireEvent.click(screen.getByRole("button", { name: "Histórico en Órdenes" }));
    expect(screen.getByRole("tab", { name: "Órdenes" })).toHaveAttribute("aria-selected", "true");
    expect(mocks.query).toHaveBeenLastCalledWith("2026-01-01", "2026-09-25");
    expect(screen.queryByText(/Productividad ·/)).not.toBeInTheDocument();
  });
  it("shows legacy-only productivity as unavailable, not zero, pending or missing work", () => {
    mocks.width = 1280;
    workState.isPending = true;
    setup(); tab("Productividad");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-01-01" } });
    fireEvent.change(document.querySelectorAll('input[type="date"]')[1], { target: { value: "2026-06-30" } });
    expect(screen.getByRole("status")).toHaveTextContent("Histórico sin jornadas · hasta 30/06/2026");
    for (const name of ["Horas-persona", "Meta disponible", "Productividad"]) {
      expect(screen.getByText(name, { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("—");
    }
    expect(screen.queryByText(/Cargando jornadas/)).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Productividad por técnico" })).not.toBeInTheDocument();
    expect(mocks.work).toHaveBeenLastCalledWith("2026-01-01", "2026-06-30", false);
    fireEvent.click(screen.getByRole("button", { name: "Ver órdenes" }));
    expect(mocks.query).toHaveBeenLastCalledWith("2026-01-01", "2026-06-30");
  });
  it("does not send pre-July historical OS or open OS to the annual efficiency billing query", () => {
    mocks.width = 1280;
    response.data.data.billing = { "01-00000001": demoBilling() };
    response.data.data.ordenesServicio.push(demoOrder({ os_numero: "01-LEGACY", fecha_abierta_os: "2026-03-01",
      fecha_cierre_os: null, fecha_emision_factura: "2026-06-20", situacion_os: "Cerrada" }));
    mocks.billing.mockImplementation((keys: string[]) => ({ ...billingState, isError: keys.includes("01-LEGACY"),
      error: { code: "57014" }, data: response.data.data.billing, refetch: mocks.billingRetry }));
    setup(); tab("Productividad");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-01-01" } });
    expect(mocks.billing).toHaveBeenLastCalledWith(["01-00000001"], "2026-09-25", true);
    expect(screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("120%");
    expect(screen.queryByText("Facturación demorada.")).not.toBeInTheDocument();
    tab("Órdenes");
    expect(mocks.billing).toHaveBeenLastCalledWith(expect.arrayContaining(["01-LEGACY", "01-00000001", "01-00000002"]), "2026-09-25", true);
  });
  it("exports requested and actual calculation dates with the same numeric productivity", async () => {
    mocks.width = 1280;
    setup(); tab("Productividad");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-01-01" } });
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Productividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    const value = (key: string) => payload.columns.find((column: { key: string }) => column.key === key).value(payload.rows[0]);
    expect(value("desde_calculo")).toBe("2026-07-01");
    expect(value("hasta_calculo")).toBe("2026-09-25");
    expect(value("desde_solicitado")).toBe("2026-01-01");
    expect(value("hasta_solicitado")).toBe("2026-09-25");
    expect(value("horas")).toBe(10);
    expect(value("meta")).toBe(340);
    expect(value("porcentaje")).toBeCloseTo(10 / 340);
  });
  it("uses work dates for productivity while keeping the order list and efficiency on their original cohort", () => {
    workLogs = [demoWorkLog([demoWorkEntry({ fecha_inicio: "2026-08-15", fecha_fin: "2026-08-15" }),
      demoWorkEntry({ id: "SEPT", hora_fin: "11:00" })], "01-00000099")];
    workLogs[0].order_data.fecha_cierre_os = "2026-10-01";
    setup(); currentMonth(); tab("Productividad");
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
    expect(mocks.work).toHaveBeenLastCalledWith("2026-07-01", "2026-09-25", true, "01-00000001");
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
    tab("Cumplimiento"); expect(screen.getByRole("table", { name: "Matriz de técnicos por período" })).toBeVisible();
  });
  it.each([320, 768, 1280])("shows source evidence and preserves unaffected technician productivity at %i px", width => {
    mocks.width = width;
    workLogs[0].entries[0].fecha_inicio = null;
    setup(); tab("Productividad"); technicianStatus("Todos");
    const issueReview = screen.getByRole("button", { name: "1 incidencia · Revisar" });
    expect(screen.getByRole("alert")).toContainElement(issueReview);
    const productivityTable = screen.getByRole("table", { name: "Productividad por técnico" });
    expect(productivityTable.closest("section")?.firstElementChild).toContainElement(issueReview);
    if (width >= 640) expect(productivityTable.closest("section")?.firstElementChild).toContainElement(screen.getByRole("heading", { name: "Por técnico" }));
    expect(screen.queryByText(/registros pendientes|Productividad sin calcular/)).not.toBeInTheDocument();
    expect(screen.getByText("Productividad", { selector: ".kpi-item span" }).closest(".kpi-item")).not.toHaveTextContent("Parcial");
    expect(screen.getByRole("meter", { name: "Meta de TECNICO DOS" })).toBeVisible();
    expect(screen.getByRole("meter", { name: "Meta de TECNICO UNO" })).toHaveAttribute("aria-valuetext", expect.stringContaining("Parcial: solo horas válidas"));
    fireEvent.click(screen.getByRole("button", { name: /TECNICO UNO.*Parcial/ }));
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveTextContent("01-00000001");
    expect(drawer).toHaveTextContent("Falta fecha de inicio");
    expect(drawer).toHaveTextContent("TECNICO UNO");
    expect(drawer).toHaveTextContent("Sin fecha · 08:00:00");
    expect(drawer).toHaveTextContent("10/09/2026 · 18:00:00");
    expect(drawer).toHaveTextContent("No calculable");
    expect(drawer).not.toHaveTextContent("TECNICO DOS");
  });
  it("shows both original clocks when different orders overlap, not empty artificial hours", () => {
    workLogs.push(demoWorkLog([demoWorkEntry({ id: "OVERLAP", hora_inicio: "09:30", hora_fin: "11:15" })], "02-00000003"));
    setup(); tab("Productividad");
    fireEvent.click(screen.getByRole("button", { name: /incidencia · Revisar/ }));
    const drawer = screen.getByRole("dialog");
    expect(drawer).toHaveTextContent("Incidencias de jornadas");
    expect(drawer).toHaveTextContent("Horarios superpuestos");
    expect(drawer).toHaveTextContent("01-00000001"); expect(drawer).toHaveTextContent("02-00000003");
    expect(drawer).toHaveTextContent("10/09/2026 · 09:30"); expect(drawer).toHaveTextContent("10/09/2026 · 11:15");
    expect(drawer).toHaveTextContent("1,75 h");
  });
  it("exports partial numeric values with their status and clears the alert after filtering", async () => {
    workLogs[0].entries[0].hora_inicio = null;
    workLogs[0].entries.push(demoWorkEntry({ id: "VALID", fecha_inicio: "2026-09-11", fecha_fin: "2026-09-11" }));
    setup(); currentMonth(); tab("Productividad"); technicianStatus("Todos");
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Productividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    const affected = payload.rows.find((r: { tecnico: string }) => r.tecnico === "TECNICO UNO");
    const valid = payload.rows.find((r: { tecnico: string }) => r.tecnico === "TECNICO DOS");
    const value = (key: string, row: unknown) => payload.columns.find((c: { key: string }) => c.key === key).value(row);
    expect(value("horas", affected)).toBe(10); expect(value("porcentaje", affected)).toBeCloseTo(0.1);
    expect(value("detalle", affected)).toBe(10); expect(value("heredadas", affected)).toBe(0);
    expect(value("calculo", affected)).toBe("Parcial · solo horas válidas");
    expect(value("horas", valid)).toBe(1); expect(value("porcentaje", valid)).toBeGreaterThan(0);
    technicianStatus("Inactivos");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Horas-persona", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("1");
  });
  it("alerts automatically when refreshed work introduces an incident without removing valid productivity", () => {
    const rendered = setup(); currentMonth(); tab("Productividad");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const productivityCard = () => screen.getByText("Productividad", { selector: ".kpi-item span" }).closest(".kpi-item");
    const before = productivityCard()!.textContent!.trim();
    workLogs = [...workLogs, demoWorkLog([demoWorkEntry({ id: "NEW_BAD", hora_fin: null })], "OS-NEW")];
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "1 incidencia · Revisar" })).toBeVisible();
    expect(productivityCard()!.textContent!.trim()).toBe(before);
    expect(screen.getByRole("meter", { name: "Meta de TECNICO UNO" })).toHaveAttribute("aria-valuenow", "10");
    workLogs = workLogs.slice(0, 2);
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(productivityCard()!.textContent!.trim()).toBe(before);
  });
  it("keeps partial period exports numeric and excludes conflicts from technician detail", async () => {
    workLogs[0].entries.push(demoWorkEntry({ id: "BAD", hora_inicio: "09:00", hora_fin: "11:00" }),
      demoWorkEntry({ id: "VALID", fecha_inicio: "2026-09-11", fecha_fin: "2026-09-11", hora_fin: "12:00" }));
    setup(); currentMonth(); tab("Productividad"); technicianStatus("Todos");
    expect(screen.getByText("Horas-persona", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("5");
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Horas por período" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    const value = (key: string) => payload.columns.find((c: { key: string }) => c.key === key).value(payload.rows[0]);
    expect(value("persona")).toBe(5); expect(value("porcentaje")).toBeGreaterThan(0);
    expect(value("calculo")).toBe("Parcial · solo horas válidas");
    fireEvent.click(screen.getByRole("button", { name: /TECNICO UNO.*Parcial/ }));
    const rows = within(screen.getByRole("dialog")).getByRole("table", { name: "Jornadas trabajadas" });
    expect(rows).toHaveTextContent("11/09/2026"); expect(rows).not.toHaveTextContent("10/09/2026");
  });
  it("shows and exports efficiency by OS closure month without changing worked-hour periods", async () => {
    mocks.width = 1280;
    response.data.data.ordenesServicio.push(demoOrder({ os_numero: "01-00000003", fecha_cierre_os: "2026-07-20", servicios_cantidad: 20 }));
    response.data.data.billing = { "01-00000001": demoBilling({ billedHours: 12 }),
      "01-00000003": demoBilling({ os: "01-00000003", billedHours: 10 }) };
    const rendered = setup(); tab("Productividad");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-07-01" } });
    const table = screen.getByRole("table", { name: "Horas por período" });
    expect(within(table).getByText("Eficiencia")).toBeVisible();
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("50%");
    expect(rows[2]).toHaveTextContent("—");
    expect(rows[3]).toHaveTextContent("120%");
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Horas por período" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    const column = payload.columns.find((item: { key: string }) => item.key === "eficiencia");
    expect(column.excelFormat).toBe("0.0%");
    expect(payload.rows.map((row: object) => column.value(row))).toEqual([0.5, null, 1.2]);
    mocks.width = 390;
    rendered.rerender(<MemoryRouter><OrdenesServicio /></MemoryRouter>);
    expect(screen.getByRole("table", { name: "Horas por período" })).toHaveTextContent("Efic. 50%");
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
    setup(); tab("Productividad"); technicianStatus("Inactivos");
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
    setup(); currentMonth(); tab("Productividad");
    const meter = screen.getByRole("meter", { name: "Meta de TECNICO UNO" });
    expect(meter).toHaveAttribute("aria-valuenow", "150"); // 120 × 25/30 = 100 h target
    expect(meter).toHaveAttribute("aria-valuetext", "150 de 100 horas; 150% de meta");
    expect(meter.firstElementChild).toHaveStyle({ width: "100%" });
    expect(screen.queryByRole("meter", { name: "Meta de TECNICO DOS" })).not.toBeInTheDocument();
    technicianStatus("Todos");
    expect(screen.getByRole("meter", { name: "Meta de TECNICO DOS" })).toHaveAttribute("aria-valuenow", "1.6666666666666667");
  });
  it.each([320, 768, 1280])("uses a single compact technician header, not another navigation row, at %i px", width => {
    mocks.width = width;
    setup(); tab("Productividad");
    const group = screen.getByRole("group", { name: "Estado de técnicos" });
    expect(within(group).getAllByRole("button")).toHaveLength(3);
    expect(within(group).queryByRole("button", { name: "Sin ficha" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    expect(group.closest("section")).toContainElement(screen.getByRole("table", { name: "Productividad por técnico" }));
    expect(screen.queryByRole("heading", { name: "Por técnico" }) !== null).toBe(width >= 640);
    expect(within(group).getByRole("button", { name: "Activos" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
    const productivityTable = screen.getByRole("table", { name: "Productividad por técnico" });
    expect(productivityTable).not.toHaveTextContent("TECNICO DOS");
    if (width < 640) {
      for (const name of ["Técnico", "OS", "Horas", "Meta", "%"]) expect(within(productivityTable).getByRole("columnheader", { name: new RegExp(name) })).toBeVisible();
      expect(productivityTable).toHaveClass("max-sm:min-w-[440px]");
      const technician = within(productivityTable).getByRole("button", { name: /TECNICO UNO · 1 OS/ });
      expect(technician).toHaveTextContent(/^TECNICO UNO$/);
    }
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ estado_tecnicos: "activos" }));
  });
  it("filters active/inactive/unmatched technicians consistently in KPIs, periods and exports", async () => {
    mocks.width = 390;
    response.data.data.ordenesServicio[0].raw_data = { tecnicos_participantes: ["TECNICO UNO", "TECNICO DOS"] };
    response.data.data.ordenesServicio.push(demoOrder({ os_numero: "01-00000003", responsable: "TECNICO SIN FICHA", servicios_cantidad: 7 }));
    workLogs[1].entries[0].hora_fin = "18:00";
    workLogs.push(demoWorkLog([demoWorkEntry({ id: "UNKNOWN", tecnico_profile_id: null, tecnico_nombre: "TECNICO SIN FICHA", hora_fin: "15:00" })], "01-00000003"));
    setup(); currentMonth(); tab("Productividad");
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
    expect(table.getAllByRole("row")).toHaveLength(3);
    expect(table.getByText("TECNICO SIN FICHA")).toBeVisible();
    expect(table.getAllByRole("button", { name: /1 OS · Inactivo/ })).toHaveLength(2);
    expect(table.queryByText("Sin ficha", { exact: true })).not.toBeInTheDocument();
    kpis = within(screen.getByRole("region", { name: "Indicadores" }));
    expect(kpis.getByText("60", { exact: true })).toBeVisible(); // before Sep 16 deactivation
    expect(kpis.getByText("17", { exact: true })).toBeVisible();
    expect(kpis.getByText("28,3%", { exact: true })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Productividad por técnico" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.rows.map((r: { tecnico: string }) => r.tecnico)).toEqual(["TECNICO DOS", "TECNICO SIN FICHA"]);
    const noProfile = payload.rows.find((r: { tecnico: string }) => r.tecnico === "TECNICO SIN FICHA");
    expect(payload.columns.find((c: { key: string }) => c.key === "activo").value(noProfile)).toBe("No");
    expect(payload.columns.find((c: { key: string }) => c.key === "meta").value(noProfile)).toBeNull();
    expect(screen.queryByRole("meter", { name: "Meta de TECNICO SIN FICHA" })).not.toBeInTheDocument();
    technicianStatus("Todos");
    expect(within(screen.getByRole("region", { name: "Indicadores" })).getByText("27", { exact: true })).toBeVisible();
    tab("Órdenes");
    expect(within(screen.getByRole("table", { name: "Órdenes de servicio" })).getAllByRole("row")).toHaveLength(4);
  }, 20_000);
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
  it("keeps KPI strips in orders and productivity while compliance focuses on the matrix", () => {
    mocks.width = 320;
    setup();
    const orderKpis = Array.from(screen.getByRole("region", { name: "Indicadores" }).querySelectorAll(".kpi-item > div:first-child > span:first-child")).map(item => item.textContent);
    expect(orderKpis).toEqual(["Órdenes", "Abiertas", "Cerradas", "% de cierre", "Días de cierre (prom.)"]);
    for (const name of ["Órdenes", "Productividad", "Cumplimiento"]) {
      tab(name);
      if (name === "Cumplimiento") {
        expect(screen.queryByRole("region", { name: "Indicadores" })).not.toBeInTheDocument();
        expect(screen.getByRole("table", { name: "Matriz de técnicos por período" })).toBeVisible();
      } else {
        expect(screen.getByRole("region", { name: "Indicadores" }).children).toHaveLength(name === "Órdenes" ? 5 : 4);
        expect(screen.getAllByRole("button", { name: "Acciones de la sección" })).toHaveLength(1);
      }
    }
  }, 20_000);
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
    const card = screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")!;
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
    const card = () => screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")!;
    expect(card()).toHaveTextContent("50%");
    technicianStatus("Todos"); expect(card()).toHaveTextContent("66,7%");
    technicianStatus("Inactivos"); expect(card()).toHaveTextContent("100%");
    technicianStatus("Todos");
    fireEvent.change(screen.getByPlaceholderText("Buscar…"), { target: { value: "00000001" } });
    await waitFor(() => expect(card()).toHaveTextContent("50%"));
  });
  it("exposes billing failures with retry and no invented efficiency or stale money", () => {
    billingState.isError = true; billingState.error = { code: "PGRST202" };
    workLogs[0].entries[0].hora_inicio = null;
    setup(); tab("Productividad");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("actualización");
    expect(screen.getByRole("alert")).toHaveTextContent("1 incidencia · Revisar");
    expect(screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("—");
    expect(screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")).not.toHaveTextContent("OS sin cálculo");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.billingRetry).toHaveBeenCalledOnce();
    expect(mocks.refetch).not.toHaveBeenCalled();
    tab("Órdenes");
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    expect(screen.getByRole("menuitem", { name: "Exportar Órdenes de servicio" })).toHaveAttribute("aria-disabled", "true");
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
    expect(screen.getByText("Eficiencia", { selector: ".kpi-item span" }).closest(".kpi-item")).toHaveTextContent("Calculando…");
    expect(screen.getByRole("table", { name: "Productividad por técnico" })).toBeVisible();
    tab("Cumplimiento");
    expect(mocks.billing).toHaveBeenLastCalledWith(expect.any(Array), "2026-09-25", false);
    expect(screen.getByRole("table", { name: "Matriz de técnicos por período" })).toBeVisible();
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
    expect(payload.columns).toHaveLength(16);
    expect(payload.columns.find((c: { key: string }) => c.key === "meta").value(payload.rows[0])).toBeNull();
  });
  it("keeps same-day journeys and unavailability distinct in the mobile matrix detail", () => {
    response.data.data.disponibilidades = [{ id: "ABS1", tecnico_id: "T1", fecha_inicio: "2026-09-10", fecha_fin: "2026-09-10", tipo: "Capacitación", observacion: null, bloquea_agenda: true }];
    response.data.data.jornadas.push({ ...response.data.data.jornadas[0], id: "J4" });
    setup(); tab("Cumplimiento");
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-09-10" } });
    fireEvent.change(dates[1], { target: { value: "2026-09-10" } });
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "dia" }));
    fireEvent.click(screen.getByRole("button", { name: "TECNICO UNO" }));
    const detail = within(screen.getByRole("dialog"));
    expect(detail.getAllByText(/TR-DEMO1/)).toHaveLength(2);
    expect(detail.getByText("ND · Capacitación")).toBeVisible();
  });
  it("uses complete week columns for a month and day columns for a selected week", () => {
    mocks.width = 1280;
    setup(); currentMonth(); tab("Cumplimiento");
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "semana" }));
    expect(screen.getByText("Sem 36 · 26")).toBeVisible();
    expect(screen.getByText("Sem 39 · 26")).toBeVisible();
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-09-07" } });
    fireEvent.change(dates[1], { target: { value: "2026-09-13" } });
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "dia" }));
    expect(screen.getByText("Lun 07/09")).toBeVisible();
    expect(screen.getByText("Dom 13/09")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Más análisis" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acciones de la sección" })).toBeVisible();
    expect(screen.queryByText("Agrupar")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Actividad por técnico" })).not.toBeInTheDocument();
  });
  it("shows two complete weeks by day and exports the same compliance detail", async () => {
    mocks.width = 1280;
    vi.setSystemTime(new Date("2026-10-05T12:00:00"));
    response.data.data.jornadas[0].fecha = "2026-09-28";
    response.data.data.jornadas[1].fecha = "2026-10-05";
    response.data.data.jornadas[2].fecha = "2026-10-10";
    setup(); tab("Cumplimiento");
    fireEvent.change(screen.getByRole("combobox", { name: "Período rápido" }), { target: { value: "previous-current-week" } });

    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dates[0]).toHaveValue("2026-09-28");
    expect(dates[1]).toHaveValue("2026-10-11");
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "dia", fecha_desde: "2026-09-28", fecha_hasta: "2026-10-11" }));
    expect(screen.getByText("Lun 28/09", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(screen.getByText("Dom 11/10", { selector: ".dashboard-matrix-day-header" })).toBeVisible();

    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar detalle de cumplimiento" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalledOnce());
    const payload = mocks.export.mock.calls[0][0];
    expect(payload.fileName).toBe("cumplimiento-detalle.xlsx");
    expect(payload.columns.map((column: { label: string }) => column.label)).toEqual([
      "Tipo", "Fecha", "Sucursal", "Técnico(s)", "OS/TR", "Cliente", "Trabajo / motivo", "Estado",
    ]);
    expect(payload.rows.map((row: { fecha: string }) => row.fecha)).toEqual(expect.arrayContaining(["2026-09-28", "2026-10-05", "2026-10-10"]));
    expect(payload.rows.find((row: { fecha: string }) => row.fecha === "2026-10-10").estado).toBe("Programada");
  });

  it("keeps a custom thirteen-day compliance range daily", () => {
    mocks.width = 1280;
    setup(); tab("Cumplimiento");
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-09-28" } });
    fireEvent.change(dates[1], { target: { value: "2026-10-10" } });
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "dia" }));
    expect(screen.getByText("Lun 28/09", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(screen.getByText("Sab 10/10", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
  });
  it("presents a whole year by month without dropping empty months", () => {
    mocks.width = 1280;
    setup(); tab("Cumplimiento");
    fireEvent.change(document.querySelectorAll('input[type="date"]')[0], { target: { value: "2026-01-01" } });
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ agrupacion: "mes" }));
    expect(screen.getByText("Ene 26", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(screen.getByText("Sep 26", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
  });
  it("shows a compact completion ratio on daily, weekly and monthly desktop buckets", () => {
    mocks.width = 1280;
    response.data.data.jornadas[2].fecha = "2026-09-25";
    response.data.data.jornadas.push({ ...response.data.data.jornadas[0], id: "J4", estado: "Cancelada", horas_trabajadas: 0 });
    setup(); currentMonth(); tab("Cumplimiento");
    const completion = () => screen.getAllByRole("meter", { name: "Trabajos cumplidos" }).find(meter => meter.getAttribute("aria-valuetext") === "1 de 2 trabajos cumplidos");
    expect(screen.getByText("Sem 37 · 26", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(completion()?.closest(".dashboard-matrix-cell")).toHaveTextContent("1/2");
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-09-10" } });
    fireEvent.change(dates[1], { target: { value: "2026-09-10" } });
    expect(screen.getByText("Jue 10/09", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(completion()?.closest(".dashboard-matrix-cell")).toHaveTextContent("1/2");
    fireEvent.change(dates[0], { target: { value: "2026-01-01" } });
    fireEvent.change(dates[1], { target: { value: "2026-09-25" } });
    expect(screen.getByText("Sep 26", { selector: ".dashboard-matrix-day-header" })).toBeVisible();
    expect(completion()?.closest(".dashboard-matrix-cell")).toHaveTextContent("1/2");
    expect(screen.getByRole("button", { name: "TECNICO UNO" }).querySelectorAll("span")).toHaveLength(1);
  });
  it("keeps the same completion definition on phone and separates scheduled work", () => {
    response.data.data.jornadas[2].fecha = "2026-09-25";
    response.data.data.jornadas.push({ ...response.data.data.jornadas[0], id: "J4", estado: "Cancelada", horas_trabajadas: 0 });
    setup(); tab("Cumplimiento");
    const dates = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dates[0], { target: { value: "2026-09-10" } });
    fireEvent.change(dates[1], { target: { value: "2026-09-25" } });
    expect(screen.getByText("1 prog.")).toBeVisible();
    const previous = screen.getByRole("button", { name: "Período anterior" });
    expect(previous).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "Período siguiente" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: "Trabajos" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Horas" })).toHaveClass("min-h-11");
    fireEvent.click(previous);
    fireEvent.click(previous);
    expect(screen.getByRole("meter", { name: "Trabajos cumplidos de TECNICO UNO" })).toHaveAttribute("aria-valuetext", "1 de 2 trabajos cumplidos");
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
