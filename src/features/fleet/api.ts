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

export async function loadFleetSnapshot(includeCandidates = true): Promise<FleetSnapshot> {
  const fetchAll = async (table: string) => {
    const data: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await (supabase.from(table as never) as any).select('*').order('id').range(offset, offset + 499);
      if (result.error) return {data: [], error: result.error};
      data.push(...result.data);
      if (result.data.length < 500) return {data, error: null};
    }
  };
  const [vehiclesResult, readingsResult, responsibilityResult, candidatesResult] = await Promise.all([
    fetchAll('fleet_vehicles'), fetchAll('fleet_odometer_readings'), fetchAll('fleet_vehicle_responsibility_events'),
    includeCandidates ? (supabase.rpc as any)('fleet_list_responsible_options') : Promise.resolve({ data: [], error: null }),
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
