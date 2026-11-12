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
    "20261110150000_fleet_recovery.sql",
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
        supplier_tax_id: "80000001-1",
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
        "incompleta",
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

      // A real registration change must retain old expenses and accept later
      // invoices for the historical plate, without creating another vehicle.
      await rpc("fleet_edit_vehicle", [
        id,
        JSON.stringify({
          ...vehicle,
          plate: "NEW-123",
          plate_change_type: "change",
          plate_change_reason: "Nueva chapa",
        }),
      ]);
      expect(
        (
          await db.query(
            "SELECT vehicle_id FROM fleet_fuel_entries WHERE source_key='a'",
          )
        ).rows,
      ).toEqual([{ vehicle_id: id }]);
      expect(
        (await db.query("SELECT vehicle_id FROM fleet_maintenance_history"))
          .rows,
      ).toEqual([{ vehicle_id: id }]);
      await expect(
        rpc("fleet_create_vehicle", ["Prueba", "TEST123", null, null, null]),
      ).rejects.toThrow("historial");
      await expect(
        rpc("fleet_reserve_invoice", [
          "00000000-0000-4000-8000-000000000009",
          JSON.stringify({
            ...invoice,
            supplier: "Otro nombre del mismo proveedor",
            supplier_tax_id: "80.000.001-1",
            invoice_number: "0-0-1",
          }),
        ]),
      ).rejects.toThrow("ya fue registrada");
      const currentInvoice = (
        await db.query<{ version: number }>(
          "SELECT version FROM fleet_maintenance_invoices WHERE id=$1",
          [inv],
        )
      ).rows[0];
      await rpc("fleet_correct_invoice", [
        inv,
        currentInvoice.version,
        JSON.stringify({
          ...invoice,
          plate: "test123",
          description: "Corregido",
        }),
        "Chapa y trabajo corregidos",
        false,
      ]);
      expect(
        (
          await db.query(
            "SELECT vehicle_id,description FROM fleet_maintenance_invoices WHERE id=$1",
            [inv],
          )
        ).rows,
      ).toEqual([{ vehicle_id: id, description: "Corregido" }]);
      await expect(
        rpc("fleet_correct_invoice", [
          inv,
          currentInvoice.version,
          JSON.stringify(invoice),
          "Intento obsoleto",
          false,
        ]),
      ).rejects.toThrow("cambió");
      const replacement = "00000000-0000-4000-8000-000000000004";
      const revision = (
        await rpc("fleet_reserve_invoice_file", [
          replacement,
          inv,
          currentInvoice.version + 1,
          JSON.stringify({
            filename: "nuevo.pdf",
            mime_type: "application/pdf",
            size_bytes: 12,
          }),
          "Archivo legible",
        ])
      ).rows[0] as { value: string };
      await expect(
        rpc("fleet_finalize_invoice_file", [replacement]),
      ).rejects.toThrow("completo");
      await db.query(
        "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3)",
        [
          "fleet-invoices",
          revision.value,
          JSON.stringify({ size: 12, mimetype: "application/pdf" }),
        ],
      );
      await rpc("fleet_finalize_invoice_file", [replacement]);
      await rpc("fleet_finalize_invoice_file", [replacement]); // Idempotent retry.
      expect(
        (await db.query("SELECT * FROM storage.objects")).rows,
      ).toHaveLength(2);
      await db.exec("SELECT set_config('test.role','operativo',false)");
      expect(
        (await db.query("SELECT * FROM fleet_invoice_audit")).rows,
      ).toEqual([]);
      expect(
        (await db.query("SELECT * FROM fleet_invoice_files")).rows,
      ).toEqual([]);
      expect(
        (await db.query("SELECT * FROM fleet_plate_aliases")).rows,
      ).toEqual([]);
      await expect(
        rpc("fleet_correct_invoice", [
          inv,
          currentInvoice.version + 2,
          JSON.stringify(invoice),
          "Sin permiso",
          false,
        ]),
      ).rejects.toThrow("Sin acceso");
      await expect(
        rpc("fleet_finalize_invoice_file", [replacement]),
      ).rejects.toThrow("Sin acceso");
      await db.exec("SELECT set_config('test.role','jefatura',false)");
      await rpc("fleet_correct_invoice", [
        inv,
        currentInvoice.version + 2,
        "{}",
        "Factura incorrecta",
        true,
      ]);
      await expect(rpc("fleet_finalize_invoice", [inv])).rejects.toThrow(
        "no disponible",
      );
      await rpc("fleet_edit_vehicle", [
        id,
        JSON.stringify({
          ...vehicle,
          plate: "FINAL123",
          plate_change_type: "correction",
          plate_change_reason: "Error de escritura",
        }),
      ]);
      expect(
        (await db.query("SELECT vehicle_id FROM fleet_maintenance_history"))
          .rows,
      ).toEqual([{ vehicle_id: id }]);
      expect(
        (
          await db.query(
            "SELECT * FROM fleet_plate_aliases WHERE plate_normalized='NEW123'",
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.query(
            "SELECT * FROM fleet_change_events WHERE reason='Error de escritura'",
          )
        ).rows,
      ).toHaveLength(1);
      const pending = "00000000-0000-4000-8000-000000000005";
      await rpc("fleet_reserve_invoice", [pending, JSON.stringify(invoice)]);
      await db.exec(
        "RESET ROLE; INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000099','manager@example.invalid'); SET ROLE authenticated; SELECT set_config('test.uid','00000000-0000-4000-8000-000000000099',false)",
      );
      const recover = "00000000-0000-4000-8000-000000000006";
      const recovery = (
        await rpc("fleet_reserve_invoice_file", [
          recover,
          pending,
          1,
          JSON.stringify({
            filename: "recuperado.pdf",
            mime_type: "application/pdf",
            size_bytes: 14,
          }),
          "Recuperar intento interrumpido",
        ])
      ).rows[0] as { value: string };
      await db.query(
        "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3)",
        [
          "fleet-invoices",
          recovery.value,
          JSON.stringify({ size: 14, mimetype: "application/pdf" }),
        ],
      );
      await rpc("fleet_finalize_invoice_file", [recover]);
      expect(
        (
          await db.query(
            "SELECT status FROM fleet_maintenance_invoices WHERE id=$1",
            [pending],
          )
        ).rows,
      ).toEqual([{ status: "uploaded" }]);

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

it("limits supplier lookup to invoice submitters and validates master identity on reservation", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await fixture(db);
    await db.exec(`RESET ROLE; CREATE TABLE public.totvs_proveedores(codigo text,tienda text,ruc text,razon_social text);
   INSERT INTO public.totvs_proveedores VALUES ('1','1','80000001-1','Taller maestro'),('1','2','80000001-1','Taller maestro');
   ALTER TABLE public.totvs_proveedores ENABLE ROW LEVEL SECURITY;`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261110180000_fleet_supplier_lookup.sql",
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/20261110190000_fleet_manual_supplier.sql",
        "utf8",
      ),
    );
    await db.exec(
      "SET ROLE authenticated; SELECT set_config('test.role','operativo',false)",
    );
    expect(
      (await db.query("SELECT * FROM fleet_search_suppliers('800')")).rows,
    ).toEqual([{ ruc: "80000001-1", razon_social: "Taller maestro" }]);
    expect(
      (await db.query("SELECT * FROM fleet_search_suppliers('80')")).rows,
    ).toEqual([]);
    await expect(db.query("SELECT * FROM totvs_proveedores")).rejects.toThrow();
    const data = {
      plate: "NO123",
      supplier: "Nombre inventado",
      supplier_tax_id: "80000001-1",
      invoice_number: "001",
      invoice_date: "2026-10-01",
      categories: ["Filtros"],
      description: "Prueba",
      filename: "prueba.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
    };
    const id = "00000000-0000-4000-8000-000000000091";
    await expect(
      db.query("SELECT fleet_reserve_invoice($1,$2)", [
        id,
        JSON.stringify(data),
      ]),
    ).rejects.toThrow("maestro");
    await db.query("SELECT fleet_reserve_invoice($1,$2)", [
      id,
      JSON.stringify({ ...data, supplier: "Taller maestro" }),
    ]);

    expect(
      (await db.query("SELECT * FROM fleet_supplier_identity('800000011')"))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT * FROM fleet_supplier_identity('99900001-1')"))
        .rows,
    ).toEqual([]);
    const manual = {
      ...data,
      supplier_tax_id: "99900001-1",
      supplier: "Taller manual",
    };
    const manualId = "00000000-0000-4000-8000-000000000092";
    const reserved = await db.query<{ path: string }>(
      "SELECT fleet_reserve_invoice($1,$2) AS path",
      [manualId, JSON.stringify(manual)],
    );
    await db.query(
      "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ('fleet-invoices',$1,$2)",
      [
        reserved.rows[0].path,
        JSON.stringify({ size: 10, mimetype: "application/pdf" }),
      ],
    );
    await db.query("SELECT fleet_finalize_invoice($1)", [manualId]);
    await expect(
      db.query("SELECT fleet_reserve_invoice($1,$2)", [
        "00000000-0000-4000-8000-000000000093",
        JSON.stringify({
          ...manual,
          supplier: "Otro nombre",
          supplier_tax_id: "999000011",
          invoice_number: "0-01",
        }),
      ]),
    ).rejects.toThrow();
    await db.exec("RESET ROLE");
    expect(
      (await db.query("SELECT count(*)::int AS n FROM totvs_proveedores")).rows,
    ).toEqual([{ n: 2 }]);
    expect(
      (
        await db.query(
          "SELECT supplier,status FROM fleet_maintenance_invoices WHERE id=$1",
          [manualId],
        )
      ).rows,
    ).toEqual([{ supplier: "Taller manual", status: "uploaded" }]);
    await db.exec("SET ROLE authenticated");
    await db.exec("SELECT set_config('test.access','no',false)");
    await expect(
      db.query("SELECT * FROM fleet_search_suppliers('800')"),
    ).rejects.toThrow("Sin acceso");
  } finally {
    await db.close();
  }
}, 30000);
it.each([false, true])(
  "saves edited retries, audits amounts and preserves discarded rows (legacy=%s)",
  async (legacy) => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await fixture(db);
      await db.exec("RESET ROLE");
      if (legacy)
        await db.exec(
          readFileSync(
            "drizzle/migrations/0011_fleet_invoice_integrity.sql",
            "utf8",
          ),
        );
      await db.exec(
        readFileSync(
          "supabase/migrations/20261110200000_fleet_invoice_integrity.sql",
          "utf8",
        ),
      );
      await db.exec(
        "SET ROLE authenticated; SELECT set_config('test.role','operativo',false)",
      );
      const id = "00000000-0000-4000-8000-000000000081",
        id2 = "00000000-0000-4000-8000-000000000082";
      const input = {
        plate: "TEST123",
        supplier: "Taller",
        supplier_tax_id: "99900001-1",
        invoice_number: "TEST01",
        invoice_date: "2026-10-01",
        description: "Anterior",
        categories: ["Filtros"],
        filename: "test.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
      };
      const call = (name: string, args: unknown[]) =>
        db.query<{ value: string }>(
          `select ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
          args,
        );
      await db.exec("RESET ROLE");
      await db.exec(
        readFileSync(
          "supabase/migrations/20261112170000_fleet_invoice_work_details.sql",
          "utf8",
        ),
      );
      await db.exec("SET ROLE authenticated");
      const work = { odometer_km: "41971", performed_on: "2026-10-01" };
      const path = (
        await call("fleet_reserve_invoice", [id, { ...input, ...work }])
      ).rows[0].value;
      await call("fleet_update_pending_invoice", [
        id,
        {
          ...input,
          description: "Editada",
          plate: "TEST456",
          odometer_km: "41972",
        },
      ]);
      await expect(
        call("fleet_reserve_invoice", [id2, input]),
      ).rejects.toThrow();
      await db.query(
        "INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('fleet-invoices',$1,$2)",
        [path, { size: 10, mimetype: "application/pdf" }],
      );
      await call("fleet_finalize_invoice", [id]);
      await db.exec("SELECT set_config('test.role','jefatura',false)");
      expect(
        (
          await db.query(
            "SELECT description,plate,version,odometer_km::int AS km,performed_on::text AS work_date FROM fleet_maintenance_invoices WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toMatchObject({
        description: "Editada",
        plate: "TEST456",
        version: 2,
        km: 41972,
        work_date: "2026-10-01",
      });
      await expect(
        call("fleet_set_invoice_amount", [id, -1, "PYG", 2, "Error"]),
      ).rejects.toThrow("cero");
      await call("fleet_set_invoice_amount", [
        id,
        100,
        "PYG",
        2,
        "Carga inicial",
      ]);
      await expect(
        call("fleet_set_invoice_amount", [
          id,
          200,
          "PYG",
          2,
          "Edición simultánea",
        ]),
      ).rejects.toThrow("cambió");
      await call("fleet_set_invoice_amount_v2", [
        id,
        3,
        150,
        "PYG",
        "Corrección",
      ]);
      expect(
        (
          await db.query(
            "SELECT before_data->>'amount' AS amount FROM fleet_invoice_audit WHERE invoice_id=$1 AND reason='Corrección'",
            [id],
          )
        ).rows,
      ).toEqual([{ amount: "100" }]);
      await db.exec("SELECT set_config('test.role','operativo',false)");
      await call("fleet_reserve_invoice", [
        id2,
        { ...input, invoice_number: "TEST02" },
      ]);
      await call("fleet_discard_pending_invoice", [id2]);
      await expect(call("fleet_finalize_invoice", [id2])).rejects.toThrow();
      await expect(
        call("fleet_discard_reserved_invoice", [id]),
      ).rejects.toThrow();
      await db.exec("SELECT set_config('test.role','jefatura',false)");
      expect(
        (
          await db.query(
            "SELECT status FROM fleet_maintenance_invoices WHERE id=$1",
            [id2],
          )
        ).rows,
      ).toEqual([{ status: "void" }]);
      await expect(
        call("fleet_import_fuel_entries", [[{ currency: null }]]),
      ).rejects.toThrow("moneda");
      await db.exec("RESET ROLE");
      await db.exec(
        readFileSync(
          "supabase/migrations/20261112160000_fleet_import_only_new_fuel.sql",
          "utf8",
        ),
      );
      await db.exec("SET ROLE authenticated");
      const fuel = {
        source_key: "imported",
        plate: "TEST123",
        occurred_at: "2026-10-01T10:00:00",
        liters: 10,
        net_amount: 100,
        currency: "PYG",
        odometer_km: 12345,
        product: "Diesel",
        station: "Prueba",
        raw_data: { liquidacion: "original" },
      };
      expect((await call("fleet_import_fuel_entries", [[fuel]])).rows).toEqual([
        { value: 1 },
      ]);
      const revised = {
        ...fuel,
        odometer_km: 1,
        raw_data: { liquidacion: "nueva" },
      };
      const newFuel = { ...fuel, source_key: "new" };
      expect(
        (await call("fleet_import_fuel_entries", [[revised, newFuel]])).rows,
      ).toEqual([{ value: 1 }]);
      expect(
        (await call("fleet_import_fuel_entries", [[revised, newFuel]])).rows,
      ).toEqual([{ value: 0 }]);
      expect(
        (
          await db.query(
            "SELECT odometer_km::int AS km, raw_data FROM fleet_fuel_entries WHERE source_key='imported'",
          )
        ).rows,
      ).toEqual([{ km: 12345, raw_data: { liquidacion: "original" } }]);
    } finally {
      await db.close();
    }
  },
  30000,
);

it("stores and audits the maintenance interval only for managers and preserves it on older payloads", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await fixture(db);
    await db.exec("RESET ROLE");
    await db.exec(
      readFileSync(
        "supabase/migrations/20261110210000_fleet_maintenance_interval.sql",
        "utf8",
      ),
    );
    await db.exec("SET ROLE authenticated");
    const save = async (id: string | null, data: Record<string, unknown>) =>
      (
        await db.query<{ value: string }>(
          "SELECT fleet_save_vehicle($1,$2::jsonb) AS value",
          [id, JSON.stringify(data)],
        )
      ).rows[0].value;
    const id = await save(null, {
      ...vehicle,
      maintenance_interval_km: "10000",
    });
    await save(id, { ...vehicle, maintenance_interval_km: "15000" });
    await save(id, vehicle);
    expect(
      (
        await db.query<{ maintenance_interval_km: number }>(
          "SELECT maintenance_interval_km FROM fleet_vehicles WHERE id=$1",
          [id],
        )
      ).rows[0].maintenance_interval_km,
    ).toBe(15000);
    expect(
      (
        await db.query(
          "SELECT 1 FROM fleet_change_events WHERE vehicle_id=$1 AND before_data->>'maintenance_interval_km'='10000' AND after_data->>'maintenance_interval_km'='15000'",
          [id],
        )
      ).rows,
    ).toHaveLength(1);
    for (const value of ["0", "-1", "1.5", "NaN"])
      await expect(
        save(id, { ...vehicle, maintenance_interval_km: value }),
      ).rejects.toThrow();
    await db.query("SELECT set_config('test.role','operativo',false)");
    await expect(
      save(id, { ...vehicle, maintenance_interval_km: "20000" }),
    ).rejects.toThrow();
    await db.query("SELECT set_config('test.role','jefatura',false)");
    await save(id, { ...vehicle, maintenance_interval_km: "" });
    expect(
      (
        await db.query<{ maintenance_interval_km: number | null }>(
          "SELECT maintenance_interval_km FROM fleet_vehicles WHERE id=$1",
          [id],
        )
      ).rows[0].maintenance_interval_km,
    ).toBeNull();
  } finally {
    await db.close();
  }
});
