import { describe, expect, it } from "vitest";
import { buildServiceOrderLookup, crosswalkBillingRow } from "./mappings";
import { mapOrdenesServicioSheet } from "./newSystemXml";

const emptyProducts = {
  byInternalCode: new Map(),
  byManufacturerCode: new Map(),
};

describe("evidencia sintetica del crosswalk de facturacion", () => {
  it("clasifica por evidencia de linea y conserva la incertidumbre", () => {
    const serviceOrders = buildServiceOrderLookup(mapOrdenesServicioSheet("synthetic-orders.xml", {
      name: "SyntheticOrders",
      headers: [],
      rows: [
        {
          Sucursal: "01", "NRO OS": "SYN-OS-100", DOCUMENTO: "SYN-DOC-100",
          ITEM: "01", CODIGO: "SYN-LAB", PRODUCTO: "SYNTHETIC LABOR",
          GRUPO: "SERVICIOS", TIPTEM: "GS - GARANTIA SERVICIOS", MARCA: "CLAAS",
        },
        {
          Sucursal: "01", "NRO OS": "SYN-OS-100", DOCUMENTO: "SYN-DOC-100",
          ITEM: "02", CODIGO: "SYN-LAB", PRODUCTO: "SYNTHETIC LABOR",
          GRUPO: "SERVICIOS", TIPTEM: "", MARCA: "CLAAS",
        },
      ],
    }).rows);

    const result = crosswalkBillingRow({
      billingRowId: "synthetic-line",
      documentNumber: "SYN-DOC-100",
      productCode: "SYN-LAB",
      productGroup: "SERVICIOS",
      description: "SYNTHETIC LABOR",
      serviceOrders,
      products: emptyProducts,
    });

    expect(result.inferredTimeType).toBe("Garantia");
    expect(result.timeTypeEvidence).toBe("partial");
    expect(result.knownTimeTypes).toEqual(["Garantia"]);
    expect(result.hasUnknownTimeType).toBe(true);
    expect(result.productBrandEvidence).toBe("service_order");
  });

  it("no inventa Cliente cuando no existe una OS coincidente", () => {
    const result = crosswalkBillingRow({
      billingRowId: "synthetic-unmatched",
      documentNumber: "SYN-DOC-NONE",
      productCode: "SYN-PROD-NONE",
      productGroup: "SERVICIOS",
      description: "SYNTHETIC SERVICE",
      billingTimeType: "Desconocido",
      billingProductBrand: "HORSCH",
      serviceOrders: buildServiceOrderLookup([]),
      products: emptyProducts,
    });

    expect(result.inferredTimeType).toBe("Desconocido");
    expect(result.timeTypeEvidence).toBe("missing");
    expect(result.serviceOrderEvidence).toBe("missing");
    expect(result.productBrand).toBe("HORSCH");
    expect(result.productBrandEvidence).toBe("billing");
  });
});
