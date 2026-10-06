import type { FleetOdometerReading, FleetSnapshot, FleetVehicle } from "./model";

const DEMO_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_ACTOR_NAME = "Fabrizio (DEMO)";

interface DemoVehicleConfig {
  id: string;
  brand: string;
  model: string;
  plate: string;
  dates: string[];
  initialKm: number;
  increments: number[];
  correctionIndex?: number;
}

export type FleetPreviewSnapshot = FleetSnapshot;

const commonDates = [
  "2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01",
  "2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06",
];

const configs: DemoVehicleConfig[] = [
  { id: "10000000-0000-4000-8000-000000000001", brand: "Toyota", model: "Hilux", plate: "DEMO-001", dates: commonDates, initialKm: 48_320, increments: [412, 536, 388, 621, 474, 505, 438, 590, 462] },
  { id: "10000000-0000-4000-8000-000000000002", brand: "Ford", model: "Ranger", plate: "DEMO-002", dates: commonDates.slice(0, 9), initialKm: 72_840, increments: [328, 455, 510, 376, 642, 418, 487, 399] },
  { id: "10000000-0000-4000-8000-000000000003", brand: "Chevrolet", model: "S10", plate: "DEMO-003", dates: commonDates.filter((date) => date !== "2026-08-25"), initialKm: 36_110, increments: [292, 344, 815, 403, 521, 367, 448, 390] },
  { id: "10000000-0000-4000-8000-000000000004", brand: "Volkswagen", model: "Amarok", plate: "DEMO-004", dates: ["2026-07-29", "2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16"], initialKm: 91_450, increments: [510, 472, 633, 405, 558, 490, 521] },
  { id: "10000000-0000-4000-8000-000000000005", brand: "Nissan", model: "Frontier", plate: "DEMO-005", dates: commonDates, initialKm: 27_900, increments: [365, 408, 451, 399, 476, 522, 384, 447, 416], correctionIndex: 5 },
  { id: "10000000-0000-4000-8000-000000000006", brand: "Fiat", model: "Strada", plate: "DEMO-006", dates: ["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"], initialKm: 18_660, increments: [244, 306, 280, 355, 269, 318, 291] },
  { id: "10000000-0000-4000-8000-000000000007", brand: "Mercedes-Benz", model: "Sprinter Larga", plate: "DEMO-007", dates: commonDates, initialKm: 112_780, increments: [702, 654, 788, 690, 815, 742, 676, 804, 731] },
  { id: "10000000-0000-4000-8000-000000000008", brand: "Renault", model: "Kangoo", plate: "DEMO-008", dates: commonDates.slice(0, 8), initialKm: 63_205, increments: [198, 245, 221, 264, 236, 278, 209] },
];

function vehicle(config: DemoVehicleConfig): FleetVehicle {
  return {
    id: config.id,
    brand: config.brand,
    model: config.model,
    plate: config.plate,
    plate_normalized: config.plate.replace(/[^A-Z0-9]/g, ""),
    active: true,
    created_at: `${config.dates[0]}T08:00:00Z`,
    created_by: DEMO_ACTOR_ID,
    created_by_name: DEMO_ACTOR_NAME,
  };
}

function readings(config: DemoVehicleConfig): FleetOdometerReading[] {
  let odometer = config.initialKm;
  const result: FleetOdometerReading[] = [];

  config.dates.forEach((readingDate, index) => {
    if (index > 0) odometer += config.increments[index - 1];
    const baseId = `${config.id.slice(0, 8)}-${String(index + 1).padStart(4, "0")}-4000-8000-${config.id.slice(-12)}`;

    if (config.correctionIndex === index) {
      const originalId = `${config.id.slice(0, 8)}-9000-4000-8000-${config.id.slice(-12)}`;
      result.push({
        id: originalId,
        vehicle_id: config.id,
        reading_date: readingDate,
        odometer_km: odometer + 180,
        reading_kind: "weekly",
        correction_of: null,
        created_at: `${readingDate}T08:15:00Z`,
        created_by: DEMO_ACTOR_ID,
        created_by_name: DEMO_ACTOR_NAME,
        voided_at: `${readingDate}T10:40:00Z`,
        voided_by: DEMO_ACTOR_ID,
        voided_by_name: DEMO_ACTOR_NAME,
        void_reason: "Foto del odómetro revisada",
      });
      result.push({
        id: baseId,
        vehicle_id: config.id,
        reading_date: readingDate,
        odometer_km: odometer,
        reading_kind: "weekly",
        correction_of: originalId,
        created_at: `${readingDate}T10:41:00Z`,
        created_by: DEMO_ACTOR_ID,
        created_by_name: DEMO_ACTOR_NAME,
        voided_at: null,
        voided_by: null,
        voided_by_name: null,
        void_reason: null,
      });
      return;
    }

    result.push({
      id: baseId,
      vehicle_id: config.id,
      reading_date: readingDate,
      odometer_km: odometer,
      reading_kind: index === 0 ? "initial" : "weekly",
      correction_of: null,
      created_at: `${readingDate}T08:15:00Z`,
      created_by: DEMO_ACTOR_ID,
      created_by_name: DEMO_ACTOR_NAME,
      voided_at: null,
      voided_by: null,
      voided_by_name: null,
      void_reason: null,
    });
  });

  return result;
}

export const FLEET_PREVIEW_SNAPSHOT: FleetPreviewSnapshot = {
  vehicles: configs.map(vehicle),
  readings: configs.flatMap(readings),
};
