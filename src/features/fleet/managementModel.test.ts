import { describe, it, expect } from "vitest";
import {
  vehicleMileageDisplay,
  type ManagedVehicle,
  estimatedConsumption,
  monthlyFuel,
  invoiceValidation,
  canManageFleet,
  canSubmitInvoice,
  type FuelEntry,
} from "./managementModel";
const row = (id: string, date: string, km: number, liters = 40): FuelEntry => ({
  id,
  vehicle_id: "v",
  plate: "TEST123",
  occurred_at: date + "T10:00:00",
  odometer_km: km,
  liters,
  net_amount: liters * 10,
  currency: null,
  previous_odometer_km: km - 400,
  previous_liters: 40,
  product: "Diesel",
  station: "Test",
  source_key: id,
  raw_data: {},
});
describe("Fleet calculations and input", () => {
  it("requires both role and section and keeps operators upload-only", () => {
    expect(canManageFleet(["operativo"], true)).toBe(false);
    expect(canSubmitInvoice(["operativo"], true)).toBe(true);
    expect(canManageFleet(["jefatura"], false)).toBe(false);
    expect(canSubmitInvoice(["gerencia"], true)).toBe(false);
  });
  it("uses continuous intervals, excludes cross-month gaps, adjustments and ambiguous timestamps", () => {
    const a = row("a", "2026-10-01", 1000),
      b = row("b", "2026-10-08", 1400),
      c = row("c", "2026-10-15", 1800);
    expect(estimatedConsumption([a, b, c])).toEqual({
      km: 800,
      liters: 80,
      l100: 10,
      intervals: 2,
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(
      estimatedConsumption([a, { ...b, previous_liters: 12 }]).l100,
    ).toBeNull();
    expect(
      estimatedConsumption([a, { ...b, occurred_at: "2026-11-01T10:00:00" }])
        .l100,
    ).toBeNull();
    expect(estimatedConsumption([a, { ...b, liters: -40 }, c]).l100).toBeNull();
    expect(
      estimatedConsumption([a, b, { ...b, id: "duplicate" }, c]).l100,
    ).toBeNull();
    expect(
      estimatedConsumption([a, { ...b, product: "Aceite motor diesel" }]).l100,
    ).toBeNull();
    expect(
      estimatedConsumption([a, { ...b, vehicle_id: null }]).l100,
    ).toBeNull();
  });
  it("keeps negative adjustments and unknown currency, never turns absence into estimated zero", () => {
    const rows = [
      row("a", "2026-10-01", 1000),
      row("b", "2026-10-08", 1400, -10),
    ];
    expect(monthlyFuel(rows)).toEqual([
      {
        month: "2026-10",
        currency: null,
        loaded: 40,
        adjustments: -10,
        liters: 30,
        amount: 300,
      },
    ]);
    expect(estimatedConsumption([]).l100).toBeNull();
  });
  it("reports invalid dates without crashing and requires a real invoice file", () => {
    const input = {
      plate: "TEST123",
      supplier: "Test",
      invoice_number: "001-001-0000001",
      invoice_date: "2026-13-99",
      categories: ["Filtros"],
      description: "Cambio de filtro",
    };
    const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
    expect(invoiceValidation(input, file)).toBe("Ingresá una fecha válida.");
    expect(invoiceValidation({ ...input, invoice_number: "001-001-3996" }, file)).toMatch("formato 001-001-0000001");
    expect(
      invoiceValidation({ ...input, invoice_date: "2026-10-01" }, file),
    ).toBeNull();
    expect(
      invoiceValidation({ ...input, invoice_date: "2026-10-01" }, null),
    ).toMatch("Seleccioná un PDF");
  });
});

describe("Vehicle mileage source", () => {
  const vehicle = (km: unknown) =>
    ({
      source_data: { raw_data: { Kilometraje: km } },
    }) as unknown as ManagedVehicle;
  it("shows undated imported mileage without manufacturing a reading", () => {
    expect(vehicleMileageDisplay(vehicle(150959))).toEqual({
      km: 150959,
      date: null,
      source: "Planilla inicial",
    });
    expect(vehicleMileageDisplay(vehicle(0)).km).toBe(0);
    for (const value of [null, undefined, "", "sin dato", -1, NaN])
      expect(vehicleMileageDisplay(vehicle(value)).km).toBeNull();
  });
  it("keeps registered readings authoritative", () => {
    expect(
      vehicleMileageDisplay(vehicle(150959), {
        odometer_km: 159137,
        reading_date: "2026-10-07",
      }),
    ).toEqual({ km: 159137, date: "2026-10-07", source: "Lectura" });
  });
});
import { initialFilters, mileage, money, moneyCell } from "./workspaceModel";
import type { FleetOdometerReading } from "./model";
describe("Period mileage and currency presentation", () => {
  const fuel = [
    row("a", "2026-09-30", 1000),
    row("b", "2026-10-02", 1400),
    row("c", "2026-10-05", 1800),
  ];
  it("uses imported mileage across months without requiring manual readings", () => {
    expect(mileage([], "v", initialFilters, fuel)).toBe(800);
    expect(
      mileage([], "v", { ...initialFilters, from: "2026-10-01" }, fuel),
    ).toBe(400);
    expect(
      mileage([], "v", { ...initialFilters, search: "not found" }, fuel),
    ).toBe(800);
    expect(mileage([], "other", initialFilters, fuel)).toBeNull();
    expect(mileage([], "v", initialFilters, fuel.slice(0, 1))).toBeNull();
  });
  it("does not combine overlapping sources or count discontinuities", () => {
    const readings = [
      {
        id: "a",
        vehicle_id: "v",
        reading_date: "2026-10-01",
        voided_at: null,
        odometer_km: 1000,
      },
      {
        id: "b",
        vehicle_id: "v",
        reading_date: "2026-10-03",
        voided_at: null,
        odometer_km: 1300,
      },
    ] as FleetOdometerReading[];
    expect(mileage(readings, "v", initialFilters, fuel)).toBe(300);
    expect(
      mileage([], "v", initialFilters, [
        fuel[0],
        { ...fuel[1], previous_odometer_km: 50 },
      ]),
    ).toBeNull();
    expect(
      mileage([], "v", { ...initialFilters, from: "2026-10-99" }, fuel),
    ).toBeNull();
  });
  it("keeps Gs beside amounts, preserves zero and separates other currencies", () => {
    expect(moneyCell(1234567, "PYG")).toBe("Gs 1.234.567");
    expect(moneyCell(0, "PYG")).toBe("Gs 0");
    expect(moneyCell(null, "PYG")).toBe("—");
    expect(
      money([
        { amount: 100, currency: "PYG" },
        { amount: 25, currency: "USD" },
      ]),
    ).toBe("Gs 100 · USD 25");
  });
});

it("excludes a multi-load odometer spike that later rolls back", () => {
  const rows = [
    row("a", "2026-10-01", 1000),
    { ...row("b", "2026-10-02", 700000), previous_odometer_km: 1000 },
    { ...row("c", "2026-10-03", 700400), previous_odometer_km: 700000 },
    { ...row("d", "2026-10-04", 1400), previous_odometer_km: 700400 },
    row("e", "2026-10-05", 1800),
    row("f", "2026-10-06", 2200),
  ];
  expect(mileage([], "v", initialFilters, rows)).toBe(800);
  expect(estimatedConsumption(rows).km).toBe(800);
});

it("isolates a low typo without losing valid history or bridging the bad reading", () => {
  const rows = [
    row("a", "2026-10-01", 1000),
    row("b", "2026-10-02", 1400),
    { ...row("c", "2026-10-03", 1), previous_odometer_km: 1400 },
    { ...row("d", "2026-10-04", 1800), previous_odometer_km: 1 },
    row("e", "2026-10-05", 2200),
  ];
  expect(estimatedConsumption(rows).km).toBe(800);
  expect(estimatedConsumption(rows, "2026-10-01", "2026-10-02").km).toBe(400);
  expect(rows[2].odometer_km).toBe(1);
});
it("keeps the entire series for anomaly detection even when the rollback is after the period", () => {
  const rows = [
    row("a", "2026-10-01", 1000),
    { ...row("b", "2026-10-02", 700000), previous_odometer_km: 1000 },
    { ...row("c", "2026-10-03", 700400), previous_odometer_km: 700000 },
    { ...row("d", "2026-11-01", 1400), previous_odometer_km: 700400 },
  ];
  expect(estimatedConsumption(rows, "2026-10-01", "2026-10-31").km).toBe(0);
});
