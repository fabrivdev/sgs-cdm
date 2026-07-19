import { describe, expect, it } from "vitest";
import {
  aggregateNewSystemServiceOrders,
  buildServiceOrderLookup,
  crosswalkBillingRow,
  mapCanonicalOsToImportRow,
  mapOrdenesServicioSheet,
} from "@/lib/imports";

const sheet = {
  name: "Ordenes de Servicio",
  headers: [],
  rows: [
    {
      Sucursal: "01",
      "Nº OS": "00000021",
      ESTADO: "Cerrada",
      "Fc Abiert OS": "2026-06-24T00:00:00.000",
      Nombre: "SILONORTE E.A.S",
      MARCA: "CLA - CLAAS",
      TIPTEM: "CS - CLIENTE SERVICIOS",
      PRODUCTO: "MA01",
      CANTIDAD: "2:00 Hs.",
      DOCUMENTO: "0010010004798",
      TOTAL: "140",
    },
    {
      Sucursal: "01",
      "Nº OS": "00000021",
      ESTADO: "Cerrada",
      "Fc Abiert OS": "2026-06-24T00:00:00.000",
      Nombre: "SILONORTE E.A.S",
      MARCA: "CLA - CLAAS",
      TIPTEM: "GR - GARANTIA REPUESTOS",
      PRODUCTO: "SENSOR",
      CANTIDAD: "1",
      DOCUMENTO: "0010010004797",
      TOTAL: "316.11",
    },
    {
      Sucursal: "02",
      "Nº OS": "00000021",
      ESTADO: "Abierta",
      "Fc Abiert OS": "2026-07-10T00:00:00.000",
      Nombre: "OTRO CLIENTE",
      MARCA: "HOR - HORSCH",
      TIPTEM: "IS - INTERNO SERVICIOS",
      PRODUCTO: "MA01",
      CANTIDAD: "5:00 Hs.",
      DOCUMENTO: "0010000000013",
      TOTAL: "350",
    },
  ],
};

describe("importacion XML de ordenes de servicio", () => {
  it("usa sucursal como prefijo y reconoce el nuevo tipo Interno", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", sheet);

    expect(result.rows.map((row) => row.serviceOrderNumber)).toEqual([
      "01-00000021",
      "01-00000021",
      "02-00000021",
    ]);
    expect(result.rows[2].timeType).toBe("Interno");
    expect(result.rows[2].serviceHours).toBe(5);
  });

  it("mantiene separadas las facturas Cliente y Garantia de una OS mixta", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", sheet);
    const aggregated = aggregateNewSystemServiceOrders(result.rows.map(mapCanonicalOsToImportRow));
    const branchOne = aggregated.find((row) => row.os_numero === "01-00000021")!;
    const raw = branchOne.raw_data as any;

    expect(aggregated).toHaveLength(2);
    expect(branchOne.tipo_tiempo).toBe("Mixto");
    expect(branchOne.factura).toBe("0010010004798; 0010010004797");
    expect(raw.tipos_tiempo).toEqual(["Cliente", "Garantia"]);
    expect(raw.facturas_por_tipo).toEqual({
      Cliente: ["0010010004798"],
      Garantia: ["0010010004797"],
    });
  });

  it("clasifica cada factura por su documento aunque la OS sea mixta", () => {
    const rows = mapOrdenesServicioSheet("ordenes.xml", sheet).rows;
    const lookup = buildServiceOrderLookup(rows);
    const classify = (documentNumber: string) =>
      crosswalkBillingRow({
        billingRowId: documentNumber,
        documentNumber,
        serviceOrders: lookup,
        products: { byInternalCode: new Map(), byManufacturerCode: new Map() },
      }).inferredTimeType;

    expect(classify("0010010004798")).toBe("Cliente");
    expect(classify("0010010004797")).toBe("Garantia");
    expect(classify("0010000000013")).toBe("Interno");
  });
});
