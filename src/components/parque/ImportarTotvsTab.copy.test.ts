import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("textos visibles del importador TOTVS", () => {
  it("no muestra escapes Unicode literales en la interfaz", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/parque/ImportarTotvsTab.tsx"), "utf8");

    expect(source).toContain("líneas de despacho</Badge>");
    expect(source).toContain("transferencias en tránsito</Badge>");
    expect(source).toContain("Kardex sintético: {preview.syntheticKardexDiagnostics.products}");
    expect(source).toContain("Proveedores: actualización incremental");
    expect(source).not.toContain("l\\u00edneas de despacho</Badge>");
    expect(source).not.toContain("transferencias en tr\\u00e1nsito</Badge>");
    expect(source).not.toContain("Kardex sint\\u00e9tico: {preview.syntheticKardexDiagnostics.products}");
    expect(source).not.toContain("Proveedores: actualizaci\\u00f3n incremental");
  });

  it("ofrece una validacion aislada que no persiste OS ni acredita cargas", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/parque/ImportarTotvsTab.tsx"), "utf8");
    const handlerStart = source.indexOf("const validateBillingOnly = async () =>");
    const handlerEnd = source.indexOf("const leerArchivos = async () =>", handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(0);
    expect(handler).toContain('mode: "validate"');
    expect(handler).toContain("describeImportError(error, activeValidationStage)");
    expect(handler).toContain("billingSnapshotDeclaration: billingValidationScope");
    expect(handler).not.toContain("requestBillingSnapshotDeclaration");
    expect(handler).not.toContain("persistNewSystemServiceOrders");
    expect(handler).not.toContain("accreditHistoricalBillingSource");
    expect(source).toContain("Validar facturacion sin guardar");
    expect(source).toContain("billingValidationReport.detail");
    expect(source).toContain('from: `${today.slice(0, 4)}-07-01`');
    expect(source).toContain("TOTVS_BILLING_BRANCHES.map");
  });
});
