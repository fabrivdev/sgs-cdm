import { describe, expect, it } from "vitest";
import type { ServicioOSRow } from "@/components/dashboard/types";
import { importedOrderModel, orderClosingDays, orderClosureMetrics } from "./orderMetrics";

describe("order closure indicators", () => {
  it.each([
    ["2026-09-01", "2026-09-25", 24],
    ["2026-09-01", "2026-09-01", 0],
    ["2026-12-31", "2027-01-02", 2],
    ["2024-02-28", "2024-03-01", 2],
    ["2026-09-01T18:30:00-03:00", "2026-09-02T00:00:00Z", 1],
    [null, "2026-09-25", null],
    ["2026-09-01", null, null],
    ["2026-09-25", "2026-09-01", null],
    ["2026-02-30", "2026-03-03", null],
    ["2026-09-01", "2026-09-31", null],
    ["invalid", "2026-09-25", null],
  ])("uses calendar days %s to %s = %s", (fechaApertura, fechaFacturacion, expected) => {
    expect(orderClosingDays({ fechaApertura, fechaFacturacion })).toBe(expected);
  });
  it("counts closed/all filtered orders, averages only dated orders, and retains true zero days", () => {
    const rows = [
      { estadoOS: "Cerrada", fechaApertura: "2026-09-01", fechaFacturacion: "2026-09-11", fechaCierre: "2026-09-03" },
      { estadoOS: "Cerrada", fechaApertura: "2026-09-02", fechaFacturacion: "2026-09-02" },
      { estadoOS: "Abierta", fechaApertura: "2026-09-03", fechaFacturacion: null },
      { estadoOS: "Anulada", fechaApertura: "2026-09-05", fechaFacturacion: "2026-09-04" },
    ] as ServicioOSRow[];
    expect(orderClosureMetrics(rows)).toEqual({ percentage: 50, averageDays: 5, datedOrders: 2 });
    expect(orderClosureMetrics(rows.slice(0, 1))).toEqual({ percentage: 100, averageDays: 10, datedOrders: 1 });
    expect(orderClosureMetrics(rows.slice(2))).toEqual({ percentage: 0, averageDays: null, datedOrders: 0 });
    expect(orderClosureMetrics([])).toEqual({ percentage: null, averageDays: null, datedOrders: 0 });
  });
});

describe("imported equipment model", () => {
  it("prefers the canonical OS field, falls back to source model and never infers from products", () => {
    expect(importedOrderModel({ canonical_model: " TRION 740 ", MODELO: "old" })).toBe("TRION 740");
    expect(importedOrderModel({ canonical_model: " ", MODELO: "LEXION 750" })).toBe("LEXION 750");
    expect(importedOrderModel({ Modelo: "JAGUAR 950" })).toBe("JAGUAR 950");
    expect(importedOrderModel({ canonical_model: { nombre: "invented" }, MODELO: "---", PRODUCTO: "MA01" })).toBeNull();
    expect(importedOrderModel(null)).toBeNull();
  });
});
