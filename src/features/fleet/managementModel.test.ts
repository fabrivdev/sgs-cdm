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
      invoice_number: "001",
      invoice_date: "2026-13-99",
      categories: ["Filtros"],
      description: "Cambio de filtro",
    };
    const file = new File(["pdf"], "test.pdf", { type: "application/pdf" });
    expect(invoiceValidation(input, file)).toBe("Ingresá una fecha válida.");
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
