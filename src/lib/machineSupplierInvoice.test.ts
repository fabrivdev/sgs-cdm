import { describe, expect, it } from "vitest";
import { extractMachineSupplierInvoice, machineSupplierInvoiceExtractionStatus, machineSupplierInvoicePatch } from "./machineSupplierInvoice";

describe("machine supplier invoice extraction", () => {
  it("reads the standard Horsch invoice fields without using the OC suffix", () => {
    const extracted = extractMachineSupplierInvoice(`
      Factura Fecha del documento: 17.09.2026 Numero 230463.E26100016
      Moneda USD Chassi/Serie: TEST27211292
      Precio Total $ 329.725,38 Total $ 329.725,38
    `, "Invoice 230463 - NF 40396.pdf");
    expect(extracted).toEqual({
      factura_numero: "230463", factura_fecha: "2026-09-17", moneda: "USD",
      valor_facturado: 329725.38, valor_facturado_estado: "confiable", chasis: ["TEST27211292"],
    });
    expect(machineSupplierInvoicePatch(extracted)).toEqual({
      invoice_supplier: "230463", factura_proveedor_fecha: "2026-09-17",
      factura_proveedor_moneda: "USD", valor_factura_proveedor: "329725.38",
    });
  });

  it("uses the file name only as a fallback and preserves partial results", () => {
    const extracted = extractMachineSupplierInvoice("Currency EUR Total EUR 1,250.50", "Invoice 778899.pdf");
    expect(extracted.factura_numero).toBe("778899");
    expect(extracted.moneda).toBe("EUR");
    expect(extracted.valor_facturado).toBe(1250.5);
    expect(extracted.valor_facturado_estado).toBe("confiable");
    expect(extracted.factura_fecha).toBeNull();
  });

  it("prefers the contextual invoice total over Horsch product codes", () => {
    const extracted = extractMachineSupplierInvoice(`
      Factura Numero 230454 Fecha del documento: 26.08.2026 Moneda USD
      Producto 24004904 Descripcion Maestro 24 SW
      Precio Total USD 205.413,03
      Referencia $ 24004904 Item 00347821
    `);

    expect(extracted.valor_facturado).toBe(205413.03);
    expect(extracted.valor_facturado_estado).toBe("confiable");
    expect(machineSupplierInvoicePatch(extracted).valor_factura_proveedor).toBe("205413.03");
  });

  it("does not treat long unformatted product codes as money", () => {
    const extracted = extractMachineSupplierInvoice("Currency USD Product code USD 00347821 Part $ 24004904");

    expect(extracted.valor_facturado).toBeNull();
    expect(extracted.valor_facturado_estado).toBe("ausente");
    expect(machineSupplierInvoicePatch(extracted)).not.toHaveProperty("valor_factura_proveedor");
  });

  it("leaves different totals ambiguous and excludes the amount from the patch", () => {
    const extracted = extractMachineSupplierInvoice(`
      Invoice 230400 Currency USD
      Total USD 206,125.22
      Total USD 205,413.03
    `);

    expect(extracted.valor_facturado).toBeNull();
    expect(extracted.valor_facturado_estado).toBe("ambiguo");
    expect(machineSupplierInvoiceExtractionStatus(extracted)).toBe("PENDIENTE");
    expect(machineSupplierInvoicePatch(extracted)).toEqual({
      invoice_supplier: "230400",
      factura_proveedor_moneda: "USD",
    });
  });

  it("uses the currency attached to the strongest total when the document mentions more than one", () => {
    const extracted = extractMachineSupplierInvoice(`
      Reference EUR 999.999,99
      Invoice Total USD 205,413.03
    `);

    expect(extracted.moneda).toBe("USD");
    expect(extracted.valor_facturado).toBe(205413.03);
    expect(extracted.valor_facturado_estado).toBe("confiable");
    expect(machineSupplierInvoiceExtractionStatus(extracted)).toBe("EXTRAIDO");
  });

  it.each([
    ["Total USD 205.413,03", "USD", 205413.03],
    ["Total USD 205,413.03", "USD", 205413.03],
    ["Total EUR 1.250,50", "EUR", 1250.5],
    ["Total GS. 1.250.000", "PYG", 1250000],
  ] as const)("preserves localized monetary formats: %s", (text, currency, amount) => {
    const extracted = extractMachineSupplierInvoice(text);
    expect(extracted.moneda).toBe(currency);
    expect(extracted.valor_facturado).toBe(amount);
    expect(extracted.valor_facturado_estado).toBe("confiable");
  });
});
