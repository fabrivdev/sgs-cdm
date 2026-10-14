// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SemaforoResultado } from "@/hooks/useSemaforoHistorico";
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE TABLE public.v_repuestos_stock_matriz (codigo_interno text PRIMARY KEY,codigo_fabricante text,descripcion text,marca text,familia text,santa_rita numeric,santa_rosa numeric,campo_9 numeric,misiones numeric,loma_plata numeric,katuete numeric,total numeric);
    CREATE TABLE repuestos_stock (producto_codigo text,sucursal text,deposito text,saldo_actual numeric);
    CREATE TABLE repuestos_ventas_vinculacion (producto_codigo text,fecha_efectiva date,cantidad numeric,estado_vinculo text);
    CREATE TABLE repuestos_maestro_legacy_cargas (id integer PRIMARY KEY,activo boolean,estado text);
    CREATE TABLE repuestos_maestro_legacy (carga_id integer,producto_codigo text,codigo_legacy text,estado_vinculo text);
    CREATE TABLE totvs_kardex_sintetico (producto_codigo text,sucursal text,deposito text,saldo numeric,valor_2 numeric,actualizado_en timestamptz,archivo_origen text);
    INSERT INTO v_repuestos_stock_matriz VALUES ('REP1','FAB1','Filtro','CLAAS','Filtros',2,0,0,0,0,3,5),('REP2',null,'Correa','GATES',null,4,0,0,0,0,0,4),('REP3',null,'Pieza','CLAAS','Filtros',1,0,0,0,0,0,1);
    INSERT INTO repuestos_stock VALUES ('REP1','Santa Rita','01 - DEPOSITO GENERAL',2),('REP1','Katuete','01 - DEPOSITO GENERAL',3),('REP2','Santa Rita','01 - DEPOSITO GENERAL',4),('REP3','Santa Rita','52 - GARANTIA',1);
    INSERT INTO totvs_kardex_sintetico VALUES ('REP1','01','01',1,40,now(),'k.xml'),('REP1','01','01',1,60,now(),'k.xml'),('REP1','02','01',3,300,now(),'k.xml'),('REP1','01','52',0,-10,now(),'k.xml'),('REP3','99','MU',0,20,now(),'k.xml');
    INSERT INTO repuestos_ventas_vinculacion VALUES ('REP1',current_date-5,10,'CONFIRMADA'),('REP2',current_date-800,1,'CONFIRMADA');
  `);
  await db.exec(readFileSync('supabase/migrations/20261014190000_parts_historical_semaphore.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20261014210000_parts_analysis_valuation.sql','utf8'));
});
afterAll(() => db.close());
async function report(filters = {}, group = 'marca', limit = 50, offset = 0) {
  return (await db.query<{report: SemaforoResultado}>(`SELECT repuestos_analisis_valorizado($1::jsonb,$2,$3,$4) report`,[JSON.stringify(filters),group,limit,offset])).rows[0].report;
}
describe('valorización por ubicación', () => {
  it('conserva cada valor una vez, incluidos residuales y sucursal desconocida', async () => {
    const r = await report();
    expect(r.valor_kardex_usd).toBe(410);
    expect(r.unidades_stock).toBe(10);
    expect(r.sucursales.find(s => s.nombre==='Katuete')?.valor_kardex_usd).toBe(300);
    expect(r.sucursales.find(s => s.nombre==='Santa Rita')?.valor_kardex_usd).toBe(90);
    expect(r.sucursales.find(s => s.nombre==='99')?.valor_kardex_usd).toBe(20);
    expect(r.sucursales.reduce((sum,s)=>sum+(s.valor_kardex_usd??0),0)).toBe(410);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.stock_total).toBe(5);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.unidades_365d).toBe(10);
  });
  it('filtra valor y stock local sin devolver valor global del artículo', async () => {
    const r = await report({sucursal:'Santa Rita',deposito:'01'});
    expect(r.valor_kardex_usd).toBe(100);
    expect(r.unidades_stock).toBe(6);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.valor_kardex_usd).toBe(100);
    expect(r.rows.find(row=>row.codigo_interno==='REP1')?.katuete).toBe(0);
  });
  it('no convierte ausencias en cero ni oculta cobertura parcial', async () => {
    const r = await report();
    expect(r.rows.find(row=>row.codigo_interno==='REP2')?.valor_kardex_usd).toBeNull();
    expect(r.ubicaciones_sin_valor).toBe(2);
    expect((await report({valorizacion:'INCOMPLETA'})).lineas).toBe(2);
    expect((await report({busqueda:'REP2'})).valor_kardex_usd).toBeNull();
  });
  it('reconcilia agrupaciones, colores y tres franjas antes de paginar', async () => {
    for (const key of ['marca','familia','sucursal','deposito']) {
      const r = await report({},key,1);
      expect(r.rows).toHaveLength(1);
      expect(r.grupos.reduce((sum,g)=>sum+(g.valor_kardex_usd??0),0)).toBe(410);
      expect(r.por_color.reduce((sum,c)=>sum+(c.valor_kardex_usd??0),0)).toBe(410);
      expect(r.franjas.reduce((sum,c)=>sum+(c.valor_kardex_usd??0),0)).toBe(410);
      expect(r.rotacion.valor).toBeNull();
    }
  });
  it('combina filtros y conserva señal negativa', async () => {
    expect((await report({familia:'Filtros',color:'VERDE_OSCURO',usd_min:'350',dias_max:'365'})).valor_kardex_usd).toBe(390);
    const r = await report({deposito:'52',usd_max:'0'});
    expect(r.valor_kardex_usd).toBe(-10);
    expect(r.rows[0].saldo_kardex).toBe(0);
  });
  it('fingerprint cambia con valores aunque cantidad de filas no cambie', async () => {
    const before = await report();
    await db.exec("UPDATE totvs_kardex_sintetico SET valor_2=valor_2+1 WHERE producto_codigo='REP1' AND sucursal='02'");
    const after = await report();
    expect(after.lineas).toBe(before.lineas);
    expect(after.version).not.toBe(before.version);
  });
  it('rechaza llamadas sin permiso y agrupaciones no admitidas', async () => {
    await expect(report({},'incorrecta')).rejects.toThrow('Agrupación');
    await db.exec('CREATE OR REPLACE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$');
    await expect(report()).rejects.toThrow('Sin acceso');
  });
});
