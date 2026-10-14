// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const repair = readFileSync("supabase/admin/repair_latest_billing_provenance_20261014_review_only.sql", "utf8");
const db = new PGlite();
const load = "60c2ff01-dd47-448a-8816-285ae184430f";

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE TABLE public.importaciones(
      id uuid PRIMARY KEY, archivo_sha256 text, total_filas integer,
      insertados integer, metadata jsonb
    );
    CREATE TABLE public.facturacion_lineas_importadas(
      id uuid PRIMARY KEY, fecha_factura timestamptz
    );
    CREATE TABLE public.facturacion_totvs_carga_lineas(
      importacion_id uuid NOT NULL REFERENCES public.importaciones(id),
      linea_id uuid NOT NULL REFERENCES public.facturacion_lineas_importadas(id),
      documento_fuente_sha256 text NOT NULL,
      PRIMARY KEY(importacion_id,linea_id)
    );
    INSERT INTO public.importaciones VALUES(
      '${load}',
      '23a2429af54d009873d41e3fe87a3b02bc35e25716b5f479b5a3483a5b045f3f',
      4119,4117,
      '{"technicalLoadState":"COMPLETE","technicalProvenanceLinkedLines":4117,"lineas_excluidas_confirmadas":2}'
    );
    INSERT INTO public.facturacion_lineas_importadas(id,fecha_factura)
    SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      CASE WHEN n<=4117 THEN '2026-10-13'::timestamptz ELSE NULL END
    FROM generate_series(1,4892) n;
    INSERT INTO public.facturacion_totvs_carga_lineas
    SELECT '${load}',id,repeat('a',64)
    FROM public.facturacion_lineas_importadas;
  `);
});
afterAll(async () => { await db.close(); });

describe("reparación puntual de procedencia", () => {
  it("retira solo los 775 vinculos sin fecha, audita y bloquea una recaida", async () => {
    await db.exec(repair);
    const count = (sql: string) => db.query<{ count: number }>(sql).then((result) => result.rows[0].count);
    expect(await count("SELECT count(*)::int count FROM public.facturacion_totvs_carga_lineas")).toBe(4117);
    expect(await count("SELECT count(*)::int count FROM public.facturacion_totvs_vinculos_retirados_auditoria")).toBe(775);
    expect(await count("SELECT count(*)::int count FROM public.facturacion_lineas_importadas")).toBe(4892);
    await expect(db.query(`INSERT INTO public.facturacion_totvs_carga_lineas VALUES(
      '${load}','00000000-0000-4000-8000-000000004892',repeat('a',64))`))
      .rejects.toThrow(/sin fecha/i);
    await expect(db.exec(repair)).rejects.toThrow(/ya no coincide|distinta/i);
  }, 30000);
});
