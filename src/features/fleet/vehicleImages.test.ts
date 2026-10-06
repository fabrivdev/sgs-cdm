import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FleetVehicle } from "./model";
import { fleetVehicleReferenceImage } from "./vehicleImages";

const vehicle = (overrides: Partial<FleetVehicle>): FleetVehicle => ({
  id: "v1", brand: "ISUZU", model: "D-MAX", model_year: 2025, plate: "AAXR-323",
  plate_normalized: "AAXR323", active: true, created_at: "", created_by: "u",
  created_by_name: "Fabrizio", ...overrides,
});

describe("fleet reference images", () => {
  it("maps every confirmed vehicle by its known family and body", () => {
    const payloadPath = resolve(process.cwd(), "docs/flota-altas-reales-pendientes.json");
    const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as {
      confirmed: Array<{ brand: string; model: string; year: number; plate: string }>;
    };
    const references = payload.confirmed.map((entry) => fleetVehicleReferenceImage(vehicle({
      brand: entry.brand,
      model: entry.model,
      model_year: entry.year,
      plate: entry.plate,
    })));

    expect(payload.confirmed).toHaveLength(15);
    expect(references.every(Boolean)).toBe(true);
  });

  it("uses the verified T60 and L200 double-cab references", () => {
    const maxus = fleetVehicleReferenceImage(vehicle({
      brand: "MAXUS", model: "T60 CONFORT 4X4", model_year: 2023,
    }));
    const mitsubishi = fleetVehicleReferenceImage(vehicle({
      brand: "MITSUBISHI", model: "L200 TRITON SPORT GL 4X4", model_year: 2023,
    }));

    expect(maxus).toMatchObject({ author: "RL GNZLZ", license: "CC BY-SA 2.0" });
    expect(maxus?.label).toContain("doble cabina");
    expect(mitsubishi).toMatchObject({ author: "RL GNZLZ", license: "CC BY-SA 2.0" });
    expect(mitsubishi?.label).toContain("doble cabina");
  });

  it("distinguishes the confirmed D-Max single-cab body", () => {
    const reference = fleetVehicleReferenceImage(vehicle({
      model: "D-MAX 4X4 C/S", model_year: 2023, plate: "AAON-294",
    }));

    expect(reference).toMatchObject({ author: "Chanokchon", license: "CC BY-SA 4.0" });
    expect(reference?.label).toContain("cabina simple");
  });

  it("uses a family reference for confirmed 2025 and 2026 D-Max units", () => {
    expect(fleetVehicleReferenceImage(vehicle({ model_year: 2025 }))).toMatchObject({
      author: "Ethan Llamas", license: "CC BY-SA 4.0",
    });
    expect(fleetVehicleReferenceImage(vehicle({ model_year: 2026 }))).toMatchObject({
      author: "Ethan Llamas", license: "CC BY-SA 4.0",
    });
  });

  it("does not guess an image for an unknown model or year", () => {
    expect(fleetVehicleReferenceImage(vehicle({ model_year: 2024 }))).toBeNull();
    expect(fleetVehicleReferenceImage(vehicle({ brand: "Toyota", model: "Hilux" }))).toBeNull();
    expect(fleetVehicleReferenceImage(vehicle({ brand: "MAXUS", model: "T90", model_year: 2023 }))).toBeNull();
    expect(fleetVehicleReferenceImage(vehicle({ brand: "MITSUBISHI", model: "L200 TRITON SPORT", model_year: 2023 }))).toBeNull();
  });
});
