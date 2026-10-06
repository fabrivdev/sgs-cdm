import { describe, expect, it } from "vitest";
import { fleetBrandOptions, fleetModelOptions, matchesFleetDimensions, vehicleHasReadingInRange } from "./filters";
import type { FleetOdometerReading, FleetVehicle } from "./model";

const vehicles: FleetVehicle[] = [
  { id: "v1", brand: "ISUZU", model: "D-MAX", plate: "A", plate_normalized: "A", active: true, created_at: "", created_by: "u", created_by_name: "Fabrizio" },
  { id: "v2", brand: "ISUZU", model: "D-MAX 4X4 C/S", plate: "B", plate_normalized: "B", active: true, created_at: "", created_by: "u", created_by_name: "Fabrizio" },
  { id: "v3", brand: "MAXUS", model: "T60", plate: "C", plate_normalized: "C", active: true, created_at: "", created_by: "u", created_by_name: "Fabrizio" },
];

const reading = (overrides: Partial<FleetOdometerReading> = {}): FleetOdometerReading => ({
  id: "r1", vehicle_id: "v1", reading_date: "2026-10-01", odometer_km: 1200,
  reading_kind: "weekly", correction_of: null, created_at: "2026-10-01T10:00:00Z",
  created_by: "u", created_by_name: "Fabrizio", voided_at: null, voided_by: null,
  voided_by_name: null, void_reason: null, ...overrides,
});

describe("fleet secondary filters", () => {
  it("offers models dependent on the selected brand", () => {
    expect(fleetBrandOptions(vehicles)).toEqual(["ISUZU", "MAXUS"]);
    expect(fleetModelOptions(vehicles, "ISUZU")).toEqual(["D-MAX", "D-MAX 4X4 C/S"]);
    expect(fleetModelOptions(vehicles, "MAXUS")).toEqual(["T60"]);
  });

  it("counts only active readings inside the selected period", () => {
    const range = { from: "2026-10-01", to: "2026-10-07", valid: true };
    expect(vehicleHasReadingInRange("v1", [reading()], range)).toBe(true);
    expect(vehicleHasReadingInRange("v1", [reading({ voided_at: "2026-10-02T10:00:00Z" })], range)).toBe(false);
    expect(vehicleHasReadingInRange("v1", [reading({ reading_date: "2026-09-30" })], range)).toBe(false);
  });

  it("separates vehicles with and without readings in the period", () => {
    expect(matchesFleetDimensions(vehicles[0], true, { brand: "ISUZU", model: "D-MAX", readingPresence: "with" })).toBe(true);
    expect(matchesFleetDimensions(vehicles[0], false, { brand: "ISUZU", model: "D-MAX", readingPresence: "with" })).toBe(false);
    expect(matchesFleetDimensions(vehicles[2], false, { brand: "all", model: "all", readingPresence: "without" })).toBe(true);
  });
});
