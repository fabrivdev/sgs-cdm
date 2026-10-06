import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261006132000_add_fleet_management.sql", "utf8");
const seed = readFileSync("supabase/migrations/20261006133000_seed_confirmed_fleet_vehicles.sql", "utf8");
const responsibilityMigration = readFileSync("supabase/migrations/20261006201000_add_fleet_responsibility_history.sql", "utf8");

describe("fleet security and integration contract", () => {
  it("keeps table reads authenticated and all runtime writes behind RPC", () => {
    expect(migration).toContain("FOR SELECT TO authenticated");
    expect(migration).toContain("USING (auth.uid() IS NOT NULL)");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.fleet_vehicles FROM authenticated");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.fleet_odometer_readings FROM authenticated");
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("public.has_section_access(v_user_id, 'servicios.flota')");
  });

  it("enforces normalized unique plates and immutable correction history", () => {
    expect(migration).toContain("CONSTRAINT fleet_vehicles_plate_normalized_key UNIQUE (plate_normalized)");
    expect(migration).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? fleet_readings_active_date_key/);
    expect(migration).toContain("correction_of uuid NULL REFERENCES public.fleet_odometer_readings(id)");
    expect(migration).toContain("SET voided_at = now()");
    expect(migration).toContain("void_reason = btrim(p_reason)");
  });

  it("persists optional model and image provenance without inventing values", () => {
    expect(migration).toContain("model text NULL");
    expect(migration).toContain("model_year smallint NULL");
    expect(migration).toContain("image_url text NULL");
    expect(migration).toContain("image_source_url text NULL");
    expect(migration).toContain("image_license text NULL");
    expect(seed).not.toMatch(/image_url|image_source_url|image_license/);
  });

  it("seeds exactly the approved 15 plates through Fabrizio and no readings", () => {
    const confirmedPlates = (seed.match(/'AA[A-Z0-9-]+'/g) ?? []).map((plate) => plate.replace(/['-]/g, ""));
    expect(new Set(confirmedPlates).size).toBe(15);
    expect(seed).toContain("lower(coalesce(u.email, '')) = 'fabrizio.vega@cdm.com.py'");
    expect(seed.toLowerCase()).not.toContain("federico");
    expect(seed).toContain("ON CONFLICT (plate_normalized) DO UPDATE");
    expect(seed).not.toContain("fleet_odometer_readings");
  });

  it("does not alter service orders or infer billed distance", () => {
    expect(migration).not.toMatch(/UPDATE\s+public\.ordenes_servicio_importadas|ALTER TABLE\s+public\.ordenes_servicio_importadas/i);
    expect(migration).not.toContain("billing.travel");
    expect(migration).not.toMatch(/tarifa|importe\s*\/|\/\s*importe/i);
    expect(seed).not.toMatch(/ordenes_servicio_importadas|billing\.travel/i);
  });

  it("registers the section without copying access from another section", () => {
    expect(migration).toContain("VALUES ('servicios.flota', 'servicios', 'Flota', 45, true)");
    expect(migration).not.toMatch(/SELECT[\s\S]{0,200}FROM public\.user_seccion_acceso/i);
  });

  it("keeps responsibility history append-only behind authenticated RPCs", () => {
    expect(responsibilityMigration).toContain("CREATE TABLE IF NOT EXISTS public.fleet_vehicle_responsibility_events");
    expect(responsibilityMigration).toContain("FOR SELECT TO authenticated");
    expect(responsibilityMigration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.fleet_vehicle_responsibility_events FROM authenticated");
    expect(responsibilityMigration).toContain("v_user_id uuid := public.fleet_assert_write_access()");
    expect(responsibilityMigration).not.toMatch(/UPDATE\s+public\.fleet_vehicle_responsibility_events/i);
    expect(responsibilityMigration).not.toMatch(/DELETE\s+FROM\s+public\.fleet_vehicle_responsibility_events/i);
  });

  it("reuses existing technicians and users without creating identities", () => {
    expect(responsibilityMigration).toContain("public.servicios_es_tecnico_activo(p.id)");
    expect(responsibilityMigration).toContain("p.auth_user_id IS NOT NULL");
    expect(responsibilityMigration).not.toMatch(/INSERT\s+INTO\s+(public\.)?profiles/i);
    expect(responsibilityMigration).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
    expect(responsibilityMigration.toLowerCase()).not.toContain("federico");
  });

  it("preserves the two confirmed baseline names without inventing dates", () => {
    expect(responsibilityMigration).toContain("('AAXR334'::text, 'Hugo Rodas'::text)");
    expect(responsibilityMigration).toContain("('AAXR336'::text, 'Ruben Monges'::text)");
    expect(responsibilityMigration).toMatch(/v_seed\.responsible_name,[\s\S]{0,80}NULL,[\s\S]{0,80}v_actor_ids\[1\]/);
    expect(responsibilityMigration).toContain("coalesce(cardinality(v_profile_ids), 0) <> 1");
    expect(responsibilityMigration).toContain("CONTINUE;");
    expect(responsibilityMigration).toContain("ON CONFLICT (vehicle_id) WHERE effective_date IS NULL DO NOTHING");
    expect(responsibilityMigration).not.toMatch(/RAISE EXCEPTION[^;]*(?:Hugo|Ruben|perfil activo|camioneta|fabrizio)/i);
  });
});
