import { describe, expect, it } from "vitest";
import { salesHeader, scrollTableClass } from "./TableScroll";
import { salesColumnClass } from "./salesTableFormat";

describe("sales column alignment", () => {
  it("uses page scrolling on mobile and caps the viewport from md after twenty rows", () => {
    expect(scrollTableClass(20)).toBeUndefined();
    const classes = scrollTableClass(21)?.split(" ") ?? [];
    expect(classes).toContain("overflow-x-auto");
    expect(classes).toContain("md:max-h-[480px]");
    expect(classes).toContain("md:overflow-y-auto");
    expect(classes).toContain("md:[scrollbar-gutter:stable]");
    expect(classes).not.toContain("max-h-[56vh]");
    expect(classes).not.toContain("overflow-y-auto");
    expect(classes).not.toContain("[scrollbar-gutter:stable]");
  });
  it.each(["Marca", "Condición", "Cliente facturado", "Vendedor", "Descripción", "Factura", "Chasis", "Código", "Última venta"])("left-aligns text: %s", label => {
    expect(salesColumnClass(label)).toBe("text-left");
  });
  it.each(["Vendidas", "Nota Cr.", "Netas", "Clientes", "Facturas", "Documentos", "Cantidad", "Unidades netas", "Horas OS", "Total horas", "Km OS", "ABC"])("centers quantities: %s", label => {
    expect(salesColumnClass(label)).toBe("text-center");
  });
  it.each(["Facturado", "Facturación neta", "Mano de obra", "MO Cliente", "Ticket Medio", "Notas de crédito", "Variación LM", "Participación neta", "Total OS"])("right-aligns amounts and percentages: %s", label => {
    expect(salesColumnClass(label)).toBe("text-right");
  });
  it("supports a count of credit notes and an OS identifier without confusing their meanings", () => {
    expect(salesColumnClass("Notas de crédito", "quantity")).toBe("text-center");
    expect(salesColumnClass("OS", "text")).toBe("text-left");
    expect(salesHeader).not.toContain("[&_th]:text-center");
    expect(salesHeader).toContain("border-border/40");
  });
});
