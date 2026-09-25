import { describe, expect, it } from "vitest";
import { mapOrdenesServicioSheet } from "./newSystemXml";
import { aggregateNewSystemServiceOrders, mapCanonicalOsToImportRow } from "./persist";

const line = (extra: Record<string, unknown> = {}) => ({
  Sucursal: "01", "Nº OS": "000001", ESTADO: "Cerrada", PRODUCTO: "MA01",
  TIPTEM: "CS - CLIENTE SERVICIOS", DOCUMENTO: "0010010000001", MONEDA: "USD",
  ITEM: "1", PRECIO: "70", CANTIDAD: "2:00 Hs.", TOTAL: "140", TOTFAC: "140",
  VALFAC: "140", CNTFAC: "1", ...extra,
});
const aggregate = (rows: Record<string, unknown>[]) => {
  const source = mapOrdenesServicioSheet("fixture.xml", { name: "OS", headers: [], rows });
  return aggregateNewSystemServiceOrders(source.rows.map(mapCanonicalOsToImportRow))[0];
};
const rawOf = (rows: Record<string, unknown>[]) => aggregate(rows).raw_data as {
  canonical_labor_rates_version: number;
  canonical_labor_rates: Array<{ invoice: string; timeType: string; rate: number | null; currency: string; billedAmount: number | null }>;
};

describe("complete imported OS hourly tariff snapshot", () => {
  it("retains MA01 PRECIO instead of billed package VALFAC/CNTFAC", () => {
    expect(rawOf([line()])).toMatchObject({
      canonical_labor_rates_version: 1,
      canonical_labor_rates: [{ invoice: "0010010000001", timeType: "Cliente", rate: 70, currency: "USD", billedAmount: 140 }],
    });
  });
  it("keeps different time types, rates and documents, excluding KM, SE and parts even when first", () => {
    const raw = rawOf([
      line({ PRODUCTO: "KM01", PRECIO: "0.6", ITEM: "0" }),
      line(),
      line({ TIPTEM: "GS - GARANTIA SERVICIOS", PRECIO: "60", TOTFAC: "120", ITEM: "2" }),
      line({ TIPTEM: "IS - INTERNO SERVICIOS", PRECIO: "56", TOTFAC: "112", ITEM: "3", DOCUMENTO: "0010000000001" }),
      line({ PRODUCTO: "SE01", PRECIO: "1500", ITEM: "4" }),
      line({ PRODUCTO: "REPUESTO", PRECIO: "200", ITEM: "5" }),
    ]);
    expect(raw.canonical_labor_rates).toHaveLength(3);
    expect(raw.canonical_labor_rates.map(r => [r.timeType, r.rate])).toEqual([["Cliente", 70], ["Garantia", 60], ["Interno", 56]]);
    expect(raw.canonical_labor_rates[2].invoice).toBe("0010000000001");
  });
  it("does not multiply source allocation by principal/auxiliary participants", () => {
    const raw = rawOf([line({ TECNICO: "Fixture A", TECAUX001: "Fixture B" }), line({ TECNICO: "Fixture B" })]);
    expect(raw.canonical_labor_rates).toHaveLength(1);
    expect(raw.canonical_labor_rates[0].billedAmount).toBe(140);
  });
  it("retains multiple blocks and missing prices without silently choosing a good first rate", () => {
    const raw = rawOf([line({ TOTFAC: "0" }), line({ ITEM: "2", PRECIO: "", TOTFAC: "140" })]);
    expect(raw.canonical_labor_rates.map(r => [r.rate, r.billedAmount])).toEqual([[70, 0], [null, 140]]);
  });
  it("parses monetary decimals without interpreting prices as duration and preserves currency", () => {
    const raw = rawOf([line({ PRECIO: "56,50", TOTFAC: "113,00", MONEDA: "GS" })]);
    expect(raw.canonical_labor_rates[0]).toMatchObject({ rate: 56.5, billedAmount: 113, currency: "GS" });
  });
  it.each(["", "no disponible", "1:00 Hs."])("marks invalid money %s unknown, never zero or a default tariff", value => {
    expect(rawOf([line({ PRECIO: value, TOTFAC: value })]).canonical_labor_rates[0]).toMatchObject({ rate: null, billedAmount: null });
  });
  it("retains genuine zero amounts and zero tariffs for validation downstream", () => {
    expect(rawOf([line({ PRECIO: "0", TOTFAC: "0" })]).canonical_labor_rates[0]).toMatchObject({ rate: 0, billedAmount: 0 });
  });
  it("does not deduplicate distinct source items or conflicting values for one item", () => {
    expect(rawOf([line(), line({ ITEM: "2" }), line({ PRECIO: "60" })]).canonical_labor_rates).toHaveLength(3);
  });
  it("retains distinct clock blocks even if the export reuses the same item number", () => {
    const clock = { "Fch. Inicial": "2026-09-01", "Fch. Final": "2026-09-01", "Hora Inicial": "0800", "Hora Final": "1000" };
    expect(rawOf([line(clock), line({ ...clock, "Hora Inicial": "1000", "Hora Final": "1200" })]).canonical_labor_rates).toHaveLength(2);
  });
});
