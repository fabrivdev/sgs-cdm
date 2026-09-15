import { describe, expect, it } from "vitest";
import { legacyPartsNumber, validateLegacyPartsMovement as validate } from "./legacyPartsBilling";
describe("movimientos históricos de repuestos", () => {
  it("conserva ventas S y devoluciones E", () => {
    expect(validate("s", "2026-06-30", "6135", 1, 78.13, 2)).toBe("S");
    expect(validate(" E ", "2026-01-05", "6135", -1, -78.13, 185169)).toBe("E");
  });
  it("rechaza signos inconsistentes sin convertirlos", () => {
    expect(() => validate("E", "2026-01-05", "6135", -1, 78.13, 3)).toThrow("fila 3");
    expect(() => validate("S", "2026-01-05", "6135", 1, -78.13, 4)).toThrow("S no puede");
  });
  it("rechaza fechas actuales y registros sin código", () => {
    expect(() => validate("S", "2026-07-01", "6135", 1, 1, 2)).toThrow("histórico inválido");
    expect(() => validate("S", "2026-01-05", "", 1, 1, 2)).toThrow();
  });
  it("no inventa ventas para movimientos desconocidos", () => {
    expect(() => validate("X", "2026-01-05", "6135", 1, 1, 2)).toThrow("distinto de S/E");
  });
  it("no convierte faltantes o texto inválido en cero", () => {
    expect(legacyPartsNumber(0, 2, "cantidad")).toBe(0);
    expect(legacyPartsNumber("1.234,56", 2, "importe")).toBe(1234.56);
    expect(() => legacyPartsNumber(null, 2, "importe")).toThrow("falta importe");
    expect(() => legacyPartsNumber("abc", 2, "cantidad")).toThrow("cantidad inválido");
    expect(() => validate("S", "2026-02-31", "6135", 1, 1, 2)).toThrow("histórico inválido");
  });
});
