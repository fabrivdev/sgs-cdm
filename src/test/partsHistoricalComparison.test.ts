// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const db = new PGlite();
let year: number;
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
 CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.access',true),'yes')='yes' $$;
 CREATE TABLE fixture(id text,fecha date,cliente text,codigo text,descripcion text,importe numeric,marca text,sucursal text);
 CREATE FUNCTION ventas_repuestos_movimientos_v2(date,date,text,text) RETURNS SETOF fixture LANGUAGE sql AS $$
  SELECT * FROM fixture WHERE fecha BETWEEN $1 AND $2 AND ($3 IS NULL OR sucursal=$3) $$;`);
 year = Number((await db.query<{ y: number }>(`SELECT extract(year FROM now() AT TIME ZONE 'America/Asuncion')::integer AS y`)).rows[0].y);
 await db.exec(`INSERT INTO fixture VALUES
 ('a','${year}-01-01','Cliente A','P1','Filtro',100,'CLAAS','Santa Rita'),
 ('b','${year-1}-12-20','Cliente A','P1','Filtro',200,'CLAAS','Santa Rita'),
 ('c','${year-2}-12-31','Cliente A','P1','Filtro',300,'CLAAS','Santa Rita'),
 ('d','${year-1}-01-01','Cliente A','P2','Correa',50,'HORSCH','Santa Rita'),
 ('e','${year-1}-12-20','Cliente B','P1','Filtro',400,'CLAAS','Loma Plata'),
 ('nc','${year-1}-12-21','Cliente A','P1','Filtro',-20,'CLAAS','Santa Rita');`);
 await db.exec(readFileSync('supabase/migrations/20261119110000_parts_history_full_year_brand.sql','utf8'));
}, 30000);
afterAll(async () => { await db.close(); });
const report = async (cutoff: string, view = 'clientes', brand: string | null = null, branch: string | null = null) =>
 (await db.query<{ result: { filas: { nombre: string; actual: number; anterior: number; antiguo: number }[] } }>(
  'SELECT repuestos_historico_v2($1::date,$2,$3,$4) AS result',[cutoff,view,branch,brand])).rows[0].result;

describe('parts historical full-year comparison', () => {
 it('includes December of previous years with the current year ending on December 31', async () => {
  const result = await report(`${year}-12-31`,'clientes','CLAAS','Santa Rita');
  expect(result.filas).toEqual([{ clave: 'CLIENTE A', nombre: 'Cliente A', descripcion: null, actual: 100, anterior: 180, antiguo: 300 }]);
  expect((await report(`${year}-06-30`,'clientes','CLAAS','Santa Rita')).filas[0].anterior).toBeNull();
 });
 it('filters brands before grouping clients or parts and preserves credit notes', async () => {
  for (const view of ['clientes','repuestos']) {
   const rows = (await report(`${year}-12-31`,view,'HORSCH')).filas;
   expect(rows).toHaveLength(1); expect(rows[0].anterior).toBe(50);
  }
  const result = await report(`${year}-12-31`,'repuestos','CLAAS','Santa Rita');
  expect(result.filas[0].nombre).toBe('P1'); expect(result.filas[0].anterior).toBe(180);
 });
 it('preserves the previous RPC and rejects dates after this year', async () => {
  const old = await db.query<{ result: unknown }>('SELECT repuestos_historico_v1($1::date) AS result',[`${year}-12-31`]);
  expect(old.rows[0].result).toEqual(await report(`${year}-12-31`));
  await expect(report(`${year+1}-01-01`)).rejects.toThrow('fecha de corte');
 });
 it('still enforces section access', async () => {
  await db.exec(`SET test.access='no'`);
  try { await expect(report(`${year}-12-31`)).rejects.toThrow('Sin acceso'); }
  finally { await db.exec(`SET test.access='yes'`); }
 });
});
