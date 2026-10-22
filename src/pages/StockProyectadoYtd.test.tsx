import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockProyectado from "./StockProyectado";
import { parseProjectedMachineStock, projectedStockYtdTotal } from "@/lib/projectedMachineStock";
const { rpc, exportSalesTable } = vi.hoisted(() => ({ rpc: vi.fn(), exportSalesTable: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/lib/projectedStockYtd", () => ({ loadProjectedStockYtd: async (rows: unknown[]) => rows }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable }));
const rows = [
  { modelo_catalogo_id: "one", programa: "HORSCH", marca: "HORSCH", tipo: "SEMBRADORAS", modelo: "MAESTRO EVOLUTION 32", vendidas_ytd: 6, stock: 2, pedidos_compra: 1, ventas_pendientes: 1, stock_proyectado: 2 },
  { modelo_catalogo_id: "two", programa: "CLAAS", marca: "CLAAS", tipo: "COSECHADORAS", modelo: "TRION 740", vendidas_ytd: 3, stock: 1, pedidos_compra: 0, ventas_pendientes: 0, stock_proyectado: 1 },
];
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  rpc.mockResolvedValue({ data: { filas: rows, ytd: { estado: "completo" } }, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); rpc.mockReset(); exportSalesTable.mockReset(); });
describe("Vendidas YTD de Stock proyectado", () => {
  it("keeps YTD immediately before Stock and its total follows search/export", async () => {
    render(<StockProyectado />);
    await screen.findAllByText("MAESTRO EVOLUTION 32");
    expect(document.querySelector(".kpi-item")!).toHaveTextContent("Vendidas YTD9");
    fireEvent.change(screen.getByPlaceholderText(/Modelo, marca o tipo/), { target: { value: "Evolution" } });
    await waitFor(() => expect(document.querySelector(".kpi-item")!).toHaveTextContent("Vendidas YTD6"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Stock proyectado" }));
    await waitFor(() => expect(exportSalesTable).toHaveBeenCalledOnce());
    const exported = exportSalesTable.mock.calls[0][0];
    const keys = exported.columns.map((c: { key: string }) => c.key);
    expect(keys.indexOf("vendidas_ytd")).toBe(keys.indexOf("stock") - 1);
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0].vendidas_ytd).toBe(6);
  });
  it("does not display a partial observed number as a complete year", async () => {
    rpc.mockResolvedValue({ data: { filas: rows, ytd: { estado: "cobertura_no_acreditada" } }, error: null });
    render(<StockProyectado />);
    await screen.findAllByText("MAESTRO EVOLUTION 32");
    expect(document.querySelector(".kpi-item")!).toHaveTextContent("Vendidas YTD-");
    expect(screen.queryByText(/cobertura anual/)).not.toBeInTheDocument();
    expect(document.querySelector("p[role=status]")).toBeNull();
  });
  it("does not show zero balances on reconciliation failure", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Stock proyectado pendiente de conciliación" } });
    render(<StockProyectado />);
    await screen.findAllByText("Stock proyectado pendiente de conciliación");
    for (const kpi of document.querySelectorAll(".kpi-item")) expect(kpi).toHaveTextContent(/[-—]/);
  });
  it("preserves canonical ID, zero and missing YTD independently", () => {
    const parsed = parseProjectedMachineStock({ filas: [{ ...rows[0], vendidas_ytd: "0" }], ytd: { estado: "completo" } });
    expect(parsed.filas[0].modelo_catalogo_id).toBe("one");
    expect(projectedStockYtdTotal(parsed.filas, true)).toBe(0);
    expect(projectedStockYtdTotal(parseProjectedMachineStock({ filas: rows }).filas, false)).toBeNull();
    expect(projectedStockYtdTotal([{ ...parsed.filas[0], vendidas_ytd: null }], true)).toBeNull();
    expect(projectedStockYtdTotal([], false)).toBeNull();
    expect(projectedStockYtdTotal([], true)).toBe(0);
  });
});
