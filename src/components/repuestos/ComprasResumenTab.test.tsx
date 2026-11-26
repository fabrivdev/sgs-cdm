import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComprasResumenTab } from "./ComprasResumenTab";

vi.mock("@/hooks/useCompras", () => {
  const request = { fechaEmision: "2026-08-03", sucursal: "Santa Rita", unidad: "UN", cantidad: 10,
    solicitante: "Operador", moneda: "USD", precioUnitario: 0, item: "01" };
  return {
    useComprasSolicitudesLineas: () => ({ data: [
      { ...request, nroSolicitud: "10", productoCodigo: "REP01", cantidadEnPedido: 10, cantidadPendiente: 0 },
      { ...request, nroSolicitud: "11", productoCodigo: "REP02", cantidadEnPedido: 4, cantidadPendiente: 6, medioTransporte: "Aéreo" },
      { ...request, nroSolicitud: "12", productoCodigo: "REP03" },
    ] }),
    useComprasPedidosLineas: () => { throw new Error("La vista de saldos no necesita consultar pedidos."); },
  };
});

describe("Saldos TOTVS", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }));
  afterEach(() => vi.unstubAllGlobals());
  it("separa los saldos conocidos de las líneas sin verificar y muestra el origen de las cantidades", () => {
    render(<ComprasResumenTab />);
    const summary = within(screen.getByRole("table", { name: "Ítems de solicitud por sucursal" }));
    const row = summary.getByRole("row", { name: "Santa Rita 1 1 1" });
    expect(within(row).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["Santa Rita", "1", "1", "1"]);
    expect(screen.queryByText("Recepción por proveedor")).not.toBeInTheDocument();
    const backlog = within(screen.getByRole("table", { name: "Detalle por ítem" }));
    expect(backlog.getByRole("button", { name: "Detalle REP02" })).toBeVisible();
    expect(backlog.queryByText("REP03")).not.toBeInTheDocument();
    fireEvent.click(backlog.getByRole("button", { name: "Detalle REP02" }));
    const drawer = within(screen.getByRole("dialog", { name: "Detalle de solicitud" }));
    expect(drawer.getByText("Aéreo")).toBeVisible();
    expect(drawer.getByText("Saldo informado").parentElement).toHaveTextContent("Saldo informado6");
  });
});
