import { describe, expect, it } from "vitest";
import {
  fleetTotalTravelled,
  mileageRows,
  normalizePlate,
  validateReading,
  type FleetOdometerReading,
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
});
