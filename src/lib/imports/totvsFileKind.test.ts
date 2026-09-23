import { describe, expect, it } from "vitest";
import { detectTotvsFileKind } from "./totvsFileKind";

describe("detectTotvsFileKind", () => {
  it("distingue la foto de stock del reporte general de maquinarias", () => {
    expect(detectTotvsFileKind("stock_de_maquinarias_104855.xml")).toBe("stock_maquinas");
    expect(detectTotvsFileKind("maquinarias_153046.xml")).toBe("maquinarias");
  });
});
