import { describe, expect, it } from "vitest";
import {
  billingSourceLineKey,
  sameAuditedCommercialLine,
  validateBillingSourceBatch,
} from "./billingLineStableReimport";

const line = (overrides: Record<string, unknown> = {}) => ({
  origen_sistema: "new_xml_facturacion_os",
  codigo_interno_factura: "SYN-DOC-001",
  factura: "SYN-DOC-001",
  sucursal: "SYNTHETIC BRANCH",
  cod_mercaderia: "SYN-PROD-001",
  entidad_nombre: "SYNTHETIC ENTITY",
  mercaderia: "SYNTHETIC ITEM",
  observacion: "SYNTHETIC ITEM",
  cantidad: 2,
  valor_unitario: 43.82,
  total_venta: 87.64,
  moneda: "GS",
  codigo_fabricante: "SYN-MFG-001",
  fecha_factura: "2026-08-01",
  raw_data: {
    ITEM: "01",
    FILIAL: "SYNTHETIC BRANCH",
    ESPECIE: "NF",
    canonical_document_kind: "Factura",
    linked_service_order: null,
  },
  ...overrides,
});

describe("prevalidacion de lineas TOTVS", () => {
  it("usa solo identidad declarada disponible y distingue tipo de documento", () => {
    expect(billingSourceLineKey(line())).toBe(
      "NEW_XML_FACTURACION|SYNTHETIC BRANCH|FACTURA|SYN-DOC-001|01",
    );
    expect(billingSourceLineKey(line({
      raw_data: { ...line().raw_data, canonical_document_kind: "NotaCredito" },
    }))).not.toBe(billingSourceLineKey(line()));
  });

  it("no cambia la identidad cuando el crosswalk reclasifica directa como OS", () => {
    expect(billingSourceLineKey(line({ origen_sistema: "new_xml_facturacion_directa" })))
      .toBe(billingSourceLineKey(line({ origen_sistema: "new_xml_facturacion_os" })));
  });

  it("usa Misiones como identidad canonica del alias 04 San Juan Bautista", () => {
    expect(billingSourceLineKey(line({ sucursal: "04 - San Juan Bautista" })))
      .toBe(billingSourceLineKey(line({ sucursal: "Misiones" })));
  });

  it("rechaza cualquier origen fuera del allowlist del importador", () => {
    expect(() => validateBillingSourceBatch([
      line({ origen_sistema: "new_xml_facturacion_otro" }),
    ])).toThrow(/Origen de facturacion TOTVS no permitido/);
  });

  it("preserva lineas legitimas con ITEM distinto", () => {
    const second = line({ raw_data: { ...line().raw_data, ITEM: "02" } });
    expect(validateBillingSourceBatch([line(), second]).rows).toHaveLength(2);
  });

  it("colapsa una repeticion exacta sin perder una linea legitima", () => {
    expect(validateBillingSourceBatch([line(), line()])).toEqual({
      rows: [line()],
      collapsedExactDuplicates: 1,
    });
  });

  it("aborta antes de persistir si el mismo ITEM cambia cantidad o importe", () => {
    expect(() => validateBillingSourceBatch([
      line(),
      line({ cantidad: 3, total_venta: 131.46 }),
    ])).toThrow(/Conflicto dentro del XML/);
  });

  it.each([
    { sucursal: null },
    { codigo_interno_factura: null, factura: null },
    { raw_data: { ...line().raw_data, ITEM: null } },
    { raw_data: { ...line().raw_data, canonical_document_kind: null } },
  ])("aborta si falta un componente fuente obligatorio: %o", (missing) => {
    expect(() => validateBillingSourceBatch([line(missing)])).toThrow(/sin identidad fuente completa/);
  });

  it("compara los valores comerciales y el vinculo OS", () => {
    expect(sameAuditedCommercialLine(line(), line())).toBe(true);
    expect(sameAuditedCommercialLine(line(), line({ moneda: "USD" }))).toBe(false);
    expect(sameAuditedCommercialLine(line(), line({ vendedor: "OTRO" }))).toBe(false);
    expect(sameAuditedCommercialLine(line(), line({
      raw_data: { ...line().raw_data, linked_service_order: "SYN-OS-001" },
    }))).toBe(false);
  });

  it("rechaza duplicados con distinta evidencia aunque coincida la clasificacion", () => {
    const first = line({ tipo_tiempo: null, raw_data: {
      ...line().raw_data, canonical_time_type_evidence: "missing",
      canonical_time_type_known_values: [], canonical_time_type_has_unknown: false,
    } });
    const other = { ...first, raw_data: {
      ...first.raw_data, canonical_time_type_evidence: "partial",
      canonical_time_type_known_values: ["Cliente"], canonical_time_type_has_unknown: true,
    } };
    expect(() => validateBillingSourceBatch([first, other])).toThrow(/Conflicto dentro del XML/);
    expect(() => validateBillingSourceBatch([other, first])).toThrow(/Conflicto dentro del XML/);
    expect(validateBillingSourceBatch([first, first]).collapsedExactDuplicates).toBe(1);
  });
});
