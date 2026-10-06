export interface FleetVehicle {
  id: string;
  brand: string;
  model?: string | null;
  model_year?: number | null;
  image_url?: string | null;
  image_source_url?: string | null;
  image_license?: string | null;
  plate: string;
  plate_normalized: string;
  active: boolean;
  created_at: string;
  created_by: string;
  created_by_name: string;
}

export type FleetReadingKind = "initial" | "weekly";

export interface FleetOdometerReading {
  id: string;
  vehicle_id: string;
  reading_date: string;
  odometer_km: number;
  reading_kind: FleetReadingKind;
  correction_of: string | null;
  created_at: string;
  created_by: string;
  created_by_name: string;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface FleetResponsibleCandidate {
  id: string;
  nombre: string;
  sucursal: string | null;
  es_tecnico: boolean;
}

export interface FleetResponsibilityEvent {
  id: string;
  vehicle_id: string;
  responsible_profile_id: string | null;
  responsible_name_snapshot: string | null;
  effective_date: string | null;
  recorded_at: string;
  recorded_by: string;
  recorded_by_name: string;
}

export interface FleetSnapshot {
  vehicles: FleetVehicle[];
  readings: FleetOdometerReading[];
  responsibleCandidates: FleetResponsibleCandidate[];
  responsibilityEvents: FleetResponsibilityEvent[];
}

export interface FleetMileageRow extends FleetOdometerReading {
  previousReadingDate: string | null;
  elapsedDays: number | null;
  travelledKm: number | null;
  hasWeeklyGap: boolean;
}

export interface ReadingValidationIssue {
  code: "duplicate" | "lower_previous" | "higher_next" | "before_initial";
  message: string;
}

const DAY_MS = 86_400_000;

export function normalizePlate(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function dateDistanceInDays(from: string, to: string) {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.round((toTime - fromTime) / DAY_MS);
}

export function activeReadings(readings: readonly FleetOdometerReading[]) {
  return readings
    .filter((reading) => reading.voided_at === null)
    .sort((left, right) => left.reading_date.localeCompare(right.reading_date)
      || left.created_at.localeCompare(right.created_at));
}

/**
 * Calcula el recorrido entre lecturas reales consecutivas. Un intervalo largo
 * permanece como un solo intervalo: no crea semanas ni kilometraje sintético.
 */
export function mileageRows(readings: readonly FleetOdometerReading[]): FleetMileageRow[] {
  const valid = activeReadings(readings);
  return valid.map((reading, index) => {
    const previous = index > 0 ? valid[index - 1] : null;
    const elapsedDays = previous ? dateDistanceInDays(previous.reading_date, reading.reading_date) : null;
    return {
      ...reading,
      previousReadingDate: previous?.reading_date ?? null,
      elapsedDays,
      travelledKm: previous ? reading.odometer_km - previous.odometer_km : null,
      hasWeeklyGap: elapsedDays !== null && elapsedDays > 8,
    };
  });
}

export function validateReading(
  readings: readonly FleetOdometerReading[],
  readingDate: string,
  odometerKm: number,
  excludeReadingId?: string,
  readingKind: FleetReadingKind = "weekly",
): ReadingValidationIssue | null {
  const valid = activeReadings(readings).filter((reading) => reading.id !== excludeReadingId);
  if (valid.some((reading) => reading.reading_date === readingDate)) {
    return { code: "duplicate", message: "Ya existe una lectura para esa fecha." };
  }

  const previous = [...valid].reverse().find((reading) => reading.reading_date < readingDate);
  const next = valid.find((reading) => reading.reading_date > readingDate);

  if (readingKind === "initial" && valid.some((reading) => reading.reading_date < readingDate)) {
    return { code: "before_initial", message: "La lectura inicial debe ser la primera fecha." };
  }
  if (readingKind !== "initial" && !previous && valid.length > 0) {
    return { code: "before_initial", message: "La fecha debe ser posterior a la lectura inicial." };
  }
  if (previous && odometerKm < previous.odometer_km) {
    return { code: "lower_previous", message: `El kilometraje no puede ser menor que ${previous.odometer_km.toLocaleString("es-PY")} km.` };
  }
  if (next && odometerKm > next.odometer_km) {
    return { code: "higher_next", message: `El kilometraje no puede superar la lectura posterior de ${next.odometer_km.toLocaleString("es-PY")} km.` };
  }
  return null;
}

export function vehicleLatestReading(vehicleId: string, readings: readonly FleetOdometerReading[]) {
  const vehicleReadings = activeReadings(readings.filter((reading) => reading.vehicle_id === vehicleId));
  return vehicleReadings[vehicleReadings.length - 1] ?? null;
}

export function currentFleetResponsibility(
  vehicleId: string,
  events: readonly FleetResponsibilityEvent[],
  onDate: string,
) {
  return events
    .filter((event) => event.vehicle_id === vehicleId && (event.effective_date === null || event.effective_date <= onDate))
    .sort((left, right) => {
      const leftDate = left.effective_date ?? "";
      const rightDate = right.effective_date ?? "";
      return rightDate.localeCompare(leftDate)
        || right.recorded_at.localeCompare(left.recorded_at)
        || right.id.localeCompare(left.id);
    })[0] ?? null;
}

export function fleetResponsibilityHistory(
  vehicleId: string,
  events: readonly FleetResponsibilityEvent[],
) {
  return events
    .filter((event) => event.vehicle_id === vehicleId)
    .sort((left, right) => {
      const leftDate = left.effective_date ?? "";
      const rightDate = right.effective_date ?? "";
      return rightDate.localeCompare(leftDate)
        || right.recorded_at.localeCompare(left.recorded_at)
        || right.id.localeCompare(left.id);
    });
}

export function fleetTotalTravelled(readings: readonly FleetOdometerReading[]) {
  const byVehicle = new Map<string, FleetOdometerReading[]>();
  for (const reading of readings) {
    const vehicleReadings = byVehicle.get(reading.vehicle_id) ?? [];
    vehicleReadings.push(reading);
    byVehicle.set(reading.vehicle_id, vehicleReadings);
  }
  return [...byVehicle.values()].reduce((total, vehicleReadings) => total
    + mileageRows(vehicleReadings).reduce((subtotal, reading) => subtotal + (reading.travelledKm ?? 0), 0), 0);
}

export function vehiclesUpToDate(vehicles: readonly FleetVehicle[], readings: readonly FleetOdometerReading[], today: string) {
  return vehicles.filter((vehicle) => {
    if (!vehicle.active) return false;
    const latest = vehicleLatestReading(vehicle.id, readings);
    const elapsed = latest ? dateDistanceInDays(latest.reading_date, today) : null;
    return elapsed !== null && elapsed >= 0 && elapsed <= 8;
  }).length;
}
