import { describe, expect, it } from "vitest";
import { importHasMultipleUnits, importInvoiceDifference, importUnitForm, importUnitPatch, validImportAmount } from "./machineImportValues";

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
