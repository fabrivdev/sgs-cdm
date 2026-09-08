import { describe, expect, it } from "vitest";
import { isImportSaleInvoiced } from "./machineImportStatus";

describe("isImportSaleInvoiced", () => {
  it("prioriza la evidencia actual del parque sobre el valor historico de importacion", () => {
    expect(isImportSaleInvoiced({ venta_facturada: "FALSE", estado_disponibilidad: "EN_PARQUE" })).toBe(true);
  });

  it("mantiene como no facturada una importacion disponible sin evidencia de venta", () => {
    expect(isImportSaleInvoiced({ venta_facturada: "FALSE", estado_disponibilidad: "DISPONIBLE" })).toBe(false);
  });

  it("acepta los valores afirmativos importados", () => {
    expect(isImportSaleInvoiced({ venta_facturada: true, estado_disponibilidad: null })).toBe(true);
    expect(isImportSaleInvoiced({ venta_facturada: "SI", estado_disponibilidad: null })).toBe(true);
  });
});
