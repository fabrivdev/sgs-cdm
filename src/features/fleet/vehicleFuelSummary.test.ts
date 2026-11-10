import { describe, expect, it } from "vitest";
import { fuelMonthRows, usesMonthlyFuel } from "./vehicleFuelSummary";
import { estimatedConsumption, type FuelEntry } from "./managementModel";

const entries = [
  ["2026-01-02", 1000, 40, 600, 40],
  ["2026-01-20", 1400, 40, 1000, 40],
  ["2026-02-02", 1800, 60, 1400, 40],
  ["2026-02-20", 2300, 60, 1800, 60],
].map(
  ([date, km, liters, previous, priorLiters], i) =>
    ({
      id: String(i),
      vehicle_id: "v",
      plate: "TEST",
      occurred_at: date + "T10:00:00",
      odometer_km: km,
      liters,
      previous_odometer_km: previous,
      previous_liters: priorLiters,
      product: "Diesel",
      net_amount: 100,
      currency: "PYG",
      station: "Station",
      raw_data: {},
      source_key: String(i),
    }) as FuelEntry,
);

describe("vehicle monthly consumption", () => {
  it("keeps totals and weighted consumption distinct and compares adjacent complete months", () => {
    const f = { from: "2026-01-01", to: "2026-12-31" };
    const months = fuelMonthRows(entries, f, "2026-03-01");
    expect(months.map((r) => r.liters)).toEqual([80, 120]);
    expect(months.map((r) => r.consumption)).toEqual([10, 12]);
    expect(months[1].trend).toBe("+20 %");
    expect(months[1].trendValue).toBeCloseTo(20);
    expect(months[0].average).toBeCloseTo((100 / 900) * 100);
    expect(
      months.map(
        (r) =>
          r.consumption != null &&
          r.average != null &&
          r.consumption > r.average,
      ),
    ).toEqual([false, true]);
    const february = fuelMonthRows(
      entries,
      { from: "2026-02-01", to: "2026-02-28" },
      "2026-03-01",
    );
    expect(february[0].consumption).toBe(february[0].average);
    expect(february[0].average).toBe(12);
    expect(estimatedConsumption(entries).l100).toBeCloseTo((100 / 900) * 100);
    expect(usesMonthlyFuel(f)).toBe(true);
    expect(usesMonthlyFuel({ from: months[0].from, to: months[0].to })).toBe(
      false,
    );
  });
  it("does not compare an incomplete month, partial selection or a month without a valid predecessor", () => {
    expect(
      fuelMonthRows(
        entries,
        { from: "2026-01-01", to: "2026-12-31" },
        "2026-02-25",
      )[1].trend,
    ).toBe("—");
    expect(
      fuelMonthRows(
        entries,
        { from: "2026-02-01", to: "2026-02-28" },
        "2026-03-01",
      )[0].trend,
    ).toBe("+20 %");
    expect(
      fuelMonthRows(
        entries,
        { from: "2026-01-01", to: "2026-02-20" },
        "2026-03-01",
      )[1].trend,
    ).toBe("—");
  });
});
