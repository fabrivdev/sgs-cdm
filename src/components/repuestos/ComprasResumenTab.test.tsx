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
    useComprasPedidosLineas: () => ({ data: [
      { fecha: "2026-08-04", sucursal: "Santa Rita", nroPedido: "100", productoCodigo: "REP02",
        proveedorNombre: "Proveedor", cantidad: 4, cantidadEntregada: 4, cantidadPendiente: 0 },
    ] }),
  };
});

describe("Resumen de compras", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }));
  afterEach(() => vi.unstubAllGlobals());
  it("mide la conversión con cobertura explícita y conserva recepción como etapa separada", () => {
    render(<ComprasResumenTab />);
    const card = screen.getByText("Ítems pasados a pedido").closest(".kpi-item");
    expect(card).toHaveTextContent(/50\s*%/);
    expect(card).toHaveTextContent("1 ítems sin datos");
    expect(screen.getByText("Ítems recibidos").closest(".kpi-item")).toHaveTextContent("De 1 ítems de pedidos cargados");
    const backlog = within(screen.getByRole("table", { name: "Necesidades pendientes" }));
    expect(backlog.getByRole("button", { name: "Detalle REP02" })).toBeVisible();
    expect(backlog.queryByText("REP03")).not.toBeInTheDocument();
    fireEvent.click(backlog.getByRole("button", { name: "Detalle REP02" }));
    expect(screen.getByText("Aéreo")).toBeVisible();
  });
});
