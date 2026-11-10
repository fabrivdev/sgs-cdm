import { describe, it, expect } from "vitest";
import { maintenanceAlert, currentVehicleMileage } from "./maintenanceAlert";
import type {
  ManagedVehicle,
  MaintenanceEntry,
  Invoice,
  FuelEntry,
} from "./managementModel";
import type { FleetOdometerReading } from "./model";
const vehicle = {
  id: "v",
  maintenance_interval_km: 10000,
  source_data: { raw_data: { Kilometraje: 100 } },
} as unknown as ManagedVehicle;
const history = [
  { vehicle_id: "v", occurred_on: "2026-01-10", odometer_km: 50000 },
] as MaintenanceEntry[];
const current = { km: 58000, date: "2026-11-10" };
const alert = (km: number) =>
  maintenanceAlert(vehicle, { ...current, km }, history, [], "2026-11-10");
describe("Maintenance alert", () => {
  it("uses the complete last service and per-vehicle interval including exact boundary", () => {
    expect(alert(58000).label).toBe("Faltan 2.000 km");
    expect(alert(60000).label).toBe("Corresponde ahora");
    expect(alert(60500)).toEqual({ label: "Vencido por 500 km", due: true });
    expect(
      maintenanceAlert(
        { ...vehicle, maintenance_interval_km: null },
        current,
        history,
        [],
      ).label,
    ).toBe("Sin intervalo");
  });
  it("does not fall back to an older service when the latest lacks mileage", () => {
    const latest = {
      ...history[0],
      occurred_on: "2026-11-01",
      odometer_km: null,
    };
    expect(
      maintenanceAlert(vehicle, current, [...history, latest], []).label,
    ).toBe("Sin km de mantenimiento");
    expect(
      maintenanceAlert(vehicle, { km: 49000, date: "2026-11-10" }, history, [])
        .label,
    ).toBe("Revisar km");
    expect(
      maintenanceAlert(vehicle, { ...current, date: null }, history, []).label,
    ).toBe("Sin lectura posterior");
  });
  it("ignores void, pending and invoice dates without a dated work; completed work resets the baseline", () => {
    const invoice = {
      vehicle_id: "v",
      invoice_date: "2026-11-01",
      performed_on: "2026-10-01",
      odometer_km: 57000,
      status: "uploaded",
    } as Invoice;
    expect(maintenanceAlert(vehicle, current, history, [invoice]).label).toBe(
      "Faltan 9.000 km",
    );
    for (const change of [
      { status: "void" },
      { status: "pending" },
      { performed_on: null },
      { vehicle_id: "other" },
    ])
      expect(
        maintenanceAlert(vehicle, current, history, [
          { ...invoice, ...change } as Invoice,
        ]).label,
      ).toBe("Faltan 2.000 km");
    expect(
      maintenanceAlert(
        vehicle,
        current,
        [history[0], { ...history[0], odometer_km: 51000 }],
        [],
      ).label,
    ).toBe("Revisar mantenimiento");
  });
  it("uses current dated fuel instead of undated initial mileage; a later manual reading wins", () => {
    const fuel = [
      {
        vehicle_id: "v",
        occurred_at: "2026-10-01T12:00:00",
        odometer_km: 58000,
        product: "Diesel",
        liters: 50,
        net_amount: 100,
      },
    ] as FuelEntry[];
    expect(currentVehicleMileage(vehicle, [], fuel, "2026-11-10")).toEqual({
      km: 58000,
      date: "2026-10-01",
      source: "Combustible",
    });
    const readings = [
      {
        id: "r",
        vehicle_id: "v",
        reading_date: "2026-10-02",
        odometer_km: 59000,
        voided_at: null,
      },
    ] as FleetOdometerReading[];
    expect(
      currentVehicleMileage(vehicle, readings, fuel, "2026-11-10").km,
    ).toBe(59000);
  });
});
