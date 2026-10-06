import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockProyectado from "./StockProyectado";

const { rpc, exportSalesTable } = vi.hoisted(() => ({ rpc: vi.fn(), exportSalesTable: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ can: (permission: string) => permission === "datos:exportar" }) }));
vi.mock("@/components/ventas/salesTableExport", () => ({ exportSalesTable }));

const rows = [
  { programa: "CLAAS", marca: "CLAAS", tipo: "COSECHADORA", modelo: "LEXION 740", stock: 1, pedidos_compra: 0, disponibilidad: 1, ventas_pendientes: 3, stock_proyectado: -2, arribos_periodo: 0, ventas_netas_periodo: 0 },
  { programa: "HORSCH", marca: "HORSCH", tipo: "SEMBRADORA", modelo: "MAESTRO 24", stock: 2, pedidos_compra: 2, disponibilidad: 4, ventas_pendientes: 1, stock_proyectado: 3, arribos_periodo: 1, ventas_netas_periodo: 0 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  rpc.mockResolvedValue({ data: { fecha_corte: "2026-10-06", filas: rows }, error: null });
});
afterEach(() => { cleanup(); rpc.mockReset(); exportSalesTable.mockReset(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Stock proyectado advanced filters", () => {
  it("offers real secondary dimensions and filters the complete in-memory report", async () => {
    render(<StockProyectado />);
    await screen.findAllByText("LEXION 740");
    fireEvent.click(screen.getByRole("button", { name: "Más filtros" }));
    const panel = screen.getByRole("dialog");
    const secondary = panel.querySelector("[data-expanded-filter-panel]") as HTMLElement;
    expect(secondary).toHaveTextContent("Modelo");
    expect(secondary).toHaveTextContent("Stock proyectado");
    expect(secondary).toHaveTextContent("Órdenes de compra");
    expect(secondary).toHaveTextContent("Ventas pendientes");

    const projected = within(secondary).getAllByRole("combobox")[1];
    fireEvent.click(projected);
    fireEvent.click(await screen.findByRole("option", { name: "Negativo" }));
    await waitFor(() => expect(screen.queryByText("MAESTRO 24")).not.toBeInTheDocument());
    expect(screen.getAllByText("LEXION 740").length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("button", { name: "Más filtros" })).toHaveTextContent("1");

    const kpis = [...document.querySelectorAll(".kpi-item")];
    expect(kpis[0]).toHaveTextContent("Stock1");
    expect(kpis[1]).toHaveTextContent("Órdenes de compra0");
    expect(kpis[2]).toHaveTextContent("Ventas pendientes3");
    expect(kpis[3]).toHaveTextContent("Stock proyectado-2");

    const actions = screen.getByRole("button", { name: "Acciones de la sección" });
    fireEvent.keyDown(actions, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar Stock proyectado" }));
    await waitFor(() => expect(exportSalesTable).toHaveBeenCalledTimes(1));
    expect(exportSalesTable).toHaveBeenCalledWith(expect.objectContaining({ rows: [rows[0]] }));
  });
});
