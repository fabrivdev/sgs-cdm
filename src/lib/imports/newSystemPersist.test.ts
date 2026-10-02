import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");

describe("persistencia de facturacion del sistema nuevo", () => {
  it("prevalida antes del RPC y persiste OS solo despues de facturacion", () => {
    const prevalidation = source.indexOf("validateBillingSourceBatch(facturacionLineasSinValidar)");
    const billingRpc = source.indexOf('"facturacion_importar_totvs_lote_v1"');
    const serviceOrderImport = source.indexOf("...bundle.importaciones.ordenesServicio");

    expect(prevalidation).toBeGreaterThan(0);
    expect(billingRpc).toBeGreaterThan(prevalidation);
    expect(serviceOrderImport).toBeGreaterThan(billingRpc);
  });

  it("no ejecuta borrado directo ni upsert tolerante de lineas detalladas", () => {
    expect(source).not.toContain("BILLING_LINE_INSERT_OPTIONS");
    expect(source).not.toContain("ignoreDuplicates: true");
    expect(source).not.toMatch(/facturacion_lineas_importadas[\s\S]{0,180}\.delete\(\)/);
  });

  it("distingue un fallo posterior de OS de un rollback de facturacion", () => {
    expect(source).toContain("La facturacion quedo confirmada, pero fallo la etapa posterior");
    expect(source).toContain("la facturacion reutilizara sus UUID");
  });
});
