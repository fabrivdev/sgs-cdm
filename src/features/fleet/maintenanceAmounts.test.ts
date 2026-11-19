import { describe, expect, it } from "vitest";
import { maintenanceHistoryMoney } from "./maintenanceAmounts";

describe("reviewed maintenance import amounts", () => {
  const read = (value: unknown) =>
    maintenanceHistoryMoney({ raw_data: { totvs_financial: value } });
  it("uses the total including tax", () => {
    expect(
      read({
        version: 1,
        currency: "PYG",
        base: 100000,
        tax: 10000,
        total: 110000,
      }),
    ).toEqual({ amount: 110000, currency: "PYG" });
  });
  it("accepts an explicitly exempt amount", () => {
    expect(
      read({ version: 1, currency: "PYG", base: 100000, tax: 0, total: 100000 })
        .amount,
    ).toBe(100000);
  });
  it("does not invent an amount from historical cells", () => {
    expect(
      maintenanceHistoryMoney({ raw_data: { Monto: 100000 } }).amount,
    ).toBeNull();
  });
  it.each([
    { base: 100000, tax: 10000, total: 100000 },
    { base: -10, tax: 0, total: -10 },
    { base: "100000", tax: 10000, total: 110000 },
    { base: Infinity, tax: 0, total: Infinity },
  ])("rejects inconsistent totals: %j", (data) => {
    expect(read({ version: 1, currency: "PYG", ...data }).amount).toBeNull();
  });
});
