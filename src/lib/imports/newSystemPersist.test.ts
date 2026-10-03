import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const importerUi = readFileSync("src/components/parque/ImportarTotvsTab.tsx", "utf8");

describe("persistencia de facturacion del sistema nuevo", () => {
  it("prevalida antes del RPC y persiste OS solo despues de facturacion", () => {
    const prevalidation = source.indexOf("validateBillingSourceBatch(facturacionLineasSinValidar)");
    const billingRpc = source.indexOf('"facturacion_validar_totvs_lote_v1"');
    const serviceOrderImport = source.indexOf("...bundle.importaciones.ordenesServicio");

    expect(prevalidation).toBeGreaterThan(0);
    expect(billingRpc).toBeGreaterThan(prevalidation);
    expect(serviceOrderImport).toBeGreaterThan(billingRpc);
  });

  it("ejecuta el preflight transaccional antes de escribir clientes", () => {
    const preflight = importerUi.indexOf('mode: "validate"');
    const firstClientWrite = importerUi.indexOf('supabase.from("clientes").insert');
    const actualPersistence = importerUi.indexOf("const resultado = await persistNewSystemBundle");

    expect(preflight).toBeGreaterThan(0);
    expect(firstClientWrite).toBeGreaterThan(preflight);
    expect(actualPersistence).toBeGreaterThan(firstClientWrite);
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

describe("contadores de exclusiones confirmadas", () => {
  it("usa las lineas aceptadas y excluidas devueltas por el RPC", () => {
    expect(source).toContain("data: facturacionData");
    expect(source).toContain("facturacionResultado.excluidas_confirmadas");
    expect(source).toContain("facturacionResultado.lineas_activas");
    expect(source).toContain("facturacionLineas: facturacionAceptadas");
  });
  it("cuenta las OS que devuelve el upsert, conservando sus triggers", () => {
    expect(source).toContain('}).select("os_numero")');
    expect(source).toContain("insertados: ordenesServicioPersistidas");
    expect(source).toContain("ordenesServicio: ordenesServicioPersistidas");
    expect(source).not.toContain("insertados: ordenesServicioPayload.length");
  });
});
