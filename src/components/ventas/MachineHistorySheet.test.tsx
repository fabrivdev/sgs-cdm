import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MachineHistorySheet } from "./MachineHistorySheet";

const { rpc, can, sheet, write } = vi.hoisted(() => ({ rpc: vi.fn(), can: vi.fn(), sheet: vi.fn((rows: unknown[][]) => ({ rows })), write: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can }) }));
vi.mock("xlsx", () => ({ utils: { aoa_to_sheet: sheet, encode_cell: () => "A1", book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: write }));

beforeEach(() => {
  can.mockReturnValue(true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const target = { chassis: "24491414", os: null };
const row = {
  os_numero: "01-00000057",
  fecha_abierta_os: "2026-08-01",
  fecha_cierre_os: "2026-08-03",
  tipo_tiempo: "Cliente / Garantia",
  servicios_cantidad: 8,
  km_cantidad: null,
  responsable: "12 - juan gómez",
  situacion_os: "CERRADA",
  factura: "0010001005021; 0010000000077",
  servicios_valor: 100,
  repuesto_valor: 50,
  kilometro_valor: null,
  terceros_valor: null,
  raw_data: { "Mec Aux 1": "JUAN GOMEZ", "Mec Aux 2": "Pedro Ruiz", totales_por_tipo: { Cliente: { horas: 5 }, Garantia: { horas: 3 } } },
};
const part = { id: "p1", fecha_factura: "2026-08-21", factura: "00000123", cod_mercaderia: "REP001", codigo_fabricante: "FAB002", mercaderia: "Rodamiento", observacion: "", cantidad: 2, total_venta: 80, raw_data: { linked_service_order: row.os_numero } };

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MachineHistorySheet target={target} onOpenChange={() => {}} /></QueryClientProvider>);
}

function setup(partsError = false) {
  rpc.mockImplementation((_name, args) => Promise.resolve(
    !args ? { data: [] }
      : args.p_vista === "os" ? { data: [row] }
        : args.p_vista === "maquina" ? { data: { modelo_tipo: "MAESTRO", clientes: { nombre: "Dueño actual" } } }
          : partsError ? { error: { message: "statement timeout" } }
            : { data: [part] },
  ));
}

const rowContaining = (table: HTMLElement, value: string) => within(table).getAllByRole("row").find(tableRow => within(tableRow).queryAllByText(value, { exact: true }).length > 0);

describe("complete machine history", () => {
  it("shows services and parts directly without tabs or summary cards", async () => {
    setup(); renderSheet();
    const table = await screen.findByRole("table", { name: "Historial completo de la máquina" });
    expect(table).toHaveClass("table-fixed");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Historial de OS" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repuestos" })).not.toBeInTheDocument();
    expect(screen.queryByText("Órdenes de servicio")).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("ventas_servicios_historial", expect.objectContaining({ p_vista: "os" }));
    expect(rpc).toHaveBeenCalledWith("ventas_servicios_historial", expect.objectContaining({ p_vista: "repuestos" }));
  });

  it("uses one row per real time type and never allocates a mixed OS amount", async () => {
    setup(); renderSheet();
    const table = await screen.findByRole("table", { name: "Historial completo de la máquina" });
    const clientRow = rowContaining(table, "Cliente");
    const warrantyRow = rowContaining(table, "Garantía");
    expect(clientRow).toBeDefined();
    expect(warrantyRow).toBeDefined();
    const clientCells = within(clientRow!).getAllByRole("cell");
    const warrantyCells = within(warrantyRow!).getAllByRole("cell");
    expect(clientCells[1]).toHaveTextContent("Cliente");
    expect(clientCells[5]).toHaveTextContent(/^5$/);
    expect(warrantyCells[5]).toHaveTextContent(/^3$/);
    expect(clientCells[7]).toHaveTextContent("—");
    expect(warrantyCells[7]).toHaveTextContent("—");
    expect(table.querySelectorAll("td br,td .flex-col")).toHaveLength(0);
  });

  it("keeps every billed part line separate with cents, negatives and repeated invoices", async () => {
    const parts = [
      { ...part, id: "P1", cod_mercaderia: "REP000001", codigo_fabricante: "000FAB", mercaderia: "DESCRIPCIÓN EXTENSA", cantidad: -2.5, total_venta: -80.55 },
      { ...part, id: "P2", cod_mercaderia: "REP000002", codigo_fabricante: "000FAB2", mercaderia: "OTRA DESCRIPCIÓN", cantidad: 0, total_venta: 0 },
    ];
    rpc.mockImplementation((_name, args) => Promise.resolve(!args ? { data: [] } : args.p_vista === "os" ? { data: [row] } : args.p_vista === "maquina" ? { data: null } : { data: parts }));
    renderSheet();
    const table = await screen.findByRole("table", { name: "Historial completo de la máquina" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    const firstPart = rowContaining(table, "REP000001");
    const cells = within(firstPart!).getAllByRole("cell");
    expect(cells[5]).toHaveTextContent("-2,5");
    expect(cells[5]).toHaveClass("text-center");
    expect(cells[7]).toHaveTextContent("$ -80,55");
    expect(within(table).getAllByText("00000123")).toHaveLength(2);
  });

  it("adds kilometraje and terceros only from real source values", async () => {
    const completeRow = { ...row, km_cantidad: 12.5, kilometro_valor: -1.25, terceros_valor: 20, raw_data: { ...row.raw_data, source_product_code: "MA01" } };
    rpc.mockImplementation((_name, args) => Promise.resolve(!args ? { data: [] } : args.p_vista === "os" ? { data: [completeRow] } : args.p_vista === "maquina" ? { data: null } : { data: [] }));
    renderSheet();
    const table = await screen.findByRole("table", { name: "Historial completo de la máquina" });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    const kmRow = rowContaining(table, "Kilometraje");
    const thirdPartyRow = rowContaining(table, "Terceros");
    expect(within(kmRow!).getAllByRole("cell")[5]).toHaveTextContent("12,5");
    expect(within(kmRow!).getAllByRole("cell")[7]).toHaveTextContent("$ -1,25");
    expect(within(thirdPartyRow!).getAllByRole("cell")[5]).toHaveTextContent("—");
    expect(within(table).getAllByText("MA01")).toHaveLength(2);
  });

  it("exports the complete filtered ledger with original codes and values", async () => {
    setup(); renderSheet();
    await screen.findByRole("table", { name: "Historial completo de la máquina" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Historial completo de la máquina" }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    const exported = sheet.mock.calls[0][0] as unknown[][];
    expect(exported).toHaveLength(4);
    expect(exported[0]).toEqual(["Fecha", "Tipo", "OS", "Estado", "Técnicos", "Código", "Cód. fabr.", "Descripción", "Cant.", "Factura", "Facturado"]);
    expect(exported.find(exportRow => exportRow[1] === "Repuesto")).toEqual([expect.any(Date), "Repuesto", row.os_numero, null, null, "REP001", "FAB002", "Rodamiento", 2, "00000123", 80]);
    expect(exported.filter(exportRow => ["Cliente", "Garantía"].includes(String(exportRow[1]))).map(exportRow => exportRow[1])).toEqual(expect.arrayContaining(["Cliente", "Garantía"]));
  });

  it("searches all service and part fields in the single list", async () => {
    setup(); renderSheet();
    const table = await screen.findByRole("table", { name: "Historial completo de la máquina" });
    fireEvent.change(screen.getAllByRole("searchbox", { name: "Buscar en historial" })[0], { target: { value: "FAB002" } });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Rodamiento")).toBeInTheDocument();
    expect(screen.queryByText("Mano de obra")).not.toBeInTheDocument();
  });

  it("blocks partial history and export when either required source fails", async () => {
    setup(true); renderSheet();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar el historial completo");
    expect(alert).toHaveTextContent("statement timeout");
    expect(alert).toHaveTextContent("No se muestran resultados parciales");
    expect(screen.queryByRole("table", { name: "Historial completo de la máquina" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acciones de la sección" })).toBeDisabled();
  });

  it("keeps export permission and canonical stock owner rules", async () => {
    can.mockReturnValue(false);
    rpc.mockImplementation((_name, args) => Promise.resolve(!args ? { data: [] }
      : args.p_vista === "os" ? { data: [row] }
        : args.p_vista === "maquina" ? { data: { modelo_tipo: "LEXION", clientes: { nombre: "CAMPOS DEL MANANA S.A. - SANTA RITA" }, fuente_propietario: "stock" } }
          : { data: [part] }));
    renderSheet();
    await screen.findByRole("table", { name: "Historial completo de la máquina" });
    expect(screen.getByText(/Propietario actual: CAMPOS DEL MAÑANA S.A./)).toBeInTheDocument();
    expect(screen.getByText(/Stock propio/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).not.toBeInTheDocument();
  });
});
