// @vitest-environment node

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261006201000_add_fleet_responsibility_history.sql",
  "utf8",
);

const HUGO_ID = "00000000-0000-0000-0000-000000000101";
const HUGO_INACTIVE_ID = "00000000-0000-0000-0000-000000000102";
const RUBEN_ONE_ID = "00000000-0000-0000-0000-000000000201";
const RUBEN_TWO_ID = "00000000-0000-0000-0000-000000000202";

async function createFixture(db: PGlite) {
  await db.exec(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TYPE public.sucursal AS ENUM ('ASU');

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY,
      email text
    );

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      nombre text NOT NULL,
      sucursal public.sucursal NOT NULL DEFAULT 'ASU',
      activo boolean,
      auth_user_id uuid,
      es_tecnico boolean NOT NULL DEFAULT false
    );

    CREATE TABLE public.fleet_vehicles (
      id uuid PRIMARY KEY,
      plate_normalized text NOT NULL,
      active boolean NOT NULL DEFAULT true
    );

    CREATE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

    CREATE FUNCTION public.has_section_access(uuid, text)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$ SELECT true $$;

    CREATE FUNCTION public.servicios_es_tecnico_activo(p_profile_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    AS $$
      SELECT coalesce((SELECT p.es_tecnico FROM public.profiles p WHERE p.id = p_profile_id), false)
    $$;

    CREATE FUNCTION public.fleet_assert_write_access()
    RETURNS uuid
    LANGUAGE sql
    AS $$ SELECT auth.uid() $$;

    CREATE FUNCTION public.fleet_actor_name(uuid)
    RETURNS text
    LANGUAGE sql
    AS $$ SELECT 'Fabrizio Vega'::text $$;

    INSERT INTO auth.users (id, email) VALUES
      ('00000000-0000-0000-0000-000000000001', 'fabrizio.vega@cdm.com.py');

    INSERT INTO public.fleet_vehicles (id, plate_normalized) VALUES
      ('00000000-0000-0000-0000-000000000334', 'AAXR334'),
      ('00000000-0000-0000-0000-000000000336', 'AAXR336');
  `);
}

async function baselines(db: PGlite) {
  return (await db.query<{
    plate_normalized: string;
    responsible_profile_id: string;
    responsible_name_snapshot: string;
    effective_date: string | null;
  }>(`
    SELECT
      v.plate_normalized,
      e.responsible_profile_id::text,
      e.responsible_name_snapshot,
      e.effective_date::text
    FROM public.fleet_vehicle_responsibility_events e
    JOIN public.fleet_vehicles v ON v.id = e.vehicle_id
    ORDER BY v.plate_normalized
  `)).rows;
}

describe("fleet responsibility migration in isolated PostgreSQL", () => {
  it("keeps optional baselines safe for 0/1/2 matches, inactive profiles and reruns", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await createFixture(db);

      await db.exec(`
        INSERT INTO public.profiles (id, nombre, activo, es_tecnico)
        VALUES ('${HUGO_INACTIVE_ID}', 'Hugo Rodas', false, true);
      `);

      await db.exec(migration);
      expect(await baselines(db)).toEqual([]);

      await db.exec(`
        INSERT INTO public.profiles (id, nombre, activo, es_tecnico)
        VALUES ('${HUGO_ID}', 'Hugo Rodas', true, true);
      `);
      await db.exec(migration);
      expect(await baselines(db)).toEqual([
        {
          plate_normalized: "AAXR334",
          responsible_profile_id: HUGO_ID,
          responsible_name_snapshot: "Hugo Rodas",
          effective_date: null,
        },
      ]);

      await db.exec(`
        INSERT INTO public.profiles (id, nombre, activo, es_tecnico) VALUES
          ('${RUBEN_ONE_ID}', 'Ruben Monges', true, true),
          ('${RUBEN_TWO_ID}', 'Ruben Monges', true, true);
      `);
      await db.exec(migration);
      expect(await baselines(db)).toHaveLength(1);

      await db.exec(`UPDATE public.profiles SET activo = false WHERE id = '${RUBEN_TWO_ID}'`);
      await db.exec(migration);
      expect(await baselines(db)).toEqual([
        {
          plate_normalized: "AAXR334",
          responsible_profile_id: HUGO_ID,
          responsible_name_snapshot: "Hugo Rodas",
          effective_date: null,
        },
        {
          plate_normalized: "AAXR336",
          responsible_profile_id: RUBEN_ONE_ID,
          responsible_name_snapshot: "Ruben Monges",
          effective_date: null,
        },
      ]);

      await db.exec(`
        DROP FUNCTION public.fleet_set_vehicle_responsible(uuid, uuid, date);
        DROP POLICY "Authenticated users read fleet responsibilities"
          ON public.fleet_vehicle_responsibility_events;
      `);
      await db.exec(migration);

      expect(await baselines(db)).toHaveLength(2);
      const repaired = await db.query<{ function_exists: boolean; policy_count: number }>(`
        SELECT
          to_regprocedure('public.fleet_set_vehicle_responsible(uuid,uuid,date)') IS NOT NULL AS function_exists,
          (
            SELECT count(*)::int
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'fleet_vehicle_responsibility_events'
              AND policyname = 'Authenticated users read fleet responsibilities'
          ) AS policy_count
      `);
      expect(repaired.rows).toEqual([{ function_exists: true, policy_count: 1 }]);
    } finally {
      await db.close();
    }
  });
});
