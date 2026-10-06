// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { MayorImportRow } from "@/lib/imports/mayorPreflight";

const migration = readFileSync("supabase/migrations/20261006130000_import_totvs_mayor_staging.sql", "utf8");
const classificationSeed = readFileSync("supabase/migrations/20261006131000_seed_totvs_mayor_clasificacion_preliminar.sql", "utf8");
const db = new PGlite();
const userId = "11111111-1111-4111-8111-111111111111";

const row = (overrides: Partial<MayorImportRow> = {}): MayorImportRow => ({
  clave_origen: "01|2026-07-01T00:00:00|1|1|10|1",
  huella_origen: "[\"source-a\"]",
  sucursal: "01",
  anio_mes: "202607",
  fecha_fuente: "2026-07-01T00:00:00",
  fecha_movimiento: "2026-07-01",
  lote: "1",
  sublote: "1",
  documento: "10",
  linea: "1",
  importe_pyg: 100,
  importe_usd: 2.5,
  historial: "APERTURA",
  cuenta_codigo: "11111001",
  cuenta_descripcion: "Cuenta",
  centro_costo: "10",
  centro_costo_descripcion: "Centro",
  item_contable: null,
  cliente: null,
  origen: "ORI",
  tipo_movimiento: "1",
  tipo_saldo: "1",
  contraparte_codigo: null,
  contraparte_tienda: null,
  documento_asociado: null,
  tipo_asiento: null,
  fecha_inclusion: null,
  usuario_nombre: null,
  asiento: null,
  es_apertura: true,
  requiere_cuarentena: false,
  archivo_origen: "mayor.xml",
  fila_origen: 2,
  datos_fuente: { CUENTA: "11111001" },
  ...overrides,
});

async function startLoad(suffix: string) {
  return (await db.query<{ id: string }>(
    "SELECT public.totvs_iniciar_mayor_carga_v1($1::jsonb) id",
    [JSON.stringify({ archivo_nombre: `mayor-${suffix}.xml`, archivo_sha256: suffix.padEnd(64, "a").slice(0, 64), archivo_tamano: 1000 })],
  )).rows[0].id;
}

