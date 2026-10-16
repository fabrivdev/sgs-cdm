// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20261016130000_version_totvs_billing_snapshots.sql", "utf8");
const previousCore = readFileSync("src/test/fixtures/totvsCoreConsolidacion20261016.sql", "utf8");
const prior = {
  entidad_nombre: "CLIENTE", vendedor: "VENDEDOR", fecha_factura: "2026-09-29",
  subgrupo_original: "SERVICIOS", grupo_normalizado: "Servicio", marca_normalizada: "OTROS",
  tipo_facturacion: "Servicio", tipo_tiempo: null, observacion: "SERVICIOS PRESTADOS",
  cod_mercaderia: "SRV000008", codigo_fabricante: null, mercaderia: "SERVICIOS PRESTADOS",
  cantidad: 1, valor_unitario: 992.25, total_venta: 992.25, moneda: "USD",
  raw_data: { ITEM: "01", canonical_document_kind: "FACTURA" },
};
const updated = { ...prior, observacion: "SERVICIOS PRESTADOS CLAAS",
  mercaderia: "SERVICIOS PRESTADOS CLAAS", valor_unitario: 902.05, total_venta: 902.05 };

beforeAll(async () => {
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated");
  await db.exec("CREATE TABLE public.importaciones(id uuid PRIMARY KEY)");
  await db.exec("CREATE TABLE public.facturacion_lineas_importadas(id uuid PRIMARY KEY)");
  await db.exec("CREATE TABLE public.facturacion_totvs_importador_versiones(version text PRIMARY KEY, definicion_rpc text NOT NULL)");
  await db.exec(`${previousCore};`);
  const prior = await db.query<{ hash: string }>("SELECT md5(pg_get_functiondef('public.facturacion_importar_totvs_lote_core_consolidacion_v1(jsonb,jsonb,jsonb,date,date,boolean)'::regprocedure)) AS hash");
  await db.exec(migration.replace("a5b56c668d780477c685533bb32101e1", prior.rows[0].hash));
});
afterAll(async () => { await db.close(); });

