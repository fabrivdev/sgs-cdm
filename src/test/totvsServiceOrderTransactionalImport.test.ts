// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(
  "supabase/migrations/20261012120000_import_service_orders_with_confirmed_exclusions.sql",
  "utf8",
);
const db = new PGlite();
const importId = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT ''11111111-1111-1111-1111-111111111111''::uuid';
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS
      'SELECT current_setting(''app.allowed'',true) = ''true''';
    CREATE TABLE public.os_exclusiones_confirmadas(os_numero text PRIMARY KEY);
    INSERT INTO public.os_exclusiones_confirmadas VALUES (' 02-00000036 ');
    CREATE TABLE public.importaciones(
      id uuid PRIMARY KEY, usuario_id uuid, insertados integer NOT NULL DEFAULT 0,
      duplicados integer NOT NULL DEFAULT 0, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      tipo text NOT NULL, origen_sistema text NOT NULL
    );
    INSERT INTO public.importaciones(id,usuario_id,tipo,origen_sistema)
    VALUES ('${importId}','11111111-1111-1111-1111-111111111111','facturacion','new_xml_ordenes_servicio');
    CREATE TABLE public.ordenes_servicio_importadas(
      os_numero text PRIMARY KEY,
      cliente_nombre text, cod_interno text, cod_mecanico text, factura text,
      fecha_abierta_os date, fecha_cierre_os date, fecha_emision_factura date,
      kilometro_valor numeric, km_cantidad numeric, km_valor_unitario numeric,
      marca text, nro_chasis text, problema text, raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      repuesto_valor numeric, responsable text, servicios_cantidad numeric,
      servicios_valor numeric, servicios_valor_unitario numeric,
      situacion_facturacion text, situacion_os text, terceros_valor numeric,
      tipo_tiempo text, actualizado_en timestamptz NOT NULL DEFAULT now(),
      importado_en timestamptz NOT NULL DEFAULT now(), trabajo_id uuid
    );
    SET app.allowed='true';
  `);
  await db.exec(sql);
});

afterAll(async () => { await db.close(); });

const callImport = async (rows: unknown[], batch = 1) => (
  await db.query<{ result: { persistidas: string[]; excluidas: string[]; total: number } }>(
    "SELECT public.totvs_importar_ordenes_servicio_lote_v1($1::uuid,$2::integer,$3::jsonb) result",
    [importId, batch, JSON.stringify(rows)],
  )
).rows[0].result;

describe("importacion transaccional de OS con exclusiones confirmadas", () => {
  it("persiste la OS valida y devuelve la exclusion sin depender de SELECT cliente", async () => {
    const result = await callImport([
      { os_numero: "02-00000035", raw_data: { fuente: "qa" } },
      { os_numero: "02-00000036", raw_data: { fuente: "qa" } },
    ]);
    expect(result).toEqual({ total: 2, persistidas: ["02-00000035"], excluidas: ["02-00000036"] });
    const rows = (await db.query<{ os_numero: string }>(
      "SELECT os_numero FROM public.ordenes_servicio_importadas ORDER BY os_numero",
    )).rows;
    expect(rows.map((row) => row.os_numero)).toEqual(["02-00000035"]);
    const audit = (await db.query<{ insertados: number; duplicados: number; excluidas: number }>(
      "SELECT insertados,duplicados,(metadata->>'os_excluidas_confirmadas')::int excluidas FROM public.importaciones WHERE id=$1::uuid",
      [importId],
    )).rows[0];
    expect(audit).toEqual({ insertados: 1, duplicados: 0, excluidas: 1 });
  });

  it("reintenta el mismo lote sin duplicar la auditoria", async () => {
    const result = await callImport([
      { os_numero: "02-00000035", raw_data: { fuente: "qa-retry" } },
      { os_numero: "02-00000036", raw_data: { fuente: "qa-retry" } },
    ]);
    expect(result).toEqual({ total: 2, persistidas: ["02-00000035"], excluidas: ["02-00000036"] });
    const audit = (await db.query<{
      insertados: number;
      excluidas: number;
      lotes: Record<string, string[]>;
      fuente: string;
    }>(
      `SELECT insertados,
        (metadata->>'os_excluidas_confirmadas')::int excluidas,
        metadata->'os_lotes_confirmados' lotes,
        raw_data->>'fuente' fuente
       FROM public.importaciones i
       CROSS JOIN public.ordenes_servicio_importadas o
       WHERE i.id=$1::uuid AND o.os_numero='02-00000035'`,
      [importId],
    )).rows[0];
    expect(audit).toEqual({
      insertados: 1,
      excluidas: 1,
      lotes: { "1": ["02-00000035", "02-00000036"] },
      fuente: "qa",
    });
  });

  it("rechaza reutilizar el numero de lote con otras claves", async () => {
    await expect(callImport([{ os_numero: "02-00000037", raw_data: {} }])).rejects.toThrow(
      /numero de lote ya fue usado/,
    );
    expect((await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.ordenes_servicio_importadas WHERE os_numero='02-00000037'",
    )).rows[0].count).toBe(0);
  });

  it("rechaza repetir una OS normalizada en otro lote", async () => {
    await expect(callImport([{ os_numero: "02-00000035", raw_data: {} }], 2)).rejects.toThrow(
      /ya fue confirmada en otro lote/,
    );
  });

  it("rechaza authenticated sin admin.importaciones antes de escribir", async () => {
    await db.exec("SET app.allowed='false'");
    await expect(callImport([{ os_numero: "02-00000037", raw_data: {} }])).rejects.toThrow(/Sin permiso/);
    await db.exec("SET app.allowed='true'");
    expect((await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM public.ordenes_servicio_importadas WHERE os_numero='02-00000037'",
    )).rows[0].count).toBe(0);
  });

  it("limita EXECUTE a authenticated y exige la seccion de importaciones", () => {
    expect(sql).toContain("has_section_access(auth.uid(), 'admin.importaciones')");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.totvs_importar_ordenes_servicio_lote_v1(uuid,integer,jsonb) FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.totvs_importar_ordenes_servicio_lote_v1(uuid,integer,jsonb) TO authenticated");
    expect(sql).toContain("INSERT INTO totvs_os_aplicadas(os_numero)");
    expect(sql).toContain("upper(btrim(e.os_numero)) = l.os_numero");
    expect(sql).toContain("LOCK TABLE public.os_exclusiones_confirmadas IN SHARE MODE");
  });
});