async function callBatch(loadId: string, mode: "validate" | "import", rows: MayorImportRow[]) {
  return (await db.query<{ result: Record<string, number | string> }>(
    "SELECT public.totvs_importar_mayor_lote_v1($1::uuid,$2,$3::jsonb) result",
    [loadId, mode, JSON.stringify(rows)],
  )).rows[0].result;
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TYPE public.app_role AS ENUM ('gerencia');
    CREATE TABLE public.test_auth(uid uuid PRIMARY KEY,admin boolean NOT NULL,gerencia boolean NOT NULL);
    INSERT INTO public.test_auth VALUES ('${userId}',true,false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${userId}'::uuid $$;
    CREATE FUNCTION public.has_section_access(p_uid uuid,p_section text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce((SELECT admin FROM public.test_auth WHERE uid=p_uid),false) $$;
    CREATE FUNCTION public.has_role(p_uid uuid,p_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT coalesce((SELECT gerencia FROM public.test_auth WHERE uid=p_uid),false) $$;
  `);
  await db.exec(migration);
});

afterAll(async () => { await db.close(); });

describe("staging del Libro Mayor", () => {
  it("valida sin escribir e importa por clave y huella", async () => {
    const loadId = await startLoad("1");
    const rows = [
      row(),
      row({
        clave_origen: "01|2026-07-02T00:00:00|1|1|11|1",
        huella_origen: "[\"source-b\"]",
        fecha_fuente: "2026-07-02T00:00:00",
        fecha_movimiento: "2026-07-02",
        documento: "11",
        importe_pyg: -100,
        importe_usd: -2.5,
        historial: "MOV",
        cuenta_codigo: null,
        cuenta_descripcion: null,
        tipo_movimiento: "2",
        es_apertura: false,
        requiere_cuarentena: true,
        fila_origen: 3,
        datos_fuente: { CUENTA: "" },
      }),
    ];

    expect(await callBatch(loadId, "validate", rows)).toMatchObject({ escrituras: 0, insertadas: 2, cuarentena: 1 });
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(0);
    expect(await callBatch(loadId, "import", rows)).toMatchObject({ insertadas: 2, sin_cambios: 0, cuarentena: 1 });
    expect(await callBatch(loadId, "import", rows)).toMatchObject({ insertadas: 0, sin_cambios: 2, vinculadas: 0 });
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_cuarentena")).rows[0].count).toBe(1);

    await expect(callBatch(loadId, "import", [{ ...rows[0], huella_origen: "changed" }])).rejects.toThrow(/otra huella|revertido/i);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(2);

    await expect(db.query("SELECT public.totvs_finalizar_mayor_carga_v1($1::uuid,$2::jsonb)", [loadId, JSON.stringify({
      movimientos: 3, aperturas: 1, filas_tpsldo_1: 2, filas_tpsldo_9: 0, cuarentena: 1,
      neto_tpsldo_1_pyg: 0, neto_tpsldo_1_usd: 0, neto_tpsldo_9_pyg: 0, neto_tpsldo_9_usd: 0,
    })])).rejects.toThrow(/no concilia/i);

    const finished = (await db.query<{ result: Record<string, unknown> }>(
      "SELECT public.totvs_finalizar_mayor_carga_v1($1::uuid,$2::jsonb) result",
      [loadId, JSON.stringify({ movimientos: 2, aperturas: 1, filas_tpsldo_1: 2, filas_tpsldo_9: 0, cuarentena: 1,
        neto_tpsldo_1_pyg: 0, neto_tpsldo_1_usd: 0, neto_tpsldo_9_pyg: 0, neto_tpsldo_9_usd: 0 })],
    )).rows[0].result;
    expect(finished).toMatchObject({ estado: "COMPLETA", movimientos: 2, cuarentena: 1 });
  });

  it("una reimportación completa no duplica movimientos ni agregados", async () => {
    const loadId = await startLoad("2");
    const rows = (await db.query<{ data: MayorImportRow }>(`SELECT jsonb_build_object(
      'clave_origen',clave_origen,'huella_origen',huella_origen,'sucursal',sucursal,'anio_mes',anio_mes,
      'fecha_fuente',fecha_fuente,'fecha_movimiento',fecha_movimiento,'lote',lote,'sublote',sublote,
      'documento',documento,'linea',linea,'importe_pyg',importe_pyg,'importe_usd',importe_usd,
      'historial',historial,'cuenta_codigo',cuenta_codigo,'cuenta_descripcion',cuenta_descripcion,
      'centro_costo',centro_costo,'centro_costo_descripcion',centro_costo_descripcion,
      'item_contable',item_contable,'cliente',cliente,'origen',origen,'tipo_movimiento',tipo_movimiento,
      'tipo_saldo',tipo_saldo,'contraparte_codigo',contraparte_codigo,'contraparte_tienda',contraparte_tienda,
      'documento_asociado',documento_asociado,'tipo_asiento',tipo_asiento,'fecha_inclusion',fecha_inclusion,
      'usuario_nombre',usuario_nombre,'asiento',asiento,'es_apertura',es_apertura,
      'archivo_origen',archivo_origen,'fila_origen',fila_origen,'datos_fuente',datos_fuente) data
      FROM public.totvs_mayor_movimientos ORDER BY clave_origen`)).rows.map((item) => item.data);
    expect(await callBatch(loadId, "import", rows)).toMatchObject({ insertadas: 0, sin_cambios: 2 });
    await db.query("SELECT public.totvs_finalizar_mayor_carga_v1($1::uuid,$2::jsonb)", [loadId, JSON.stringify({
      movimientos: 2, aperturas: 1, filas_tpsldo_1: 2, filas_tpsldo_9: 0, cuarentena: 1,
      neto_tpsldo_1_pyg: 0, neto_tpsldo_1_usd: 0, neto_tpsldo_9_pyg: 0, neto_tpsldo_9_usd: 0,
    })]);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(2);
    expect((await db.query<{ count: number }>("SELECT sum(filas)::int count FROM public.totvs_mayor_resumen_agregado")).rows[0].count).toBe(2);
  });

  it("cancela una carga parcial y elimina solo movimientos huérfanos", async () => {
    const loadId = await startLoad("3");
    await callBatch(loadId, "import", [row({
      clave_origen: "02|2026-08-01T00:00:00|2|1|20|1", huella_origen: "new",
      sucursal: "02", fecha_fuente: "2026-08-01T00:00:00", fecha_movimiento: "2026-08-01",
      lote: "2", documento: "20", historial: "MOV", es_apertura: false,
    })]);
    await db.query("SELECT public.totvs_cancelar_mayor_carga_v1($1::uuid)", [loadId]);
    expect((await db.query<{ count: number }>("SELECT count(*)::int count FROM public.totvs_mayor_movimientos")).rows[0].count).toBe(2);
  });

  it("limita escritura a importaciones y lectura agregada a gerencia", async () => {
    await db.exec(`UPDATE public.test_auth SET admin=false,gerencia=false WHERE uid='${userId}'`);
    await expect(startLoad("4")).rejects.toThrow(/sin permiso/i);
    await expect(db.query("SELECT public.totvs_consultar_mayor_resumen_v1(NULL,NULL)")).rejects.toThrow(/sin permiso/i);
    await db.exec(`UPDATE public.test_auth SET gerencia=true WHERE uid='${userId}'`);
    const result = (await db.query<{ result: unknown[] }>("SELECT public.totvs_consultar_mayor_resumen_v1(NULL,NULL) result")).rows[0].result;
    expect(result.length).toBeGreaterThan(0);
    await db.exec(`UPDATE public.test_auth SET admin=true,gerencia=false WHERE uid='${userId}'`);
  });

  it("mantiene clasificación versionada fuera del asiento y no publica EBITDA", () => {
    expect(migration).toContain("totvs_mayor_cuentas_clasificacion");
    expect(migration).toContain("PROVISIONAL_CIERRE_POR_CONFIRMAR");
    expect(migration).toContain("'PROPUESTA','CLARA','REVISION'");
    expect(migration).toContain("importe_excluido_pyg");
    expect(migration).toContain("movimientos_elegibles");
    expect(migration).not.toContain("SELECT m.* FROM public.totvs_mayor_movimientos");
    expect(migration).not.toMatch(/\bAS\s+(ebitda|margen_bruto|resultado_neto)\b/i);
    expect(classificationSeed.match(/,'PROPUESTA',/g)).toHaveLength(217);
    expect(classificationSeed.match(/,'REVISION',/g)).toHaveLength(34);
    expect(classificationSeed).toContain("CLARA queda reservada para una version aprobada");
    expect(classificationSeed).toContain("'2026-09-01','PROVISIONAL_CIERRE_POR_CONFIRMAR'");
    expect(classificationSeed).toContain("'2026-10-01','PARCIAL'");
  });
});
