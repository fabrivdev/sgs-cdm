import { activeReadings, type FleetOdometerReading, type FleetVehicle } from "./model";
import type { FleetDateRange } from "./period";

export type FleetReadingPresence = "all" | "with" | "without";

export interface FleetDimensionFilters {
  brand: string;
  model: string;
  readingPresence: FleetReadingPresence;
}

export function fleetBrandOptions(vehicles: readonly FleetVehicle[]) {
  return [...new Set(vehicles.filter((vehicle) => vehicle.active).map((vehicle) => vehicle.brand.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" }));
}

export function fleetModelOptions(vehicles: readonly FleetVehicle[], brand: string) {
  return [...new Set(vehicles
    .filter((vehicle) => vehicle.active && (brand === "all" || vehicle.brand === brand))
    .map((vehicle) => vehicle.model?.trim() ?? "")
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base", numeric: true }));
}

export function vehicleHasReadingInRange(
  vehicleId: string,
  readings: readonly FleetOdometerReading[],
  range: FleetDateRange,
) {
  if (!range.valid) return false;
  return activeReadings(readings).some((reading) => reading.vehicle_id === vehicleId
    && reading.reading_date >= range.from
    && reading.reading_date <= range.to);
}

export function matchesFleetDimensions(
  vehicle: FleetVehicle,
  hasReadingInRange: boolean,
  filters: FleetDimensionFilters,
) {
  if (filters.brand !== "all" && vehicle.brand !== filters.brand) return false;
  if (filters.model !== "all" && vehicle.model?.trim() !== filters.model) return false;
  if (filters.readingPresence === "with" && !hasReadingInRange) return false;
  if (filters.readingPresence === "without" && hasReadingInRange) return false;
  return true;
}
