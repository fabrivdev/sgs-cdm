import { describe, expect, it } from "vitest";
import {
  calculateClientBillingStats,
  mergeClientBilling,
  type ClientBillingEntry,
  type TotvsBillingLine,
} from "./clientBilling";

const legacy = (overrides: Partial<ClientBillingEntry> = {}): ClientBillingEntry => ({
  id: "legacy-1",
  fecha: "2026-06-30",
  tipo: "Repuesto",
  total_venta: 100,
  grupo: "REPUESTOS - CLAAS",
  grupo_fx: "Repuesto",
  cod_factura: "001-001-1",
  ...overrides,
});

const totvs = (overrides: Partial<TotvsBillingLine> = {}): TotvsBillingLine => ({
  id: "line-1",
  fecha_factura: "2026-07-02T00:00:00+00:00",
  factura: "001-001-2",
  codigo_interno_factura: null,
  grupo_normalizado: "Repuestos",
  subgrupo_original: "REPUESTOS - CLAAS",
  total_venta: 40,
  ...overrides,
});

describe("mergeClientBilling", () => {
  it("combina los períodos sin duplicar el resumen posterior al corte", () => {
    const rows = mergeClientBilling([
      legacy(),
      legacy({ id: "summary-totvs", fecha: "2026-07-02", cod_factura: "001-001-2", total_venta: 999 }),
    ], [totvs()]);

    expect(rows.map((row) => [row.fecha, row.total_venta])).toEqual([
      ["2026-07-02", 40],
      ["2026-06-30", 100],
    ]);
  });

  it("suma líneas legítimas y deduplica solamente una identidad de línea repetida", () => {
    const rows = mergeClientBilling([], [
      totvs(),
      totvs({ id: "line-2", total_venta: 60 }),
      totvs({ total_venta: 40 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tipo: "Repuesto", total_venta: 100, cod_factura: "001-001-2" });
  });

  it("preserva notas de crédito y clasifica mano de obra y kilometraje por separado", () => {
    const rows = mergeClientBilling([], [
      totvs({ id: "nc", total_venta: -25 }),
      totvs({ id: "mo", grupo_normalizado: "Servicio", subgrupo_original: "SERVICE - CLAAS", total_venta: 80 }),
      totvs({ id: "km", grupo_normalizado: "Kilometraje", subgrupo_original: "KILOMETRAJE", total_venta: 20 }),
    ]);

    expect(rows.reduce((sum, row) => sum + row.total_venta, 0)).toBe(75);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ tipo: "Repuesto", total_venta: -25 }),
      expect.objectContaining({ tipo: "Servicio", grupo_fx: "Mano de obra", total_venta: 80 }),
      expect.objectContaining({ tipo: "Servicio", grupo_fx: "Kilometraje", total_venta: 20 }),
    ]));
  });

  it("excluye rubros ajenos a repuestos y servicios", () => {
    expect(mergeClientBilling([], [totvs({ grupo_normalizado: "Maquinas" })])).toEqual([]);
  });

  it("calcula YTD y año anterior después de unir fuentes y conserva el signo de NC", () => {
    const rows = mergeClientBilling([
      legacy({ fecha: "2025-10-01", total_venta: 100 }),
    ], [
      totvs({ total_venta: 70 }),
      totvs({ id: "nc", fecha_factura: "2026-08-01", factura: "NC-1", total_venta: -20 }),
    ]);

    expect(calculateClientBillingStats(rows, "Repuesto", 2026)).toMatchObject({
      ytd: 50,
      prev: 100,
      varPct: -50,
    });
  });

  it("ordena globalmente las últimas ventas y limita la lista después de combinar", () => {
    const lines = Array.from({ length: 11 }, (_, index) => totvs({
      id: `line-${index}`,
      factura: `F-${index}`,
      fecha_factura: `2026-07-${String(index + 1).padStart(2, "0")}`,
    }));
    const stats = calculateClientBillingStats(mergeClientBilling([legacy()], lines), "Repuesto", 2026);

    expect(stats.lista).toHaveLength(10);
    expect(stats.lista[0].fecha).toBe("2026-07-11");
    expect(stats.lista.at(-1)?.fecha).toBe("2026-07-02");
  });
});
