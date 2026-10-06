/* eslint-disable @typescript-eslint/no-explicit-any -- The generated client has not been refreshed with the Fleet tables/RPCs yet. */
import { supabase } from "@/integrations/supabase/client";
import type {
  FleetOdometerReading,
  FleetResponsibleCandidate,
  FleetResponsibilityEvent,
  FleetSnapshot,
  FleetVehicle,
} from "./model";

export interface CreateFleetVehicleInput {
  brand: string;
  model: string | null;
  plate: string;
  initialReadingDate: string | null;
  initialOdometerKm: number | null;
}

export interface AddFleetReadingInput {
  vehicleId: string;
  readingDate: string;
  odometerKm: number;
}

export interface CorrectFleetReadingInput extends AddFleetReadingInput {
  readingId: string;
  reason: string;
}

export interface SetFleetResponsibleInput {
  vehicleId: string;
  responsibleProfileId: string | null;
  effectiveDate: string;
}

export async function loadFleetSnapshot(): Promise<FleetSnapshot> {
  const [vehiclesResult, readingsResult, responsibilityResult, candidatesResult] = await Promise.all([
    (supabase.from("fleet_vehicles" as never) as any)
      .select("id, brand, model, model_year, image_url, image_source_url, image_license, plate, plate_normalized, active, created_at, created_by, created_by_name")
      .order("brand")
      .order("plate"),
    (supabase.from("fleet_odometer_readings" as never) as any)
      .select("id, vehicle_id, reading_date, odometer_km, reading_kind, correction_of, created_at, created_by, created_by_name, voided_at, voided_by, voided_by_name, void_reason")
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false }),
    (supabase.from("fleet_vehicle_responsibility_events" as never) as any)
      .select("id, vehicle_id, responsible_profile_id, responsible_name_snapshot, effective_date, recorded_at, recorded_by, recorded_by_name")
      .order("effective_date", { ascending: false, nullsFirst: false })
      .order("recorded_at", { ascending: false }),
    (supabase.rpc as any)("fleet_list_responsible_candidates"),
  ]);

  if (vehiclesResult.error) throw vehiclesResult.error;
  if (readingsResult.error) throw readingsResult.error;
  if (responsibilityResult.error) throw responsibilityResult.error;
  if (candidatesResult.error) throw candidatesResult.error;

  return {
    vehicles: (vehiclesResult.data ?? []) as FleetVehicle[],
    readings: (readingsResult.data ?? []).map((row: FleetOdometerReading) => ({
      ...row,
      odometer_km: Number(row.odometer_km),
    })),
    responsibilityEvents: (responsibilityResult.data ?? []) as FleetResponsibilityEvent[],
    responsibleCandidates: [...((candidatesResult.data ?? []) as FleetResponsibleCandidate[])]
      .filter((candidate, index, rows) => rows.findIndex((row) => row.id === candidate.id) === index)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es")),
  };
}

export async function createFleetVehicle(input: CreateFleetVehicleInput) {
  const { data, error } = await (supabase.rpc as any)("fleet_create_vehicle", {
    p_brand: input.brand,
    p_plate: input.plate,
    p_model: input.model,
    p_initial_reading_date: input.initialReadingDate,
    p_initial_odometer_km: input.initialOdometerKm,
  });
  if (error) throw error;
  return data as string;
}

export async function addFleetReading(input: AddFleetReadingInput) {
  const { data, error } = await (supabase.rpc as any)("fleet_add_odometer_reading", {
    p_vehicle_id: input.vehicleId,
    p_reading_date: input.readingDate,
    p_odometer_km: input.odometerKm,
  });
  if (error) throw error;
  return data as string;
}

export async function correctFleetReading(input: CorrectFleetReadingInput) {
  const { data, error } = await (supabase.rpc as any)("fleet_correct_odometer_reading", {
    p_reading_id: input.readingId,
    p_reading_date: input.readingDate,
    p_odometer_km: input.odometerKm,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}

export async function setFleetResponsible(input: SetFleetResponsibleInput) {
  const { data, error } = await (supabase.rpc as any)("fleet_set_vehicle_responsible", {
    p_vehicle_id: input.vehicleId,
    p_responsible_profile_id: input.responsibleProfileId,
    p_effective_date: input.effectiveDate,
  });
  if (error) throw error;
  return data as string;
}

export function fleetErrorMessage(error: unknown) {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  if (/fleet_|schema cache|does not exist|could not find/i.test(message)) {
    return "Flota no está disponible en esta conexión.";
  }
  return message || "No se pudo completar la operación.";
}
