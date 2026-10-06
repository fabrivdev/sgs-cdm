import { describe, expect, it } from "vitest";
import type { FleetOdometerReading } from "./model";
import { periodMileage, resolveFleetPeriod, todayInParaguay } from "./period";

const reading = (id: string, date: string, km: number): FleetOdometerReading => ({
  id, vehicle_id: "v1", reading_date: date, odometer_km: km, reading_kind: id === "a" ? "initial" : "weekly",
  correction_of: null, created_at: `${date}T12:00:00Z`, created_by: "u", created_by_name: "Demo",
  voided_at: null, voided_by: null, voided_by_name: null, void_reason: null,
});

describe("fleet period filters", () => {
  it("resuelve semana, mes, año y rango personalizado", () => {
    expect(resolveFleetPeriod("week", "2026-10-06", "", "")).toMatchObject({ from: "2026-10-05", to: "2026-10-11", valid: true });
    expect(resolveFleetPeriod("month", "2026-10-06", "", "")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", valid: true });
    expect(resolveFleetPeriod("year", "2026-10-06", "", "")).toMatchObject({ from: "2026-01-01", to: "2026-12-31", valid: true });
    expect(resolveFleetPeriod("custom", "", "2026-10-10", "2026-10-01").valid).toBe(false);
  });

  it("deriva hoy en zona de Paraguay", () => {
    expect(todayInParaguay(new Date("2026-10-07T02:30:00Z"))).toBe("2026-10-06");
  });

  it("usa baseline anterior pero no atribuye un intervalo parcial", () => {
    const result = periodMileage([
      reading("a", "2026-09-29", 1_000),
      reading("b", "2026-10-06", 1_500),
      reading("c", "2026-10-13", 1_900),
    ], { from: "2026-10-01", to: "2026-10-13", valid: true });
    expect(result.rows.map((row) => [row.id, row.coverage, row.travelledKm, row.countedKm])).toEqual([
      ["b", "partial", 500, null],
      ["c", "exact", 400, 400],
    ]);
    expect(result).toMatchObject({ exactKm: 400, coverageFrom: "2026-10-06", coverageTo: "2026-10-13", hasPartialInterval: true });
  });

  it("maneja período vacío y lectura exactamente en hasta", () => {
    const rows = [reading("a", "2026-09-01", 100), reading("b", "2026-09-08", 180)];
    expect(periodMileage(rows, { from: "2026-10-01", to: "2026-10-31", valid: true }).rows).toHaveLength(0);
    expect(periodMileage(rows, { from: "2026-09-01", to: "2026-09-08", valid: true }).exactKm).toBe(80);
  });

  it("mantiene cada cambio rápido de fecha independiente", () => {
    const ranges = [
      resolveFleetPeriod("week", "2026-10-06", "", ""),
      resolveFleetPeriod("month", "2026-09-12", "", ""),
      resolveFleetPeriod("custom", "", "2026-08-05", "2026-09-16"),
    ];
    expect(ranges.map(({ from, to }) => [from, to])).toEqual([
      ["2026-10-05", "2026-10-11"],
      ["2026-09-01", "2026-09-30"],
      ["2026-08-05", "2026-09-16"],
    ]);
  });
});
