import { describe, expect, it } from "vitest";
import { normalizeCompactDate } from "@/lib/imports/fiscal";

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
