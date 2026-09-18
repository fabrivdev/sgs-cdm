import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetalleRepuestoSheet } from "./DetalleRepuestoSheet";
import type { StockMatrizRow, VentaRepuestoHistorial } from "@/hooks/useRepuestos";

const mocks = vi.hoisted(() => ({ history: vi.fn(), stock: vi.fn(), can: vi.fn(), export: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/useRepuestos", () => ({ useVentasRepuesto: mocks.history, useStockMatrizProducto: mocks.stock, useRepuestoHermanos: () => ({ data: [] }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: mocks.can }) }));
vi.mock("@/hooks/useSugerenciasCompra", () => ({ guardarPlanificacionArticulo: vi.fn(), refrescarHistorialUnificado: vi.fn(), vincularCodigoLegacy: vi.fn() }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable: mocks.export }));
const stock: StockMatrizRow = {
  codigo_interno: "REPIN000001", codigo_fabricante: "000123", descripcion: "RODAMIENTO CON DESCRIPCIÓN LARGA", marca: "CLAAS", familia: "BUJES", unidad: "UN",
  santa_rita: 1.25, santa_rosa: 0, campo_9: 0, misiones: 0, loma_plata: 0, katuete: 0, total: 1.25,
};
const converted: VentaRepuestoHistorial = {
  linea_id: "a", producto_codigo: stock.codigo_interno, producto_codigo_fabricante: "000123", fecha_factura: "2026-09-17", factura: "000001",
  cliente: "CLIENTE ALFA", sucursal: "Santa Rita", cantidad: 1.25, total_venta_usd: 10.55,
  cantidad_original: 5, conversion_aplicada: true, factor_conversion: 0.25, unidad_original: "CAJA", unidad_destino: "UN", regla_conversion: "Regla confirmada",
  codigo_facturado: "000123", codigo_fabricante_facturado: "000123", descripcion_facturada: stock.descripcion, origen_sistema: "legacy", metodo_vinculo: "vinculacion_confirmada",
};
const rows = [converted, { ...converted, linea_id: "b", fecha_factura: "2026-09-16", factura: "000002", cantidad: -0.25, total_venta_usd: -2.11, conversion_aplicada: false },
  { ...converted, linea_id: "c", fecha_factura: "2026-09-15", factura: null, cliente: "CLIENTE ZETA", cantidad: 3, total_venta_usd: 200.75, conversion_aplicada: false }];
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-18T12:00:00"));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  mocks.history.mockReturnValue({ data: rows, isLoading: false, isError: false, refetch: mocks.refetch });
  mocks.stock.mockReturnValue({ data: stock, isLoading: false, isError: false }); mocks.can.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DetalleRepuestoSheet producto={stock} onClose={vi.fn()} /></QueryClientProvider>);
}
const cells = () => within(screen.getByRole("table", { name: "Historial de ventas del repuesto" })).getAllByRole("row").slice(1).map(row => within(row).getAllByRole("cell"));
describe("compact part history sheet", () => {
  it("shows centered numeric-only quantities, dollars and cents without stacked records", () => {
    setup(); const first = cells()[0]; const second = cells()[1];
    expect(first[3].textContent).toBe("1,25"); expect(second[3].textContent).toBe("-0,25");
    expect(first[4].textContent).toBe("$ 8,44"); expect(first[5].textContent).toBe("$ 10,55"); expect(second[5].textContent).toBe("$ -2,11");
    expect(first[3]).toHaveClass("text-center"); expect(first[5]).toHaveClass("text-right");
    const table = screen.getByRole("table", { name: "Historial de ventas del repuesto" });
    expect(table).toHaveClass("table-fixed"); expect(table.querySelectorAll("td br,td p,td div,td .flex-wrap")).toHaveLength(0);
    expect(screen.queryByText("Total USD")).toBeNull(); expect(screen.queryByText("Precio Total")).toBeNull();
    const heads = within(table).getAllByRole("columnheader"); expect(heads[3]).toHaveClass("text-center");
    expect(within(heads[3]).getByRole("button")).toHaveClass("justify-center");
    expect(first[2]).toHaveAttribute("title", "CLIENTE ALFA");
  });
  it("keeps conversion evidence accessible without adding units to the quantity", async () => {
    setup(); expect(cells()[0][3].textContent).toBe("1,25");
    fireEvent.click(screen.getByRole("button", { name: "Conversión de cantidad: 000001" }));
    const help = await screen.findByRole("dialog", { name: "Conversión de cantidad" });
    expect(help).toHaveTextContent("5 CAJA × 0.25 = 1,25 UN"); expect(help).toHaveTextContent("Regla confirmada");
    fireEvent.keyDown(help, { key: "Escape" }); await waitFor(() => expect(screen.queryByRole("dialog", { name: "Conversión de cantidad" })).toBeNull());
  });
  it("retains both sort directions by original amounts, including negative credits", () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Ordenar Facturación: menor a mayor" }));
    expect(cells().map(row => row[5].textContent)).toEqual(["$ -2,11", "$ 10,55", "$ 200,75"]);
    fireEvent.click(screen.getByRole("button", { name: "Ordenar Facturación: mayor a menor" }));
    expect(cells().map(row => row[5].textContent)).toEqual(["$ 200,75", "$ 10,55", "$ -2,11"]);
    expect(screen.getByRole("columnheader", { name: "Facturación" })).toHaveAttribute("aria-sort", "descending");
  });
  it("keeps grouped totals and distinct document counts with the shared axes", () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "Por cliente" }));
    const alpha = cells().find(row => row[0].textContent === "CLIENTE ALFA")!;
    expect(alpha.map(cell => cell.textContent)).toEqual(["CLIENTE ALFA", "1", "2", "$ 8,44"]);
    expect(alpha[1]).toHaveClass("text-center"); expect(alpha[2]).toHaveClass("text-center"); expect(alpha[3]).toHaveClass("text-right");
    fireEvent.click(screen.getByRole("button", { name: "Por mes" })); expect(cells()[0].slice(1).map(cell => cell.textContent)).toEqual(["4", "2", "$ 209,19"]);
  });
  it("centers branch sales and stock, retaining fractional balances and zeros", async () => {
    setup(); fireEvent.mouseDown(screen.getByRole("tab", { name: "Sucursales" }), { button: 0 });
    const table = await screen.findByRole("table", { name: "Stock y ventas por sucursal" });
    const row = within(table).getAllByRole("row").find(row => row.textContent?.includes("Santa Rita"))!;
    const branch = within(row).getAllByRole("cell"); expect(branch.map(cell => cell.textContent)).toEqual(["Santa Rita", "4", "4", "1,25"]);
    branch.slice(1).forEach(cell => expect(cell).toHaveClass("text-center"));
    within(table).getAllByRole("columnheader").slice(1).forEach(head => expect(head).toHaveClass("text-center"));
  });
  it("retains narrow-screen secondary values in hover and the complete typed export", async () => {
    setup(); const first = cells()[0]; expect(first[2]).toHaveClass("hidden", "sm:table-cell"); expect(first[4]).toHaveClass("hidden", "sm:table-cell");
    expect(first[1]).toHaveAttribute("title", "000001 · CLIENTE ALFA · P. unit.: $ 8,44");
    const filters = screen.getByRole("button", { name: /Más filtros/ }); const actions = screen.getByRole("button", { name: "Acciones de la sección" });
    expect(filters.nextElementSibling).toContainElement(actions);
    fireEvent.keyDown(actions, { key: "Enter" }); fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Historial de facturas" }));
    await waitFor(() => expect(mocks.export).toHaveBeenCalled()); const exported = mocks.export.mock.calls[0][0];
    expect(exported.rows).toHaveLength(3); expect(exported.rows[0]).toEqual(converted);
    expect(exported.columns.map((column: { label: string }) => column.label)).toEqual(["Fecha", "Factura", "Cliente", "Cant.", "P. unit.", "Facturación"]);
    expect(exported.columns[1].value(converted)).toBe("000001"); expect(exported.columns[3].value(converted)).toBe(1.25); expect(exported.columns[5].value(converted)).toBe(10.55);
    expect(exported.columns[3].excelFormat).toBe("0.######"); expect(exported.columns[5].excelFormat).toBe('"$" #,##0.00');
  });
  it("retains missing stock and blocks exports without permission", async () => {
    mocks.stock.mockReturnValue({ data: null, isLoading: false, isError: false }); mocks.can.mockReturnValue(false); setup();
    expect(screen.queryByRole("button", { name: "Acciones de la sección" })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Sucursales" }), { button: 0 });
    const table = await screen.findByRole("table", { name: "Stock y ventas por sucursal" });
    within(table).getAllByRole("row").slice(1).forEach(row => expect(within(row).getAllByRole("cell")[3].textContent).toBe("—"));
  });
  it("retains errors, retry and disabled export instead of fabricating empty history", () => {
    mocks.history.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: mocks.refetch, error: new Error("Timeout") }); setup();
    expect(screen.getByText("No se pudo consultar el historial. El stock sigue disponible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acciones de la sección" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" })); expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/No se encontraron ventas/)).toBeNull();
  });
});
