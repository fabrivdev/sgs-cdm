import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RepuestosCompras from "./RepuestosCompras";

vi.mock("@/components/repuestos/ComprasPedidosTab", () => ({ ComprasPedidosTab: () => <div>Pedidos</div> }));
vi.mock("@/components/repuestos/ComprasResumenTab", () => ({ ComprasResumenTab: () => <div>Resumen de compras</div> }));
vi.mock("@/components/repuestos/SolicitudesCompraTab", () => ({ SolicitudesCompraTab: () => <div>Solicitudes</div> }));

describe("Compras", () => {
  it("keeps its tabs in the page header", () => {
    render(<RepuestosCompras />);
    expect(screen.getByRole("heading", { name: "Compras" }).closest("header"))
      .toContainElement(screen.getByRole("tablist", { name: "Vistas de compras" }));
    expect(screen.getByText("Resumen de compras")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Saldos TOTVS" })).toHaveAttribute("aria-selected", "true");
  });
});