describe("versionado de cortes completos de facturacion TOTVS", () => {
  it("instala el core, conserva la funcion anterior y diferencia contenido mutable", async () => {
    const result = await db.query<{ versions: number; function_source: string; changed: boolean; same: boolean }>(`
      SELECT
        (SELECT count(*)::integer FROM public.facturacion_totvs_importador_versiones) AS versions,
        pg_get_functiondef('public.facturacion_importar_totvs_lote_core_consolidacion_v1(jsonb,jsonb,jsonb,date,date,boolean)'::regprocedure) AS function_source,
        public.facturacion_totvs_estado_mutable('{"total_venta":992.25,"fecha_factura":"2026-09-29"}'::jsonb)
          IS DISTINCT FROM public.facturacion_totvs_estado_mutable('{"total_venta":902.05,"fecha_factura":"2026-09-29"}'::jsonb) AS changed,
        public.facturacion_totvs_estado_mutable('{"total_venta":902.050,"fecha_factura":"2026-09-29"}'::jsonb)
          = public.facturacion_totvs_estado_mutable('{"total_venta":902.05,"fecha_factura":"2026-09-29T00:00:00Z"}'::jsonb) AS same
    `);
    expect(result.rows[0].versions).toBe(1);
    expect(result.rows[0].changed).toBe(true);
    expect(result.rows[0].same).toBe(true);
    expect(result.rows[0].function_source).toContain("facturacion_totvs_linea_versiones");
    expect(result.rows[0].function_source).toContain("WHERE NOT p_reemplazar_resumen AND");
  });

  it("actualiza el importe bajo la misma identidad, audita ambas versiones y queda idempotente", async () => {
    await db.exec(`
      CREATE TYPE public.marca AS ENUM ('OTROS');
      CREATE TYPE public.tipo_facturacion AS ENUM ('Servicio');
      ALTER TABLE public.facturacion_lineas_importadas
        ADD COLUMN importacion_id uuid REFERENCES public.importaciones(id),
        ADD COLUMN entidad_nombre text, ADD COLUMN vendedor text,
        ADD COLUMN fecha_factura timestamptz, ADD COLUMN subgrupo_original text,
        ADD COLUMN grupo_normalizado text, ADD COLUMN marca_normalizada public.marca,
        ADD COLUMN tipo_facturacion public.tipo_facturacion, ADD COLUMN tipo_tiempo text,
        ADD COLUMN observacion text, ADD COLUMN cod_mercaderia text,
        ADD COLUMN codigo_fabricante text, ADD COLUMN mercaderia text,
        ADD COLUMN cantidad numeric, ADD COLUMN valor_unitario numeric,
        ADD COLUMN total_venta numeric, ADD COLUMN moneda text, ADD COLUMN raw_data jsonb;
      CREATE OR REPLACE FUNCTION public.facturacion_totvs_firma_comercial(p jsonb)
      RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
        SELECT jsonb_build_object('valor_unitario',p->'valor_unitario','total_venta',p->'total_venta')
      $$;
      INSERT INTO public.importaciones(id) VALUES ('00000000-0000-0000-0000-000000000001');
    `);
    const lineId = "00000000-0000-0000-0000-000000000101";
    await db.query(`
      INSERT INTO public.facturacion_lineas_importadas (
        id,importacion_id,entidad_nombre,vendedor,fecha_factura,subgrupo_original,
        grupo_normalizado,marca_normalizada,tipo_facturacion,tipo_tiempo,observacion,
        cod_mercaderia,codigo_fabricante,mercaderia,cantidad,valor_unitario,
        total_venta,moneda,raw_data
      ) VALUES (
        $1,'00000000-0000-0000-0000-000000000001',$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )`, [lineId, prior.entidad_nombre, prior.vendedor, prior.fecha_factura,
      prior.subgrupo_original, prior.grupo_normalizado, prior.marca_normalizada,
      prior.tipo_facturacion, prior.tipo_tiempo, prior.observacion, prior.cod_mercaderia,
      prior.codigo_fabricante, prior.mercaderia, prior.cantidad, prior.valor_unitario,
      prior.total_venta, prior.moneda, JSON.stringify(prior.raw_data)]);
    await db.exec("INSERT INTO public.importaciones(id) VALUES ('00000000-0000-0000-0000-000000000002')");
    await db.exec(`CREATE TEMP TABLE tmp_facturacion_totvs_versiones_esperadas (
      id uuid PRIMARY KEY, identidad text, anterior jsonb, recibida jsonb, entrada jsonb
    ); CREATE TEMP TABLE tmp_facturacion_totvs_versiones_reales(id uuid PRIMARY KEY);`);
    await db.query(`INSERT INTO tmp_facturacion_totvs_versiones_esperadas
      SELECT id,'NEW_XML_FACTURACION|SANTA RITA|FACTURA|0010010005137|01',to_jsonb(f),$2::jsonb,$2::jsonb
      FROM public.facturacion_lineas_importadas f WHERE id=$1`, [lineId, JSON.stringify(updated)]);
    const start = migration.indexOf("  WITH actualizadas AS (");
    const end = migration.indexOf("  SELECT count(*) INTO v_actualizadas", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const updateSql = migration.slice(start, end)
      .replaceAll("v_importacion_id", "'00000000-0000-0000-0000-000000000002'::uuid");
    await db.exec(updateSql);
    const result = await db.query<{ total_venta: number; versions: number; old_amount: number; new_amount: number; commercial: boolean; unchanged: boolean; actual_state: unknown; expected_state: unknown }>(`
      SELECT f.total_venta::float8 AS total_venta,
        (SELECT count(*)::integer FROM public.facturacion_totvs_linea_versiones) AS versions,
        (SELECT (version_anterior->>'total_venta')::float8 FROM public.facturacion_totvs_linea_versiones) AS old_amount,
        (SELECT (version_nueva->>'total_venta')::float8 FROM public.facturacion_totvs_linea_versiones) AS new_amount,
        (SELECT cambio_comercial FROM public.facturacion_totvs_linea_versiones) AS commercial,
        public.facturacion_totvs_estado_mutable(to_jsonb(f)) = public.facturacion_totvs_estado_mutable($2::jsonb) AS unchanged,
        public.facturacion_totvs_estado_mutable(to_jsonb(f)) AS actual_state,
        public.facturacion_totvs_estado_mutable($2::jsonb) AS expected_state
      FROM public.facturacion_lineas_importadas f WHERE f.id=$1`, [lineId, JSON.stringify(updated)]);
    expect(result.rows[0]).toMatchObject({ total_venta: 902.05, versions: 1,
      old_amount: 992.25, new_amount: 902.05, commercial: true });
    expect(result.rows[0].actual_state).toEqual(result.rows[0].expected_state);
  });
});
