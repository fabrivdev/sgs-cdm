import { describe, expect, it } from "vitest";
import {
  maintenanceHistoryMoney,
  maintenanceExpenseMoney,
} from "./maintenanceAmounts";
import type { MaintenanceEntry, Invoice } from "./managementModel";

describe("reviewed maintenance import amounts", () => {
  it("includes imported amounts and uploaded invoices within the selected vehicles and period", () => {
    const financial = {
      version: 1,
      currency: "PYG",
      base: 100000,
      tax: 10000,
      total: 110000,
    };
    const history = [
      {
        vehicle_id: "v1",
        occurred_on: "2026-07-01",
        raw_data: { totvs_financial: financial },
      },
      {
        vehicle_id: "v2",
        occurred_on: "2026-07-01",
        raw_data: { totvs_financial: financial },
      },
      {
        vehicle_id: "v1",
        occurred_on: "2025-07-01",
        raw_data: { totvs_financial: financial },
      },
      { vehicle_id: "v1", occurred_on: "2026-07-01", raw_data: {} },
    ] as MaintenanceEntry[];
    const invoices = [
      {
        vehicle_id: "v1",
        invoice_date: "2026-07-01",
        status: "uploaded",
        amount: 20000,
        currency: "PYG",
      },
      {
        vehicle_id: "v1",
        invoice_date: "2025-07-01",
        performed_on: "2026-07-01",
        status: "uploaded",
        amount: 10000,
        currency: "PYG",
      },
      {
        vehicle_id: "v1",
        invoice_date: "2026-07-01",
        status: "void",
        amount: 999999,
        currency: "PYG",
      },
      {
        vehicle_id: "v1",
        invoice_date: "2026-07-01",
        status: "pending",
        amount: 999999,
        currency: "PYG",
      },
      {
        vehicle_id: "v2",
        invoice_date: "2026-07-01",
        status: "uploaded",
        amount: 999999,
        currency: "PYG",
      },
    ] as Invoice[];
    expect(
      maintenanceExpenseMoney(history, invoices, new Set(["v1"]), {
        from: "2026-01-01",
        to: "2026-12-31",
      }),
    ).toBe("Gs 140.000");
    expect(
      maintenanceExpenseMoney(history, invoices, new Set(["v1"]), {
        from: "2026-08-01",
        to: "2026-12-31",
      }),
    ).toBe("—");
  });
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
