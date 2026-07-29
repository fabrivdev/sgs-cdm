import { describe, expect, it } from "vitest";
import {
  aggregateNewSystemServiceOrders,
  buildProductLookup,
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

  it("parsea FCHCIERRE en formato compacto yyyymmdd, distinto del ISO de Fc Abiert OS", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [{
        Sucursal: "01",
        "Nº OS": "00000001",
        ESTADO: "Cerrada",
        "Fc Abiert OS": "2026-06-22T00:00:00.000",
        FCHCIERRE: "20260708",
        Propietario: "SILONORTE E.A.S",
      }],
    });

    expect(result.rows[0].openDate).toBe("2026-06-22");
    expect(result.rows[0].closeDate).toBe("2026-07-08");
  });

  it("deja closeDate en null cuando FCHCIERRE viene vacio (OS todavia abierta)", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [{
        Sucursal: "02",
        "Nº OS": "00000021",
        ESTADO: "Abierta",
        "Fc Abiert OS": "2026-07-10T00:00:00.000",
        FCHCIERRE: "",
      }],
    });

    expect(result.rows[0].closeDate).toBeNull();
  });

  it("deduplica FCHCIERRE por numero de OS al agregar varias lineas: se queda con el primer valor no nulo", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [
        {
          Sucursal: "01",
          "Nº OS": "00000030",
          ESTADO: "Cerrada",
          "Fc Abiert OS": "2026-06-01T00:00:00.000",
          FCHCIERRE: "",
          PRODUCTO: "MA01",
          TOTAL: "10",
        },
        {
          Sucursal: "01",
          "Nº OS": "00000030",
          ESTADO: "Cerrada",
          "Fc Abiert OS": "2026-06-01T00:00:00.000",
          FCHCIERRE: "20260615",
          PRODUCTO: "SE01",
          TOTAL: "20",
        },
      ],
    });

    const aggregated = aggregateNewSystemServiceOrders(result.rows.map(mapCanonicalOsToImportRow));
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].fecha_cierre_os).toBe("2026-06-15");
  });

  it("conserva el total de una linea SE como servicio", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [{
        Sucursal: "02",
        "NÂº OS": "00000019",
        ESTADO: "Cerrada",
        "Fc Abiert OS": "2026-07-21T00:00:00.000",
        GRUPO: "CO - COSECHADORA",
        PRODUCTO: "SE01",
        CANTIDAD: "1",
        TOTAL: "66",
        MONEDA: "2 - Dolares",
      }],
    });

    expect(result.rows[0].serviceOrderNumber).toBe("02-00000019");
    expect(result.rows[0].serviceValue).toBe(66);
    expect(result.rows[0].thirdPartyValue).toBe(0);
  });

  it("no suma cantidades de repuestos del grupo sembradora como horas de servicio", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [
        {
          Sucursal: "01",
          "NÂº OS": "00000016",
          "Fc Abiert OS": "2026-07-14T00:00:00.000",
          GRUPO: "SE - SEMBRADORA",
          CODIGO: "REPIN003344",
          CODFAB: "24767405",
          PRODUCTO: "CASQUILLO 24X3.5 6GV 24767405",
          TECNICO: "JUAN PATINO",
          CANTIDAD: "72",
          TOTAL: "38.88",
        },
        {
          Sucursal: "01",
          "NÂº OS": "00000016",
          "Fc Abiert OS": "2026-07-14T00:00:00.000",
          GRUPO: "SE - SEMBRADORA",
          CODIGO: "-------",
          CODFAB: "-------",
          PRODUCTO: "MA01",
          TECNICO: "JUAN PATINO",
          CANTIDAD: "2:00 Hs.",
          TOTAL: "120",
        },
      ],
    });

    expect(result.rows[0]).toMatchObject({
      serviceHours: 0,
      serviceValue: 0,
      sparePartsValue: 38.88,
    });
    expect(result.rows[1]).toMatchObject({
      serviceHours: 2,
      serviceValue: 120,
      sparePartsValue: 0,
    });

    const aggregated = aggregateNewSystemServiceOrders(result.rows.map(mapCanonicalOsToImportRow));
    expect(aggregated[0].servicios_cantidad).toBe(2);
    expect((aggregated[0].raw_data as any).totales_por_tecnico["JUAN PATINO"].horas).toBe(2);
  });

  it("incorpora auxiliares y asigna el kilometraje al responsable principal", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [
        {
          Sucursal: "02",
          "NÂº OS": "00000002",
          PRODUCTO: "MA01",
          TECNICO: "ME0001 - EDER ESQUIVEL",
          TECAUX001: "ME0006 - ANIBAL VILLALBA",
          TECAUX002: "ME0005 - HUGO RODAS",
          CANTIDAD: "2:00 Hs.",
          TOTAL: "140",
        },
        {
          Sucursal: "02",
          "NÂº OS": "00000002",
          PRODUCTO: "KM01",
          TECNICO: "-------",
          TECAUX001: "ME0006 - ANIBAL VILLALBA",
          TECAUX002: "ME0005 - HUGO RODAS",
          CANTIDAD: "14 Km.",
          TOTAL: "8.4",
        },
      ],
    });

    expect(result.rows[0].auxiliaryTechnicians).toEqual([
      "ME0006 - ANIBAL VILLALBA",
      "ME0005 - HUGO RODAS",
    ]);

    const [aggregated] = aggregateNewSystemServiceOrders(result.rows.map(mapCanonicalOsToImportRow));
    const raw = aggregated.raw_data as any;
    expect(aggregated.responsable).toBe("ME0001 - EDER ESQUIVEL");
    expect(raw.tecnicos_participantes).toEqual([
      "ME0001 - EDER ESQUIVEL",
      "ME0006 - ANIBAL VILLALBA",
      "ME0005 - HUGO RODAS",
    ]);
    expect(raw.totales_por_tecnico["ME0001 - EDER ESQUIVEL"]).toMatchObject({ horas: 2, kilometros: 14 });
    expect(raw.totales_por_tecnico["ME0006 - ANIBAL VILLALBA"]).toMatchObject({ horas: 2, kilometros: 0 });
    expect(raw.totales_por_tecnico["ME0005 - HUGO RODAS"]).toMatchObject({ horas: 2, kilometros: 0 });
    expect(raw.requiere_asignacion_tecnico).toBe(false);
    expect(raw.kilometros_sin_tecnico).toBe(0);
  });

  it("mantiene una OS sin responsable aunque tenga auxiliares", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [
        {
          Sucursal: "01",
          "NÂº OS": "00000012",
          PRODUCTO: "MA01",
          TECNICO: "-------",
          TECAUX001: "ME0022 - RUBEN LUGO",
          TECAUX002: "-------",
          CANTIDAD: "3:00 Hs.",
          TOTAL: "180",
        },
        {
          Sucursal: "01",
          "NÂº OS": "00000012",
          PRODUCTO: "KM01",
          TECNICO: "-------",
          TECAUX001: "ME0022 - RUBEN LUGO",
          TECAUX002: "-------",
          CANTIDAD: "696 Km.",
          TOTAL: "417.6",
        },
      ],
    });

    const [aggregated] = aggregateNewSystemServiceOrders(result.rows.map(mapCanonicalOsToImportRow));
    const raw = aggregated.raw_data as any;
    expect(aggregated.responsable).toBeNull();
    expect(raw.tecnicos_responsables).toEqual([]);
    expect(raw.tecnicos_auxiliares).toEqual(["ME0022 - RUBEN LUGO"]);
    expect(raw.tecnicos_participantes).toEqual(["ME0022 - RUBEN LUGO"]);
    expect(raw.totales_por_tecnico["ME0022 - RUBEN LUGO"]).toMatchObject({ horas: 3, kilometros: 0 });
    expect(raw.requiere_asignacion_tecnico).toBe(true);
    expect(raw.kilometros_sin_tecnico).toBe(696);
    expect(raw.valor_kilometraje_sin_tecnico).toBe(417.6);
  });

  it("conserva como terceros el total de una linea realmente no clasificada", () => {
    const result = mapOrdenesServicioSheet("ordenes.xml", {
      name: "Ordenes de Servicio",
      headers: [],
      rows: [{
        Sucursal: "02",
        "NÂº OS": "00000020",
        GRUPO: "OTROS",
        PRODUCTO: "COURIER",
        CANTIDAD: "1",
        TOTAL: "25",
      }],
    });

    expect(result.rows[0].serviceValue).toBe(0);
    expect(result.rows[0].thirdPartyValue).toBe(25);
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

  it("prioriza la marca de la OS para Servicio y conserva la del producto para Repuestos", () => {
    const serviceOrders = buildServiceOrderLookup(mapOrdenesServicioSheet("ordenes.xml", sheet).rows);
    const products = buildProductLookup([
      {
        rowId: "product-service",
        internalCode: "SRV000006",
        manufacturerCode: null,
        description: "SERV. DE MANO DE OBRA - CLAAS",
        brand: "CLAAS",
        group: "SERVICIOS",
        family: null,
        unit: "HS",
        isActive: true,
        raw: {},
      },
      {
        rowId: "product-part",
        internalCode: "REP000001",
        manufacturerCode: "CLAAS-001",
        description: "REPUESTO CLAAS",
        brand: "CLAAS",
        group: "REPUESTOS",
        family: null,
        unit: "UN",
        isActive: true,
        raw: {},
      },
      {
        rowId: "product-km",
        internalCode: "KM000001",
        manufacturerCode: null,
        description: "KILOMETRAJE CLAAS",
        brand: "CLAAS",
        group: "KILOMETRAJE",
        family: null,
        unit: "KM",
        isActive: true,
        raw: {},
      },
    ]);

    const service = crosswalkBillingRow({
      billingRowId: "billing-service",
      documentNumber: "0010000000013",
      productCode: "SRV000006",
      productGroup: "SERVICIOS",
      description: "SERV. DE MANO DE OBRA - CLAAS",
      serviceOrders,
      products,
    });
    const sparePart = crosswalkBillingRow({
      billingRowId: "billing-part",
      documentNumber: "0010000000013",
      productCode: "REP000001",
      manufacturerCode: "CLAAS-001",
      productGroup: "REPUESTOS",
      description: "REPUESTO CLAAS",
      serviceOrders,
      products,
    });
    const kilometre = crosswalkBillingRow({
      billingRowId: "billing-km",
      documentNumber: "0010000000013",
      productCode: "KM000001",
      productGroup: "KILOMETRAJE",
      description: "KILOMETRAJE CLAAS",
      serviceOrders,
      products,
    });

    expect(service.inferredLineType).toBe("Servicio");
    expect(service.productBrand).toBe("HORSCH");
    expect(kilometre.inferredLineType).toBe("Kilometraje");
    expect(kilometre.productBrand).toBe("HORSCH");
    expect(sparePart.inferredLineType).toBe("Repuestos");
    expect(sparePart.productBrand).toBe("CLAAS");
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

  it("preserva fechas compactas, notas de credito negativas y clasifica maquinarias", () => {
    const result = mapFacturaVentasSheet("facturas.xml", {
      name: "Facturas",
      headers: [],
      rows: [{
        FILIAL: "01",
        EMISION: "20260720",
        FCHVEN: "20260820",
        ESPECIE: "NCC",
        DOCUMENTO: "0010010004900",
        NOMBRE: "CLIENTE",
        MONORI: "Dolares",
        MARCA: "-",
        GRUPO: "002 - PICADORAS",
        CODIGO: "VEIC_000001",
        CODFAB: "JAGUAR-001",
        PRODUCTO: "Tipo: PICADORA Marca: CLAAS Modelo: JAGUAR Casis: 123456",
        TOTALUSD: "-100",
        VUNITUSD: "-100",
        TIPOES: "IVA 10%",
      }],
    });

    expect(result.rows[0]).toMatchObject({
      emissionDate: "2026-07-20",
      dueDate: "2026-08-20",
      lineType: "Maquinarias",
      productGroup: "002 - PICADORAS",
      productBrand: "CLAAS",
      manufacturerCode: "JAGUAR-001",
      totalValueBase: -100,
      totalValueWithIva: -110,
    });
  });
});
