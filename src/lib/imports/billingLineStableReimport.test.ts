import { describe, expect, it } from "vitest";
import { billingSourceLineKey, planBillingStableReimport } from "./billingLineStableReimport";

const line = (overrides: Record<string, unknown> = {}) => ({
  id: "old-1",
  origen_sistema: "new_xml_facturacion_os",
  codigo_interno_factura: "0010010004812",
  factura: "0010010004812",
  sucursal: "SANTA RITA",
  cod_mercaderia: "REPIN002906",
  entidad_nombre: "CLIENTE",
  mercaderia: "REPUESTO",
  observacion: "REPUESTO",
  cantidad: 2,
  valor_unitario: 43.82,
  total_venta: 87.64,
  moneda: null,
  codigo_fabricante: null,
  fecha_factura: null,
  raw_data: { ITEM: "01", FILIAL: "SANTA RITA" },
  ...overrides,
});

describe("identidad estable de lineas TOTVS", () => {
  it("no depende de fecha, fabricante ni orden fisico del archivo", () => {
    expect(billingSourceLineKey(line())).toBe(
      billingSourceLineKey(line({ fecha_factura: "2026-07-20", codigo_fabricante: "1503220" })),
    );
  });

  it("conserva dos lineas legitimas del mismo producto con distinto ITEM", () => {
    expect(billingSourceLineKey(line())).not.toBe(
      billingSourceLineKey(line({ id: "old-2", raw_data: { ITEM: "02", FILIAL: "SANTA RITA" } })),
    );
  });

  it("actualiza una unica copia incompleta cuando lo comercial coincide", () => {
    const enriched = line({ id: undefined, fecha_factura: "2026-07-20", moneda: "USD", codigo_fabricante: "1503220" });
    expect(planBillingStableReimport([line()], [enriched])).toEqual({
      insert: [],
      update: [{ id: "old-1", row: enriched }],
    });
  });

  it("mantiene el upsert normal cuando ya existe el hash enriquecido", () => {
    const enriched = line({ id: undefined, fecha_factura: "2026-07-20", moneda: "USD", codigo_fabricante: "1503220" });
    const existing = line({ id: "new-1", fecha_factura: "2026-07-20", moneda: "USD", codigo_fabricante: "1503220" });
    expect(planBillingStableReimport([existing], [enriched])).toEqual({ insert: [enriched], update: [] });
  });

  it("aborta ante varias copias sin una coincidencia exacta", () => {
    const incoming = line({ id: undefined, codigo_fabricante: "NUEVO" });
    expect(() => planBillingStableReimport([
      line(),
      line({ id: "old-2", codigo_fabricante: "OTRO" }),
    ], [incoming])).toThrow(/Requiere auditoria/);
  });

  it("aborta si cantidad o importe cambiaron en una supuesta unica linea", () => {
    expect(() => planBillingStableReimport([line()], [
      line({ id: undefined, cantidad: 3, total_venta: 131.46, codigo_fabricante: "1503220" }),
    ])).toThrow(/Requiere auditoria/);
  });
});
