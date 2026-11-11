import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const vehicle = "10000000-0000-0000-0000-000000000001",
  actor = "20000000-0000-0000-0000-000000000001";
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TYPE public.sucursal AS ENUM ('Santa Rita');
CREATE TABLE profiles(id uuid PRIMARY KEY,nombre text,sucursal public.sucursal,es_tecnico boolean);
CREATE TABLE fleet_vehicles(id uuid PRIMARY KEY,active boolean DEFAULT true,brand text);
CREATE TABLE fleet_vehicle_responsibility_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),vehicle_id uuid,responsible_profile_id uuid,responsible_name_snapshot text,effective_date date,recorded_at timestamptz DEFAULT now(),recorded_by uuid,recorded_by_name text);
CREATE FUNCTION fleet_assert_write_access() RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF current_setting('test.denied',true)='true' THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501';END IF;RETURN '${actor}'::uuid;END$$;
CREATE FUNCTION fleet_actor_name(uuid) RETURNS text LANGUAGE sql AS $$SELECT 'Manager'::text$$;
CREATE FUNCTION fleet_list_responsible_candidates() RETURNS TABLE(id uuid,nombre text,sucursal public.sucursal,es_tecnico boolean) LANGUAGE sql AS $$SELECT * FROM profiles$$;
CREATE FUNCTION fleet_save_vehicle(p_id uuid,p_data jsonb) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF p_data->>'brand'='FAIL' THEN RAISE EXCEPTION 'invalid vehicle'; END IF; UPDATE fleet_vehicles SET brand=p_data->>'brand' WHERE id=p_id; RETURN p_id;END$$;
INSERT INTO fleet_vehicles(id) VALUES('${vehicle}');
INSERT INTO fleet_vehicle_responsibility_events(vehicle_id,responsible_name_snapshot,effective_date,recorded_by) VALUES('${vehicle}','Historical Person',NULL,'${actor}');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261111140000_fleet_responsible_contacts.sql",
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
const scalar = async (q) => (await db.query(q)).rows[0];
const first = (
  await scalar("select id from fleet_vehicle_responsibility_events")
).id;
const save = async (
  expected,
  source = "new",
  id = null,
  names = "Maria Elena",
  surnames = "De la Cruz Lopez",
  brand = "Toyota",
  date = "2026-01-01",
) =>
  db.query("select fleet_save_vehicle_responsible($1,$2,$3,$4,$5,$6,$7,$8)", [
    vehicle,
    { brand },
    id,
    source,
    names,
    surnames,
    date,
    expected,
  ]);
await save(first);
let events = (
  await db.query(
    "select * from fleet_vehicle_responsibility_events order by effective_date nulls first",
  )
).rows;
assert.equal(events.length, 2);
assert.equal(events[0].responsible_name_snapshot, "Historical Person");
assert.equal(events[1].responsible_short_name_snapshot, "Maria De la Cruz");
assert.equal(events[1].responsible_profile_id, null);
assert.equal((await scalar("select count(*)::int n from profiles")).n, 0);
assert.equal(
  (await scalar("select count(*)::int n from fleet_list_responsible_options()"))
    .n,
  2,
);
await assert.rejects(
  save(first, "new", null, "Other", "Person"),
  /responsable cambió/,
);
await assert.rejects(save(events[1].id), /ya existe/);
await assert.rejects(
  save(events[1].id, "new", null, "Rollback", "Person", "FAIL"),
  /invalid vehicle/,
);
assert.equal(
  (await scalar("select count(*)::int n from fleet_responsible_contacts")).n,
  2,
);
await assert.rejects(
  save(
    events[1].id,
    "fleet",
    events[1].responsible_contact_id,
    null,
    null,
    "Toyota",
    "2025-01-01",
  ),
  /fecha/,
);
await db.exec("SET test.denied='true'");
await assert.rejects(
  db.query("select * from fleet_list_responsible_options()"),
  /denied/,
);
await assert.rejects(save(events[1].id, "none"), /denied/);
await db.exec("SET test.denied='false'");
await save(events[1].id, "none");
assert.equal(
  (
    await scalar(
      "select count(*)::int n from fleet_vehicle_responsibility_events",
    )
  ).n,
  3,
);
await db.close();
console.log(
  "OK: contacts, short names, retained history, conflict, duplicate, rollback, dates, permissions and unassignment.",
);
