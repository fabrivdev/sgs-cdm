import { describe, expect, it } from "vitest";
import { isSafeEnrichmentDuplicatePair } from "./billingDuplicateRepairRules";

const row = (overrides: Record<string, unknown> = {}) => ({
  origen_sistema: "new_xml_facturacion_os", codigo_interno_factura: "0010010004812", factura: "0010010004812",
  sucursal: "SANTA RITA", cod_mercaderia: "REPIN002906", entidad_nombre: "CLIENTE",
  mercaderia: "REPUESTO", observacion: "REPUESTO", cantidad: 2, valor_unitario: 43.82,
  total_venta: 87.64, moneda: null, codigo_fabricante: null, fecha_factura: null,
  raw_data: { ITEM: "01", FILIAL: "SANTA RITA", ESPECIE: "NF" }, importacion_id: "old", ...overrides,
});

describe("reglas de reparacion automatica", () => {
  it("acepta solo el enriquecimiento equivalente auditado", () => {
    expect(isSafeEnrichmentDuplicatePair(row(), row({
      importacion_id: "new", fecha_factura: "2026-07-20", moneda: "USD", codigo_fabricante: "1503220",
    }))).toBe(true);
  });
  it("excluye NCC aunque compartan documento e ITEM", () => {
    expect(isSafeEnrichmentDuplicatePair(
      row({ cantidad: -2, total_venta: -87.64, raw_data: { ITEM: "01", FILIAL: "SANTA RITA", ESPECIE: "NCC" } }),
      row({ importacion_id: "new", fecha_factura: "2026-07-20", cantidad: -2, total_venta: -87.64 }),
    )).toBe(false);
  });
  it("preserva ITEM distintos y rechaza cantidades o importes diferentes", () => {
    expect(isSafeEnrichmentDuplicatePair(row(), row({
      importacion_id: "new", fecha_factura: "2026-07-20", raw_data: { ITEM: "02", FILIAL: "SANTA RITA" },
    }))).toBe(false);
    expect(isSafeEnrichmentDuplicatePair(row(), row({
      importacion_id: "new", fecha_factura: "2026-07-20", cantidad: 3, total_venta: 131.46,
    }))).toBe(false);
    expect(isSafeEnrichmentDuplicatePair(row({ valor_unitario: null }), row({
      importacion_id: "new", fecha_factura: "2026-07-20", valor_unitario: 0,
    }))).toBe(false);
  });
  it("no mezcla dos monedas explicitas ni filas de la misma importacion", () => {
    expect(isSafeEnrichmentDuplicatePair(row({ moneda: "PYG" }), row({
      importacion_id: "new", fecha_factura: "2026-07-20", moneda: "USD",
    }))).toBe(false);
    expect(isSafeEnrichmentDuplicatePair(row(), row({ fecha_factura: "2026-07-20" }))).toBe(false);
  });
});
