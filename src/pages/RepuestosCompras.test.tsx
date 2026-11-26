import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RepuestosCompras from "./RepuestosCompras";

vi.mock("@/components/repuestos/ComprasPedidosTab", () => ({ ComprasPedidosTab: () => <div>Pedidos</div> }));
vi.mock("@/components/repuestos/SolicitudesCompraTab", () => ({ SolicitudesCompraTab: () => <div>Solicitudes</div> }));

describe("Compras", () => {
  it("shows only Pedidos and Solicitudes in the page header, opening on Pedidos", () => {
    render(<RepuestosCompras />);
    expect(screen.getByRole("heading", { name: "Compras" }).closest("header"))
      .toContainElement(screen.getByRole("tablist", { name: "Vistas de compras" }));
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Pedidos", "Solicitudes"]);
    expect(screen.getByRole("tab", { name: "Pedidos" })).toHaveAttribute("aria-selected", "true");
  });
});
