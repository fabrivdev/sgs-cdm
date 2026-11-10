// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, it, expect } from "vitest";

const actor = "00000000-0000-4000-8000-000000000001";
async function fixture(db: PGlite) {
  await db.exec(`CREATE EXTENSION pgcrypto; CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TYPE public.app_role AS ENUM ('superadmin','admin','jefatura','gerencia','operativo');
 CREATE TYPE public.sucursal AS ENUM ('ASU');
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,nombre text,auth_user_id uuid,activo boolean,es_tecnico boolean,sucursal public.sucursal);
 CREATE TABLE public.app_secciones(id text PRIMARY KEY,modulo_id text,nombre text,orden integer,activo boolean);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('test.uid',true),'')::uuid$$;
 CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $2::text=current_setting('test.role',true)$$;
 CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('test.access',true)='yes'$$;
 CREATE FUNCTION public.servicios_es_tecnico_activo(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 INSERT INTO auth.users VALUES ('${actor}','fixture@example.invalid');
 SELECT set_config('test.uid','${actor}',false),set_config('test.role','jefatura',false),set_config('test.access','yes',false);`);
  for (const file of [
    "20261006132000_add_fleet_management.sql",
    "20261006201000_add_fleet_responsibility_history.sql",
    "20261110120000_fleet_operations.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec("SET ROLE authenticated");
}
const vehicle = {
  plate: "TEST-123",
  brand: "Prueba",
  model: "Modelo",
  operational_status: "Operativa",
  lifecycle_status: "Activa",
  branch: "Prueba",
  department: "Taller",
  responsible_name: "Responsable de prueba",
};
describe("fleet operations / isolated PostgreSQL", () => {
  it("imports once, preserves manual changes, links only exact plates and enforces upload-only access", async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    const rpc = async (name: string, args: unknown[]) =>
      db.query(
        `SELECT public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) AS value`,
        args,
      );
    try {
      await fixture(db);
      await expect(
        rpc("fleet_load_initial", ["vehicles", "fixture", "checksum1", null]),
      ).rejects.toThrow("Carga inicial inválida");
      await expect(
        rpc("fleet_save_vehicle", [
          null,
          JSON.stringify({ ...vehicle, operational_status: "Inválido" }),
        ]),
      ).rejects.toThrow();
      expect(
        (await db.query("SELECT * FROM fleet_vehicles")).rows,
      ).toHaveLength(0);
      expect(
        (
          await rpc("fleet_load_initial", [
            "vehicles",
            "fixture",
            "checksum1",
            JSON.stringify([vehicle]),
          ])
        ).rows,
      ).toEqual([{ value: 1 }]);
      const vehicles = await db.query<{ id: string; branch: string }>(
        "SELECT id,branch FROM fleet_vehicles",
      );
      const id = vehicles.rows[0].id;
      expect(vehicles.rows[0].branch).toBe("Prueba");
      await rpc("fleet_edit_vehicle", [
        id,
        JSON.stringify({ ...vehicle, operational_status: "En taller" }),
      ]);
      expect(
        (
          await rpc("fleet_load_initial", [
            "vehicles",
            "fixture",
            "checksum1",
            JSON.stringify([vehicle]),
          ])
        ).rows,
      ).toEqual([{ value: 0 }]);
      await expect(
        rpc("fleet_load_initial", [
          "vehicles",
          "fixture",
          "different",
          JSON.stringify([vehicle]),
        ]),
      ).rejects.toThrow("ya se realizó");
      expect(
        (await db.query("SELECT operational_status FROM fleet_vehicles")).rows,
      ).toEqual([{ operational_status: "En taller" }]);
      const fuel = (plate: string, key: string, liters = 10) => ({
        plate,
        source_key: key,
        occurred_at: "2026-10-01T10:00:00",
        liters,
        net_amount: liters * 10,
        product: "Diesel",
        station: "Prueba",
        raw_data: { key, liters },
      });
      const rows = [
        fuel("test 123", "a"),
        fuel("OTRA999", "b"),
        fuel("test123", "c", -5),
      ];
      expect(
        (await rpc("fleet_import_fuel_entries", [JSON.stringify(rows)])).rows,
      ).toEqual([{ value: 3 }]);
      expect(
        (await rpc("fleet_import_fuel_entries", [JSON.stringify(rows)])).rows,
      ).toEqual([{ value: 0 }]);
      expect(
        (await db.query("SELECT count(*)::int AS n FROM fleet_vehicles")).rows,
      ).toEqual([{ n: 1 }]);
      expect(
        (
          await db.query(
            "SELECT vehicle_id FROM fleet_fuel_entries WHERE source_key='b'",
          )
        ).rows,
      ).toEqual([{ vehicle_id: null }]);
      expect(
        (
          await db.query(
            "SELECT vehicle_id FROM fleet_fuel_entries WHERE source_key='a'",
          )
        ).rows,
      ).toEqual([{ vehicle_id: id }]);
      await expect(
        rpc("fleet_import_fuel_entries", [
          JSON.stringify([fuel("test123", "a", 25)]),
        ]),
      ).rejects.toThrow("Conflicto");
      const history = {
        plate: "test123",
        source_key: "sheet:4",
        occurred_on: null,
        works: [{ work: "Filtro", value: "X", comment: "original" }],
        raw_data: { original: true },
      };
      await rpc("fleet_load_initial", [
        "history",
        "fixture-history",
        "h1",
        JSON.stringify([history]),
      ]);
      await expect(
        rpc("fleet_load_initial", [
          "history",
          "fixture-history",
          "h2",
          JSON.stringify([history]),
        ]),
      ).rejects.toThrow("ya se realizó");
      await db.exec("SELECT set_config('test.role','operativo',false)");
      for (const table of [
        "fleet_vehicles",
        "fleet_odometer_readings",
        "fleet_vehicle_responsibility_events",
        "fleet_maintenance_history",
        "fleet_fuel_entries",
        "fleet_maintenance_invoices",
        "fleet_change_events",
        "fleet_initial_loads",
      ])
        expect((await db.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
      await expect(
        rpc("fleet_create_vehicle", ["Prueba", "NO123", null, null, null]),
      ).rejects.toThrow("Sin acceso");
      await expect(
        rpc("fleet_list_responsible_candidates", []),
      ).rejects.toThrow("Sin acceso");
      await expect(
        rpc("fleet_load_initial", ["history", "fixture", "h1", "[]"]),
      ).rejects.toThrow("Sin acceso");
      const inv = "00000000-0000-4000-8000-000000000002";
      const invoice = {
        plate: "NO123",
        supplier: "Taller",
        invoice_number: "001",
        invoice_date: "2026-10-01",
        categories: ["Filtros"],
        description: "Trabajo original",
        filename: "prueba.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
      };
      const result = await rpc("fleet_reserve_invoice", [
        inv,
        JSON.stringify(invoice),
      ]);
      const path = (result.rows[0] as { value: string }).value;
      expect(
        (
          await rpc("fleet_reserve_invoice", [
            "00000000-0000-4000-8000-000000000003",
            JSON.stringify(invoice),
          ])
        ).rows,
      ).toEqual(result.rows);
      await expect(rpc("fleet_finalize_invoice", [inv])).rejects.toThrow(
        "no está completo",
      );
      await db.query(
        "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3)",
        [
          "fleet-invoices",
          path,
          JSON.stringify({ size: 10, mimetype: "application/pdf" }),
        ],
      );
      expect((await db.query("SELECT * FROM storage.objects")).rows).toEqual(
        [],
      );
      await rpc("fleet_finalize_invoice", [inv]);
      expect(
        (await rpc("fleet_reserve_invoice", [inv, JSON.stringify(invoice)]))
          .rows,
      ).toEqual(result.rows);
      await expect(
        rpc("fleet_set_invoice_amount", [inv, 100, "PYG"]),
      ).rejects.toThrow("Sin acceso");
      await db.exec("SELECT set_config('test.role','jefatura',false)");
      expect(
        (
          await db.query(
            "SELECT status,vehicle_id,amount FROM fleet_maintenance_invoices",
          )
        ).rows,
      ).toEqual([{ status: "uploaded", vehicle_id: null, amount: null }]);
      expect(
        (await db.query("SELECT * FROM storage.objects")).rows,
      ).toHaveLength(1);
      await rpc("fleet_set_invoice_amount", [inv, 100, "PYG"]);
      expect(
        (await db.query("SELECT * FROM fleet_invoice_audit")).rows,
      ).toHaveLength(1);
      await rpc("fleet_create_vehicle", ["Prueba", "NO-123", null, null, null]);
      expect(
        (
          await db.query(
            "SELECT vehicle_id IS NOT NULL AS linked FROM fleet_maintenance_invoices",
          )
        ).rows,
      ).toEqual([{ linked: true }]);
      await db.exec("SELECT set_config('test.access','no',false)");
      expect((await db.query("SELECT * FROM fleet_vehicles")).rows).toEqual([]);
      await expect(
        rpc("fleet_reserve_invoice", [inv, JSON.stringify(invoice)]),
      ).rejects.toThrow("Sin permiso");
    } finally {
      await db.close();
    }
  }, 30000);
});
