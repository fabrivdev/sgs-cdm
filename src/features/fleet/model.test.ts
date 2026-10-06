import { describe, expect, it } from "vitest";
import {
  fleetTotalTravelled,
  currentFleetResponsibility,
  fleetResponsibilityHistory,
  mileageRows,
  normalizePlate,
  validateReading,
  type FleetOdometerReading,
  type FleetResponsibilityEvent,
} from "./model";

function reading(overrides: Partial<FleetOdometerReading> = {}): FleetOdometerReading {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    vehicle_id: overrides.vehicle_id ?? "vehicle-1",
    reading_date: overrides.reading_date ?? "2026-09-01",
    odometer_km: overrides.odometer_km ?? 10_000,
    reading_kind: overrides.reading_kind ?? "weekly",
    correction_of: overrides.correction_of ?? null,
    created_at: overrides.created_at ?? "2026-09-01T12:00:00Z",
    created_by: overrides.created_by ?? "user-1",
    created_by_name: overrides.created_by_name ?? "Usuario",
    voided_at: overrides.voided_at ?? null,
    voided_by: overrides.voided_by ?? null,
    voided_by_name: overrides.voided_by_name ?? null,
    void_reason: overrides.void_reason ?? null,
  };
}

function responsibility(overrides: Partial<FleetResponsibilityEvent> = {}): FleetResponsibilityEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    vehicle_id: overrides.vehicle_id ?? "vehicle-1",
    responsible_profile_id: overrides.responsible_profile_id === undefined ? "profile-1" : overrides.responsible_profile_id,
    responsible_name_snapshot: overrides.responsible_name_snapshot === undefined ? "Responsable" : overrides.responsible_name_snapshot,
    effective_date: overrides.effective_date === undefined ? "2026-09-01" : overrides.effective_date,
    recorded_at: overrides.recorded_at ?? "2026-09-01T12:00:00Z",
    recorded_by: overrides.recorded_by ?? "user-1",
    recorded_by_name: overrides.recorded_by_name ?? "Usuario",
  };
}

describe("fleet mileage model", () => {
  it("normaliza la chapa para detectar formatos equivalentes", () => {
    expect(normalizePlate("  abc-123 ")).toBe("ABC123");
    expect(normalizePlate("ABC 123")).toBe("ABC123");
  });

  it("calcula solo diferencias entre lecturas válidas", () => {
    const rows = mileageRows([
      reading({ id: "initial", reading_kind: "initial", odometer_km: 1_000, reading_date: "2026-09-01" }),
      reading({ id: "voided", odometer_km: 1_500, reading_date: "2026-09-08", voided_at: "2026-09-09T10:00:00Z" }),
      reading({ id: "corrected", correction_of: "voided", odometer_km: 1_400, reading_date: "2026-09-08" }),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["initial", "corrected"]);
    expect(rows[1]).toMatchObject({ travelledKm: 400, elapsedDays: 7, hasWeeklyGap: false });
  });

  it("no inventa semanas ni interpola cuando falta una lectura", () => {
    const rows = mileageRows([
      reading({ id: "initial", reading_kind: "initial", odometer_km: 1_000, reading_date: "2026-09-01" }),
      reading({ id: "later", odometer_km: 1_900, reading_date: "2026-09-22" }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ travelledKm: 900, elapsedDays: 21, hasWeeklyGap: true });
  });

  it("alerta fechas duplicadas y kilometrajes fuera de secuencia", () => {
    const readings = [
      reading({ id: "a", odometer_km: 1_000, reading_date: "2026-09-01" }),
      reading({ id: "b", odometer_km: 1_500, reading_date: "2026-09-08" }),
    ];
    expect(validateReading(readings, "2026-09-08", 1_600)?.code).toBe("duplicate");
    expect(validateReading(readings, "2026-09-15", 1_400)?.code).toBe("lower_previous");
    expect(validateReading(readings, "2026-09-05", 1_700)?.code).toBe("higher_next");
  });

  it("suma recorridos por vehículo sin cruzar odómetros", () => {
    expect(fleetTotalTravelled([
      reading({ id: "a1", vehicle_id: "a", odometer_km: 100, reading_date: "2026-09-01" }),
      reading({ id: "a2", vehicle_id: "a", odometer_km: 250, reading_date: "2026-09-08" }),
      reading({ id: "b1", vehicle_id: "b", odometer_km: 9_000, reading_date: "2026-09-01" }),
      reading({ id: "b2", vehicle_id: "b", odometer_km: 9_100, reading_date: "2026-09-08" }),
    ])).toBe(250);
  });

  it("resuelve el responsable vigente sin adelantar cambios futuros", () => {
    const events = [
      responsibility({ id: "baseline", effective_date: null, responsible_name_snapshot: "Hugo" }),
      responsibility({ id: "current", effective_date: "2026-09-15", responsible_name_snapshot: "Ruben" }),
      responsibility({ id: "future", effective_date: "2026-10-20", responsible_name_snapshot: "Ana" }),
    ];

    expect(currentFleetResponsibility("vehicle-1", events, "2026-10-06")?.id).toBe("current");
    expect(fleetResponsibilityHistory("vehicle-1", events).map((event) => event.id)).toEqual(["future", "current", "baseline"]);
  });

  it("conserva la baja de responsable como un evento auditable", () => {
    const events = [
      responsibility({ id: "assigned", effective_date: "2026-09-01" }),
      responsibility({
        id: "unassigned",
        responsible_profile_id: null,
        responsible_name_snapshot: null,
        effective_date: "2026-10-01",
      }),
    ];

    expect(currentFleetResponsibility("vehicle-1", events, "2026-10-06")).toMatchObject({
      id: "unassigned",
      responsible_profile_id: null,
      responsible_name_snapshot: null,
    });
    expect(events).toHaveLength(2);
  });
});
