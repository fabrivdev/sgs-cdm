// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { MayorImportRow } from "@/lib/imports/mayorPreflight";

const initial = readFileSync("supabase/migrations/20261006130000_import_totvs_mayor_staging.sql", "utf8");
const snapshots = readFileSync("supabase/migrations/20261014120000_version_totvs_mayor_snapshots.sql", "utf8");
const db = new PGlite();
const uid = "11111111-1111-4111-8111-111111111111";
const hash = (digit: string) => digit.repeat(64);

function row(overrides: Partial<MayorImportRow> = {}): MayorImportRow {
  return {
    clave_origen: "01|2026-07-01T00:00:00|1|1|10|1",
    huella_origen: '["original"]', sucursal: "01", anio_mes: "202607",
    fecha_fuente: "2026-07-01T00:00:00", fecha_movimiento: "2026-07-01",
    lote: "1", sublote: "1", documento: "10", linea: "1",
    importe_pyg: 100, importe_usd: 2.5, historial: "MOV",
    cuenta_codigo: "11111001", cuenta_descripcion: "Cuenta",
    centro_costo: "10", centro_costo_descripcion: "Centro",
    item_contable: null, cliente: null, origen: "ORI", tipo_movimiento: "1",
    tipo_saldo: "9", contraparte_codigo: null, contraparte_tienda: null,
    documento_asociado: null, tipo_asiento: null, fecha_inclusion: null,
    usuario_nombre: null, asiento: null, es_apertura: false,
    requiere_cuarentena: false, archivo_origen: "mayor.xml", fila_origen: 2,
    datos_fuente: { CUENTA: "11111001" }, ...overrides,
  };
}

async function start(digit: string) {
  return (await db.query<{ id: string }>(
    "SELECT public.totvs_iniciar_mayor_carga_v1($1::jsonb) id",
    [JSON.stringify({ archivo_nombre: `mayor-${digit}.xml`, archivo_sha256: hash(digit), archivo_tamano: 1000 })],
  )).rows[0].id;
}

async function batch(id: string, rows: MayorImportRow[], mode: "validate" | "import" = "import") {
  return (await db.query<{ result: Record<string, number> }>(
    "SELECT public.totvs_importar_mayor_lote_v1($1::uuid,$2,$3::jsonb) result",
    [id, mode, JSON.stringify(rows)],
  )).rows[0].result;
}

async function finish(id: string, rows: MayorImportRow[]) {
  const total = (field: "importe_pyg" | "importe_usd", saldo: string) =>
    rows.filter((value) => value.tipo_saldo === saldo).reduce((sum, value) => sum + value[field], 0);
  await db.query("SELECT public.totvs_finalizar_mayor_carga_v1($1::uuid,$2::jsonb)", [id, JSON.stringify({
    movimientos: rows.length, aperturas: 0,
    filas_tpsldo_1: rows.filter((value) => value.tipo_saldo === "1").length,
    filas_tpsldo_9: rows.filter((value) => value.tipo_saldo === "9").length,
    cuarentena: 0, neto_tpsldo_1_pyg: total("importe_pyg", "1"),
    neto_tpsldo_1_usd: total("importe_usd", "1"),
    neto_tpsldo_9_pyg: total("importe_pyg", "9"),
    neto_tpsldo_9_usd: total("importe_usd", "9"),
  })]);
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM ('gerencia');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${uid}'::uuid $$;
    CREATE FUNCTION public.has_section_access(p_uid uuid,p_section text)
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.has_role(p_uid uuid,p_role public.app_role)
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  `);
  await db.exec(initial);
  await db.exec(snapshots);
});
afterAll(async () => { await db.close(); });

describe("fotos versionadas del Mayor", () => {
  it("conserva la historia y expone solo la ultima carga completa", async () => {
    const first = await start("1");
    const original = row();
    expect(await batch(first, [original])).toMatchObject({ insertadas: 1, versionadas: 0 });
    await finish(first, [original]);

    const second = await start("2");
    const descriptive = row({ huella_origen: '["descripcion-corregida"]', cuenta_descripcion: "Cuenta nueva" });
    const classified = row({
      clave_origen: "01|2026-07-02T00:00:00|1|1|11|1", huella_origen: '["segunda"]',
      fecha_fuente: "2026-07-02T00:00:00", fecha_movimiento: "2026-07-02", documento: "11", fila_origen: 3,
    });
    expect(await batch(second, [descriptive, classified], "validate")).toMatchObject({
      insertadas: 2, versionadas: 1, cambios_contables: 0, cambios_descriptivos: 1, escrituras: 0,
    });
    await batch(second, [descriptive, classified]);
    // La foto en progreso no altera el panel.
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado")).rows[0].count).toBe(1);
    await finish(second, [descriptive, classified]);
    expect((await db.query<{ estado: string }>("SELECT estado FROM public.totvs_mayor_cargas WHERE id=$1", [first])).rows[0].estado).toBe("SUPERADA");
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado")).rows[0].count).toBe(2);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(3);

    const third = await start("3");
    const reclassified = row({ huella_origen: '["clasificacion-corregida"]', tipo_saldo: "1" });
    expect(await batch(third, [reclassified, classified], "validate")).toMatchObject({
      insertadas: 1, versionadas: 1, cambios_contables: 1, cambios_descriptivos: 0,
    });
    await batch(third, [reclassified, classified]);
    await finish(third, [reclassified, classified]);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_cargas WHERE estado='COMPLETA'")).rows[0].count).toBe(1);
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado WHERE tipo_saldo='1'")).rows[0].count).toBe(1);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(4);

    const repeated = await start("4");
    expect(await batch(repeated, [reclassified, classified])).toMatchObject({
      insertadas: 0, sin_cambios: 2, versionadas: 0,
    });
    await finish(repeated, [reclassified, classified]);
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado")).rows[0].count).toBe(2);
  });

  it("cancela un cambio parcial sin tocar la foto completa", async () => {
    const pending = await start("5");
    const change = row({ huella_origen: '["cancelado"]', tipo_saldo: "1" });
    await batch(pending, [change]);
    await db.query("SELECT public.totvs_cancelar_mayor_carga_v1($1::uuid)", [pending]);
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado")).rows[0].count).toBe(2);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(4);
  });
});
