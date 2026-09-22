import { describe, expect, it } from "vitest";
import { extractMachineSupplierInvoice, machineSupplierInvoicePatch } from "./machineSupplierInvoice";

describe("machine supplier invoice extraction", () => {
  it("reads the standard Horsch invoice fields without using the OC suffix", () => {
    const extracted = extractMachineSupplierInvoice(`
      Factura Fecha del documento: 17.09.2026 Numero 230463.E26100016
      Moneda USD Chassi/Serie: TEST27211292
      Precio Total $ 329.725,38 Total $ 329.725,38
    `, "Invoice 230463 - NF 40396.pdf");
    expect(extracted).toEqual({
      factura_numero: "230463", factura_fecha: "2026-09-17", moneda: "USD",
      valor_facturado: 329725.38, chasis: ["TEST27211292"],
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
    expect(extracted.factura_fecha).toBeNull();
  });
});
