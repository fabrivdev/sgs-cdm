import type {
  FuelEntry,
  Invoice,
  MaintenanceEntry,
  ManagedVehicle,
} from "./managementModel";
import { vehicleMileageDisplay } from "./managementModel";
import { vehicleLatestReading, type FleetOdometerReading } from "./model";
import { fuelOdometerIssues } from "./fuelOdometer";
import { todayInParaguay } from "./period";

const validKm = (km: number | null | undefined): km is number =>
  km != null && Number.isFinite(Number(km)) && Number(km) >= 0;
export function latestFuelMileage(
  rows: FuelEntry[],
  today = todayInParaguay(),
) {
  const issues = fuelOdometerIssues(rows, () => "same-vehicle-or-plate");
  const eligible = rows.filter(
    (r) =>
      r.occurred_at.slice(0, 10) <= today &&
      validKm(r.odometer_km) &&
      !issues.has(r) &&
      r.liters > 0 &&
      r.net_amount >= 0 &&
      !/aceite|lubricante/i.test(r.product) &&
      /diesel|nafta|gasolina|gasoil/i.test(r.product),
  );
  const latest = eligible.sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  )[0];
  if (!latest) return null;
  const sameTime = rows.filter((row) => row.occurred_at === latest.occurred_at);
  const km = sameTime.every((row) => row.odometer_km === latest.odometer_km)
    ? Number(latest.odometer_km)
    : null;
  return { occurred_at: latest.occurred_at, km };
}

export function currentVehicleMileage(
  vehicle: ManagedVehicle,
  readings: FleetOdometerReading[],
  fuel: FuelEntry[],
  today = todayInParaguay(),
) {
  const manual = vehicleLatestReading(
    vehicle.id,
    readings.filter((r) => r.reading_date <= today),
  );
  const rows = fuel.filter((r) => r.vehicle_id === vehicle.id);
  const latest = latestFuelMileage(rows, today);
  if (
    latest &&
    (!manual || latest.occurred_at.slice(0, 10) > manual.reading_date)
  ) {
    return latest.km == null
      ? { km: null, date: null, source: null }
      : {
          km: latest.km,
          date: latest.occurred_at.slice(0, 10),
          source: "Combustible",
        };
  }
  return vehicleMileageDisplay(vehicle, manual);
}
export function maintenanceAlert(
  vehicle: ManagedVehicle,
  current: { km: number | null; date: string | null },
  history: MaintenanceEntry[],
  invoices: Invoice[],
  today = todayInParaguay(),
) {
  const result = (label: string, due = false) => ({ label, due });
  const interval = Number(vehicle.maintenance_interval_km);
  if (!Number.isInteger(interval) || interval <= 0)
    return result("Sin intervalo");
  const events = [
    ...history
      .filter((r) => r.vehicle_id === vehicle.id && r.occurred_on)
      .map((r) => ({ date: r.occurred_on!, km: r.odometer_km })),
    ...invoices
      .filter(
        (r) =>
          r.vehicle_id === vehicle.id &&
          r.status === "uploaded" &&
          r.performed_on,
      )
      .map((r) => ({ date: r.performed_on!, km: r.odometer_km })),
  ]
    .filter((r) => r.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last = events[0];
  if (!last) return result("Sin mantenimiento");
  if (!validKm(last.km)) return result("Sin km de mantenimiento");
  if (
    events.some(
      (r) =>
        r.date === last.date &&
        (!validKm(r.km) || Number(r.km) !== Number(last.km)),
    )
  )
    return result("Revisar mantenimiento");
  if (!validKm(current.km)) return result("Sin km actuales");
  if (!current.date || current.date < last.date)
    return result("Sin lectura posterior");
  if (Number(current.km) < Number(last.km)) return result("Revisar km");
  const remaining = Number(last.km) + interval - Number(current.km);
  const number = Math.abs(remaining).toLocaleString("es-PY", {
    maximumFractionDigits: 2,
  });
  return remaining > 0
    ? result(`Faltan ${number} km`)
    : remaining === 0
      ? result("Corresponde ahora", true)
      : result(`Vencido por ${number} km`, true);
}
