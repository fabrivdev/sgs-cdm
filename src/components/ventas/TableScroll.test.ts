import { describe, expect, it } from "vitest";
import { salesHeader } from "./TableScroll";
import { salesColumnClass } from "./salesTableFormat";

describe("sales column alignment", () => {
  it.each(["Marca", "Condición", "Cliente facturado", "Vendedor", "Descripción", "Factura", "Chasis", "Código", "Última venta"])("left-aligns text: %s", label => {
    expect(salesColumnClass(label)).toBe("text-left");
  });
  it.each(["Vendidas", "Nota Cr.", "Netas", "Clientes", "Facturas", "Documentos", "Cantidad", "Unidades netas", "Horas OS", "Total horas", "Km OS", "ABC"])("centers quantities: %s", label => {
    expect(salesColumnClass(label)).toBe("text-center");
  });
  it.each(["Facturado", "Facturación neta", "Mano de obra", "MO Cliente asociada", "Ticket Medio", "Notas de crédito", "Variación LM", "Participación neta", "Total OS"])("right-aligns amounts and percentages: %s", label => {
    expect(salesColumnClass(label)).toBe("text-right");
  });
  it("supports a count of credit notes and an OS identifier without confusing their meanings", () => {
    expect(salesColumnClass("Notas de crédito", "quantity")).toBe("text-center");
    expect(salesColumnClass("OS", "text")).toBe("text-left");
    expect(salesHeader).not.toContain("[&_th]:text-center");
    expect(salesHeader).toContain("border-border/40");
  });
});
