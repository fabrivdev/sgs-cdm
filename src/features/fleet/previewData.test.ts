import { describe, expect, it } from "vitest";
import { activeReadings, mileageRows, vehiclesUpToDate } from "./model";
import { FLEET_PREVIEW_SNAPSHOT } from "./previewData";
import { cloneFleetPreviewSnapshot } from "./previewState";

describe("fleet preview data", () => {
  it("mantiene ocho vehículos inequívocamente ficticios", () => {
    expect(FLEET_PREVIEW_SNAPSHOT.vehicles).toHaveLength(8);
    expect(FLEET_PREVIEW_SNAPSHOT.vehicles.every((vehicle) => vehicle.plate.startsWith("DEMO-"))).toBe(true);
  });

  it("incluye entre ocho y diez lecturas activas coherentes por vehículo", () => {
    for (const vehicle of FLEET_PREVIEW_SNAPSHOT.vehicles) {
      const readings = activeReadings(FLEET_PREVIEW_SNAPSHOT.readings.filter((reading) => reading.vehicle_id === vehicle.id));
      expect(readings.length).toBeGreaterThanOrEqual(8);
      expect(readings.length).toBeLessThanOrEqual(10);
      expect(mileageRows(readings).every((reading) => reading.travelledKm === null || reading.travelledKm >= 0)).toBe(true);
    }
  });

  it("cubre pendientes, semana faltante y corrección auditada sin interpolar", () => {
    expect(vehiclesUpToDate(FLEET_PREVIEW_SNAPSHOT.vehicles, FLEET_PREVIEW_SNAPSHOT.readings, "2026-10-06")).toBeLessThan(8);
    expect(FLEET_PREVIEW_SNAPSHOT.vehicles.some((vehicle) => mileageRows(FLEET_PREVIEW_SNAPSHOT.readings.filter((reading) => reading.vehicle_id === vehicle.id)).some((reading) => reading.hasWeeklyGap))).toBe(true);
    expect(FLEET_PREVIEW_SNAPSHOT.readings.filter((reading) => reading.voided_at !== null)).toHaveLength(1);
    expect(FLEET_PREVIEW_SNAPSHOT.readings.filter((reading) => reading.correction_of !== null)).toHaveLength(1);
  });

  it("separa marca y modelo sin completar imágenes no verificadas", () => {
    expect(FLEET_PREVIEW_SNAPSHOT.vehicles.every((vehicle) => vehicle.brand && vehicle.model)).toBe(true);
    expect(FLEET_PREVIEW_SNAPSHOT.vehicles.every((vehicle) => !vehicle.image_url)).toBe(true);
  });

  it("restablece la simulación desde una copia limpia", () => {
    const edited = cloneFleetPreviewSnapshot(FLEET_PREVIEW_SNAPSHOT);
    edited.vehicles[0].brand = "Cambio local";
    edited.readings.pop();
    const reset = cloneFleetPreviewSnapshot(FLEET_PREVIEW_SNAPSHOT);
    expect(reset.vehicles[0]).toMatchObject({ brand: "Toyota", model: "Hilux" });
    expect(reset.readings).toHaveLength(FLEET_PREVIEW_SNAPSHOT.readings.length);
  });
});
