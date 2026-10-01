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
});
