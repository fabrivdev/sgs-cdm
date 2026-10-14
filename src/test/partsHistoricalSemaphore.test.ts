// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite();
const migration = readFileSync("supabase/migrations/20261014190000_parts_historical_semaphore.sql", "utf8");

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.v_repuestos_stock_matriz (
      codigo_interno text PRIMARY KEY, codigo_fabricante text, descripcion text, marca text, familia text,
      santa_rita numeric, santa_rosa numeric, campo_9 numeric, misiones numeric,
      loma_plata numeric, katuete numeric, total numeric
    );
    CREATE TABLE public.repuestos_ventas_vinculacion (
      producto_codigo text, fecha_efectiva date, cantidad numeric, estado_vinculo text
    );
    CREATE TABLE public.repuestos_maestro_legacy_cargas (id integer PRIMARY KEY, activo boolean, estado text);
    CREATE TABLE public.repuestos_maestro_legacy (
      carga_id integer, producto_codigo text, codigo_legacy text, estado_vinculo text
    );
    CREATE TABLE public.totvs_kardex_sintetico (
      producto_codigo text, saldo numeric, valor_2 numeric, actualizado_en timestamptz, archivo_origen text
    );
    INSERT INTO public.v_repuestos_stock_matriz
      (codigo_interno, descripcion, marca, santa_rita, santa_rosa, campo_9, misiones, loma_plata, katuete, total)
    SELECT 'REP' || lpad(g::text,3,'0'), 'Pieza ' || g, 'CLAAS',
      CASE WHEN g = 1 THEN 5 ELSE 3 END, 0,0,0,0,0,
      CASE WHEN g = 1 THEN 5 ELSE 3 END
    FROM generate_series(1,8) g;
    INSERT INTO public.repuestos_ventas_vinculacion VALUES
      ('REP001',current_date - 10,10,'CONFIRMADA'),
      ('REP002',current_date - 10,4,'CONFIRMADA'),
      ('REP003',current_date - 500,1,'CONFIRMADA'),
      ('REP004',current_date - 900,1,'CONFIRMADA'),
      ('REP005',current_date - 1200,1,'CONFIRMADA'),
      ('REP006',current_date - 2000,1,'CONFIRMADA'),
      ('REP007',current_date - 2,100,'AMBIGUA');
    INSERT INTO public.repuestos_maestro_legacy_cargas VALUES (1,true,'COMPLETADO');
    INSERT INTO public.repuestos_maestro_legacy VALUES (1,'REP007','OLD-7','CONFIRMADA');
    INSERT INTO public.totvs_kardex_sintetico VALUES
      ('REP001',5,100,now(),'kardex.xml'),('REP002',1,20,now(),'kardex.xml');
  `);
  await db.exec(migration);
});
afterAll(async () => { await db.close(); });

describe("semáforo histórico de repuestos", () => {
  it("clasifica cada franja y no convierte ventas ambiguas en actividad", async () => {
    const result = await db.query<{ codigo_interno: string; color: string }>(
      "SELECT codigo_interno,color FROM public.v_repuestos_semaforo_historico ORDER BY codigo_interno",
    );
    expect(result.rows.map(row => row.color)).toEqual([
      "VERDE_OSCURO", "VERDE_CLARO", "AMARILLO", "NARANJA",
      "LILA", "GRIS", "ROJO", "SIN_DATOS",
    ]);
  });

  it("separa la foto valorizada del saldo actual y pagina sin perder resumen", async () => {
    const result = await db.query<{ report: Record<string, unknown> }>(
      "SELECT public.repuestos_semaforo_historico_paginado(NULL,NULL,NULL,NULL,2,0) AS report",
    );
    const report = result.rows[0].report;
    expect(report.lineas).toBe(8);
    expect(report.valor_kardex_usd).toBe(120);
    expect(report.lineas_valorizadas).toBe(2);
    expect(report.saldos_coincidentes).toBe(1);
    expect((report.rows as unknown[]).length).toBe(2);
    const filtered = await db.query<{ report: Record<string, unknown> }>(
      "SELECT public.repuestos_semaforo_historico_paginado(NULL,'CLAAS','ROJO','Santa Rita',50,0) AS report",
    );
    expect(filtered.rows[0].report.lineas).toBe(1);
  });
});
