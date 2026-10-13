import { describe, expect, it } from "vitest";
import { normalizeCompactDate, parseFlexibleNumber } from "@/lib/imports/fiscal";

describe("parseFlexibleNumber", () => {
  it("acepta notacion cientifica valida con exponentes positivos y negativos", () => {
    expect(parseFlexibleNumber("7.0000000000000007E-2")).toBeCloseTo(0.07, 15);
    expect(parseFlexibleNumber("1,25e+2")).toBe(125);
    expect(parseFlexibleNumber("-2.5E-3")).toBe(-0.0025);
    expect(parseFlexibleNumber("0e0")).toBe(0);
    expect(parseFlexibleNumber("-0E+308")).toBe(-0);
  });

  it("conserva los formatos decimales y de miles ya admitidos", () => {
    expect(parseFlexibleNumber("14.090,91")).toBe(14090.91);
    expect(parseFlexibleNumber("14,090.91")).toBe(14090.91);
    expect(parseFlexibleNumber("-138,04")).toBe(-138.04);
    expect(parseFlexibleNumber("USD 1.234,56")).toBe(1234.56);
    expect(parseFlexibleNumber("Dolares14,09")).toBe(14.09);
    expect(parseFlexibleNumber("EUR1.234,56")).toBe(1234.56);
  });

  it("rechaza exponentes malformados, fuera de rango o magnitudes inseguras", () => {
    for (const value of [
      "7E",
      "E-2",
      "1e2e3",
      "1.2.3e2",
      "1e309",
      "1e-309",
      "9007199254740992",
      "9.007199254740992e15",
      "Infinity",
      "NaN",
    ]) {
      expect(parseFlexibleNumber(value)).toBe(0);
    }
    expect(parseFlexibleNumber("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseFlexibleNumber(Number.MAX_SAFE_INTEGER + 1)).toBe(0);
  });
});

describe("normalizeCompactDate (formato FCHCIERRE yyyymmdd)", () => {
  it("parsea una fecha compacta valida a ISO", () => {
    expect(normalizeCompactDate("20260708")).toBe("2026-07-08");
  });

  it("acepta un numero (no solo string) con el mismo formato", () => {
    expect(normalizeCompactDate(20260708)).toBe("2026-07-08");
  });

  it("rechaza fechas invalidas (mes o dia fuera de rango)", () => {
    expect(normalizeCompactDate("20261301")).toBeNull();
    expect(normalizeCompactDate("20260230")).toBeNull();
    expect(normalizeCompactDate("20260000")).toBeNull();
  });

  it("rechaza valores vacios o con formato distinto", () => {
    expect(normalizeCompactDate("")).toBeNull();
    expect(normalizeCompactDate(null)).toBeNull();
    expect(normalizeCompactDate(undefined)).toBeNull();
    expect(normalizeCompactDate("2026-07-08")).toBeNull();
    expect(normalizeCompactDate("-------")).toBeNull();
  });
});
