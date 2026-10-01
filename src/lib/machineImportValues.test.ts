import { describe, expect, it } from "vitest";
import { importHasMultipleUnits, importInvoiceDifference, importNetOrderValue, importUnitForm, importUnitPatch, validImportAmount } from "./machineImportValues";

describe("Importaciones: OC, factura y costo separados", () => {
  it("solo presenta opciones generales/individuales cuando hay varias unidades", () => {
    expect(importHasMultipleUnits(1)).toBe(false);
    expect(importHasMultipleUnits(null)).toBe(false);
    expect(importHasMultipleUnits(undefined)).toBe(false);
    expect(importHasMultipleUnits(0)).toBe(false);
    expect(importHasMultipleUnits(3)).toBe(true);
  });
  it("compara con centavos y conserva cero como importe real", () => {
    expect(importInvoiceDifference(100, "USD", 100.01, "USD")).toBe(0.01);
    expect(importInvoiceDifference(0, "USD", 0, "USD")).toBe(0);
    expect(importInvoiceDifference(100, "EUR", 90, "EUR")).toBe(-10);
  });
  it("no inventa diferencias cuando falta un importe o difieren monedas", () => {
    expect(importInvoiceDifference(null, "USD", 100, "USD")).toBeNull();
    expect(importInvoiceDifference(100, "EUR", 100, "USD")).toBeNull();
    expect(importInvoiceDifference(100, undefined, 100, "USD")).toBeNull();
  });
  it("muestra el neto de origen sin recalcularlo desde un bruto ya redondeado", () => {
    expect(importNetOrderValue({
      unitGrossValue: 218636.3,
      generalGrossValue: 218636.3,
      sourceGrossValue: 218636.3,
      sourceNetValue: 205518.1,
      discountPercentage: 6,
    })).toBe(205518.1);
  });
  it("aplica el descuento cuando no existe un neto de origen", () => {
    expect(importNetOrderValue({ unitGrossValue: 200, discountPercentage: 6 })).toBe(188);
    expect(importNetOrderValue({ unitGrossValue: 218636.267307, discountPercentage: 6 })).toBe(205518.09);
    expect(importNetOrderValue({ unitGrossValue: 200 })).toBe(200);
  });
  it("prorratea el neto en valores OC totales y conserva overrides manuales", () => {
    const source = { generalGrossValue: 300, sourceGrossValue: 300, sourceNetValue: 282, discountPercentage: 6, orderValueScope: "TOTAL", unitCount: 3, unitNumber: 1 };
    expect(importNetOrderValue({ unitGrossValue: 100, ...source })).toBe(94);
    expect(importNetOrderValue({ unitGrossValue: 120, ...source, manualOverride: true })).toBe(120);
  });
  it("no interpreta como unitario el neto total de un lote CLAAS", () => {
    expect(importNetOrderValue({
      unitGrossValue: 215976,
      generalGrossValue: 215976,
      sourceGrossValue: 215976,
      sourceNetValue: 1727808,
      orderValueScope: "UNITARIO",
      unitCount: 8,
      unitNumber: 1,
    })).toBe(215976);
  });
  it("conserva importes literales sin descuento", () => {
    expect(importNetOrderValue({ unitGrossValue: 43150, unitCount: 1 })).toBe(43150);
  });
  it("no descuenta otra vez un valor OC general editado", () => {
    expect(importNetOrderValue({
      unitGrossValue: 329725.38,
      generalGrossValue: 329725.38,
      sourceGrossValue: 383401.6,
      sourceNetValue: 341227.4,
      discountPercentage: 11,
    })).toBe(329725.38);
  });
  it("conserva una unidad que ya contiene el neto aunque la fuente histórica esté desfasada", () => {
    expect(importNetOrderValue({
      unitGrossValue: 329725.38,
      generalGrossValue: 383401.6,
      sourceGrossValue: 383401.6,
      sourceNetValue: 341227.4,
      discountPercentage: 11,
      orderValueScope: "UNITARIO",
      unitCount: 1,
      unitNumber: 1,
    })).toBe(329725.38);
  });
  it("no toma el costo definitivo como valor facturado del proveedor", () => {
    expect(importUnitForm({ costo_final: 999 }).valor_factura_proveedor).toBe("");
  });
  it("guardar identificación no envía importes, fechas ni congela la llave automática", () => {
    const original = importUnitForm({ llave_interna: "CLA111-1", precio_oc: 100 });
    expect(importUnitPatch("unit", { ...original, chasis: "CH1", valor_oc: "200", eta: "2026-10-01" }, original)).toEqual({ chasis: "CH1" });
  });
  it("editar solo embarque no marca como individual el valor OC", () => {
    const original = importUnitForm({ precio_oc: 100 });
    expect(importUnitPatch("purchase", { ...original, eta: "2026-10-01" }, original)).toEqual({ eta: "2026-10-01" });
  });
  it("guardar factura nunca escribe costo de stock", () => {
    const original = importUnitForm({});
    expect(importUnitPatch("invoice", { ...original, valor_factura_proveedor: "50", costo_final: "999" }, original)).toEqual({ valor_factura_proveedor: "50" });
  });
  it("no envía campos sin cambios y valida importes", () => {
    const form = importUnitForm({});
    expect(importUnitPatch("stock", form, form)).toEqual({});
    expect(validImportAmount("")).toBe(true);
    expect(validImportAmount("0")).toBe(true);
    expect(validImportAmount("-1")).toBe(false);
    expect(validImportAmount("NaN")).toBe(false);
    expect(validImportAmount("Infinity")).toBe(false);
  });
});
