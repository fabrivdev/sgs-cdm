// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const foundation = readFileSync("supabase/migrations/20260930160000_import_totvs_kardex.sql", "utf8");
const previous = readFileSync("supabase/migrations/20261015090000_totvs_purchase_stock_and_kardex_opening.sql", "utf8");
const migration = readFileSync("supabase/migrations/20261016150000_version_totvs_kardex_movements.sql", "utf8");
const tableStart = foundation.indexOf("CREATE TABLE IF NOT EXISTS public.totvs_kardex_movimientos (");
const tableSql = foundation.slice(tableStart, foundation.indexOf("\n);", tableStart) + 3);
const functionStart = previous.indexOf("CREATE OR REPLACE FUNCTION public.totvs_importar_kardex_lote_v1(");
const functionSql = previous.slice(functionStart, previous.indexOf("$$;", functionStart) + 3);

const sourceRow = (recno: string, cost: number, description = "Filtro") => ({
  tabla_origen: "SD1", recno_origen: recno, fecha_movimiento: "2026-10-15",
  filial: "01 - Santa Rita", deposito: "01", deposito_descripcion: "DEPOSITO GENERAL",
  producto_codigo: "REPIN000001", producto_descripcion: description, cantidad: 2,
  costo_unitario_gs: cost, costo_unitario_moneda_2: 1, costo_unitario_moneda_3: 1,
  costo_total_gs: cost * 2, costo_total_moneda_2: 2, costo_total_moneda_3: 2,
  movimiento_detalle: null, especie_documento: "NF", documento: "0010010000001",
  secuencia: "1", moneda_codigo: "1", tipo_cambio: 1, direccion: "E",
  serie: null, contraparte_codigo: null, contraparte_tienda: null,
  grupo_producto: "ME", cuenta_contable: "11413003", archivo_origen: "kardex.xml",
  fila_origen: Number(recno) + 2, huella_origen: JSON.stringify([recno, cost, description]),
  datos_fuente: { RECNO: recno, C_U_G: String(cost) },
});

const importRows = async (load: string, rows: ReturnType<typeof sourceRow>[]) => {
  const result = await db.query<{ result: { insertadas: number; actualizadas: number; sin_cambios: number } }>(
    "SELECT public.totvs_importar_kardex_lote_v1($1::uuid,$2::jsonb) AS result",
    [load, JSON.stringify(rows)],
  );
  return result.rows[0].result;
};

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT '00000000-0000-0000-0000-000000000001'::uuid
    $$;
    CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean
      LANGUAGE sql AS $$ SELECT true $$;
  `);
  await db.exec(tableSql);
  await db.exec(functionSql);
  const oldHash = await db.query<{ hash: string }>(
    "SELECT md5(pg_get_functiondef('public.totvs_importar_kardex_lote_v1(uuid,jsonb)'::regprocedure)) AS hash",
  );
  await db.exec(migration.replace("a6d52f1e8d9600586e71048219f90521", oldHash.rows[0].hash));
});
afterAll(async () => { await db.close(); });

describe("versionado de movimientos Kardex TOTVS", () => {
  it("inserta, versiona costos y descripción, y deja intacta una reimportación idéntica", async () => {
    expect(await importRows("00000000-0000-0000-0000-000000000011", [sourceRow("10",100),sourceRow("11",50)]))
      .toMatchObject({ insertadas: 2, actualizadas: 0, sin_cambios: 0 });
    const before = await db.query<{ id: string }>("SELECT id FROM public.totvs_kardex_movimientos WHERE recno_origen='10'");
    expect(await importRows("00000000-0000-0000-0000-000000000012", [sourceRow("10",120,"Filtro nuevo")]))
      .toMatchObject({ insertadas: 0, actualizadas: 1, sin_cambios: 0 });
    expect(await importRows("00000000-0000-0000-0000-000000000013", [sourceRow("10",120,"Filtro nuevo")]))
      .toMatchObject({ insertadas: 0, actualizadas: 0, sin_cambios: 1 });
    const result = await db.query<{ id: string; cost: number; missing_retained: number; versions: number; old_cost: number; new_cost: number; old_description: string; new_description: string }>(`
      SELECT m.id,m.costo_unitario_gs::float8 AS cost,
        (SELECT count(*)::integer FROM public.totvs_kardex_movimientos WHERE recno_origen='11') AS missing_retained,
        (SELECT count(*)::integer FROM public.totvs_kardex_movimientos_versiones) AS versions,
        (SELECT (version_anterior->>'costo_unitario_gs')::float8 FROM public.totvs_kardex_movimientos_versiones) AS old_cost,
        (SELECT (version_nueva->>'costo_unitario_gs')::float8 FROM public.totvs_kardex_movimientos_versiones) AS new_cost,
        (SELECT version_anterior->>'producto_descripcion' FROM public.totvs_kardex_movimientos_versiones) AS old_description,
        (SELECT version_nueva->>'producto_descripcion' FROM public.totvs_kardex_movimientos_versiones) AS new_description
      FROM public.totvs_kardex_movimientos m WHERE recno_origen='10'
    `);
    expect(result.rows[0]).toMatchObject({ id: before.rows[0].id, cost: 120,
      missing_retained: 1, versions: 1, old_cost: 100, new_cost: 120,
      old_description: "Filtro", new_description: "Filtro nuevo" });
  });

  it("rechaza duplicados internos sin modificar ningún movimiento", async () => {
    await expect(importRows("00000000-0000-0000-0000-000000000014", [sourceRow("12",20),sourceRow("12",30)]))
      .rejects.toThrow(/duplicadas/);
    const result = await db.query<{ count: number }>("SELECT count(*)::integer AS count FROM public.totvs_kardex_movimientos WHERE recno_origen='12'");
    expect(result.rows[0].count).toBe(0);
  });
});
