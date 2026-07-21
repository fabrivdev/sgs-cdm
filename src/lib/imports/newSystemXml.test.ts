import { describe, expect, it } from "vitest";
import {
  aggregateNewSystemServiceOrders,
  buildServiceOrderLookup,
  crosswalkBillingRow,
  mapFacturaVentasSheet,
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
      TECNICO: "ME0017 - JUAN PATINO",
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
      TECNICO: "ME0016 - GUSTAVO ARCE",
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

  it("normaliza una OS liberada como abierta y conserva sus nuevos metadatos", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [{
        Sucursal: "01",
        "Nº OS": "00000055",
        ESTADO: "Liberada",
        "Nro. Interno": "INT-55",
        "Fch. Inicial": "2026-07-20T00:00:00.000",
        "Hora Inicial": "08:30",
        "Fch. Final": "2026-07-20T00:00:00.000",
        "Hora Final": "10:15",
        PIEZAS: "Piezas Pendientes",
        ORIGEN: "Presupuesto",
      }],
    });

    expect(result.rows[0].serviceOrderNumber).toBe("01-00000055");
    expect(result.rows[0].status).toBe("Abierta");
    expect(result.rows[0].raw).toMatchObject({
      canonical_internal_number: "INT-55",
      canonical_start_date: "2026-07-20",
      canonical_start_time: "08:30",
      canonical_end_date: "2026-07-20",
      canonical_end_time: "10:15",
      canonical_parts_status: "Piezas Pendientes",
      canonical_origin: "Presupuesto",
    });
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
    expect(raw.tecnicos_participantes).toEqual([
      "ME0017 - JUAN PATINO",
      "ME0016 - GUSTAVO ARCE",
    ]);
    expect(raw.totales_por_tecnico["ME0017 - JUAN PATINO"].horas).toBe(2);
    expect(raw.totales_por_tecnico["ME0016 - GUSTAVO ARCE"].horas).toBe(0);
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

describe("importacion XML de facturacion", () => {
  it("resta notas de credito y no usa la factura original como numero propio", () => {
    const result = mapFacturaVentasSheet("facturas.xml", {
      name: "Facturas",
      headers: [],
      rows: [{
        EMISION: "2026-07-20T00:00:00.000",
        ESPECIE: "NCC",
        DOCUMENTO: "0010010000426",
        NFORI: "FE1 - 0010010004175",
        NOMBRE: "CLIENTE",
        MONORI: "Dolares",
        TOTALUSD: "100",
        VUNITUSD: "100",
        TIPOES: "IVA 10%",
      }],
    });

    expect(result.rows[0].invoiceShortNumber).toBe("0010010000426");
    expect(result.rows[0].totalValueWithIva).toBe(-110);
    expect(result.rows[0].unitValueWithIva).toBe(-110);
    expect(result.rows[0].raw).toMatchObject({
      original_invoice_number: "FE1 - 0010010004175",
      canonical_document_kind: "NotaCredito",
    });
  });

  it("prioriza el total USD disponible aunque la moneda de origen sea guaranies", () => {
    const result = mapFacturaVentasSheet("facturas.xml", {
      name: "Facturas",
      headers: [],
      rows: [{
        EMISION: "2026-07-20T00:00:00.000",
        ESPECIE: "NF",
        DOCUMENTO: "0010010004805",
        NOMBRE: "CLIENTE",
        MONORI: "Guaranies",
        TOTALGS: "836364",
        VUNITGS: "836364",
        TOTALUSD: "138.04",
        VUNITUSD: "138.04",
        TIPOES: "IVA 10%",
      }],
    });

    expect(result.rows[0].currency).toBe("USD");
    expect(result.rows[0].totalValueBase).toBe(138.04);
    expect(result.rows[0].totalValueWithIva).toBe(151.84);
  });
});
