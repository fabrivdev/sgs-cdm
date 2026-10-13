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

  it("valida automaticamente antes de escribir y no muestra controles de diagnostico", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/parque/ImportarTotvsTab.tsx"), "utf8");
    const handler = source.slice(source.indexOf("const confirmar = async"));
    const validation = handler.indexOf('mode: "validate"');
    const mayorWrite = handler.indexOf("persistMayorFile");
    const osWrite = handler.indexOf("persistNewSystemServiceOrders");

    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(mayorWrite);
    expect(validation).toBeLessThan(osWrite);
    expect(handler).toContain("automaticBillingSnapshotDeclaration");
    expect(source).not.toContain("requestBillingSnapshotDeclaration");
    expect(source).not.toContain("Validar facturacion sin guardar");
    expect(source).not.toContain("billingValidationReport");
    expect(source).not.toMatch(/\bprompt\s*\(/);
  });
});
