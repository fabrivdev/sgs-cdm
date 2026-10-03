// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
const sql = readFileSync("supabase/migrations/20261003010500_honor_confirmed_totvs_exclusions.sql", "utf8");
const db = new PGlite();
beforeAll(async () => { await db.exec(`
 CREATE TABLE tmp_facturacion_totvs_unicas(identidad text,linea jsonb);
 CREATE TABLE os_exclusiones_confirmadas(os_numero text,factura text);
 INSERT INTO os_exclusiones_confirmadas VALUES ('SYN-OS-CANCELED','000123');
 INSERT INTO tmp_facturacion_totvs_unicas VALUES
 ('by-os','{"factura":"987","raw_data":{"linked_service_order":" syn-os-canceled "}}'),
 ('by-invoice','{"factura":"000-123","raw_data":{}}'),
 ('accepted','{"factura":"999","raw_data":{"linked_service_order":"SYN-OS-VALID"}}');
 `); });
afterAll(async () => { await db.close(); });
describe("exclusiones TOTVS confirmadas", () => {
 it("usa la misma regla de OS o factura del trigger, sin ampliar la exclusion", async () => {
   const start = sql.indexOf("  CREATE TEMP TABLE tmp_facturacion_totvs_exclusiones ON COMMIT DROP AS");
   const end = sql.indexOf("  CREATE UNIQUE INDEX ON tmp_facturacion_totvs_exclusiones", start);
   expect(start).toBeGreaterThan(0);
   await db.exec("BEGIN");
   await db.exec(sql.slice(start, end));
   const rows = (await db.query<{ identidad: string }>("SELECT identidad FROM tmp_facturacion_totvs_exclusiones ORDER BY identidad")).rows;
   expect(rows.map(r => r.identidad)).toEqual(["by-invoice", "by-os"]);
   await db.exec("ROLLBACK");
 });
 it("exige igualdad de identidades y evidencia del intento actual", () => {
   expect(sql).toContain("EXCEPT SELECT identidad FROM tmp_facturacion_totvs_inserciones_reales");
   expect(sql).toContain("SELECT identidad FROM tmp_facturacion_totvs_inserciones_reales\n     EXCEPT");
   expect(sql).toContain("ev.registro->>'importacion_id'=v_importacion_id::text");
   expect(sql).toContain("ev.os_numero=ANY(e.os_excluidas)");
   expect(sql).toContain("no dejo evidencia del trigger");
 });
 it("comprueba el resumen excluido y conserva guardas y respaldo previo", () => {
   expect(sql).toContain("f.excluido_de_reportes IS TRUE");
   expect(sql).toContain("f.cod_entidad IS NOT DISTINCT FROM r.fila->>'cod_entidad'");
   expect(sql).toContain("facturacion_totvs_importador_versiones");
   expect(sql).toContain("ON CONFLICT(version) DO NOTHING");
   expect(sql).toContain("Un trigger omitio reparaciones TOTVS durante UPDATE");
   expect(sql).toContain("Cambio comercial para la identidad TOTVS");
   expect(sql).not.toMatch(/DISABLE\s+TRIGGER|DROP\s+TRIGGER|DELETE\s+FROM\s+public\.facturacion_lineas_importadas/i);
 });
});
