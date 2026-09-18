// Isolated engine comparison: fictional records, no production connection.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.denied',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
    CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE repuestos_demanda_mensual(producto_codigo text,mes date,unidades_positivas numeric);
    CREATE TABLE repuestos_ventas_vinculacion(producto_codigo text,fecha_efectiva date,estado_vinculo text,cantidad numeric,linea_id uuid);
    CREATE TABLE facturacion_lineas_importadas(id uuid,entidad_nombre text);
    CREATE FUNCTION repuestos_sugerencia_viva_base_v4(text,date,text,text,text,boolean,integer,integer) RETURNS jsonb LANGUAGE sql AS $$
      SELECT jsonb_build_object('rows',jsonb_agg(jsonb_build_object(
        'producto_codigo','REP'||i,'stock_global',CASE WHEN i=3 THEN NULL ELSE i END,
        'stock_minimo_estrategico',0,'sugerencia_unidades',i%7,'segmento','ESTRELLA',
        'estado_datos','LISTO','unidades_12m',0,'total_vendido_12m',i/10.0,
        'abc','A','fsn','F','xyz','X','demanda_ponderada_mensual',i/10.0,
        'stock_objetivo',i,'ultima_venta',CASE WHEN i=3 THEN NULL ELSE (date '2026-08-01'+i%28)::text END
      ))) FROM generate_series(1,122) i
    $$;
  `);
  await db.exec(readFileSync('supabase/migrations/20260820230000_gate_purchase_suggestions_by_real_recurrence.sql','utf8'));
  // Same immutable natural-key helper as the preceding migration.
  const helper=readFileSync('supabase/migrations/20260918200000_parts_sales_global_sort_and_export.sql','utf8');
  await db.exec(helper.slice(helper.indexOf('CREATE OR REPLACE FUNCTION public.ventas_orden_natural'),helper.indexOf('DO $migration$')));
  await db.exec(readFileSync('supabase/migrations/20260918201000_purchase_suggestions_global_sort.sql','utf8'));
  const run=async(key,dir,limit=50,offset=0,only=false)=>(await db.query(`SELECT repuestos_sugerencia_viva_ordenada('CLAAS','2026-08-31',NULL,'TODOS','TODOS',$1,$2,$3,$4,$5) r`,[only,limit,offset,key,dir])).rows[0].r;
  const before=(await db.query(`SELECT repuestos_sugerencia_viva('CLAAS','2026-08-31',NULL,'TODOS','TODOS',false,1000,0) r`)).rows[0].r;
  for(const key of ['producto_codigo','clase','stock_global','demanda_ponderada_mensual','cobertura','ultima_venta','stock_objetivo','sugerencia_unidades']){
    for(const dir of ['asc','desc']){
      const full=await run(key,dir,1000);
      const pages=[...(await run(key,dir,50,0)).rows,...(await run(key,dir,50,50)).rows,...(await run(key,dir,50,100)).rows];
      assert.deepEqual(pages,full.rows); assert.equal(full.rows.length,122);
      assert.deepEqual(full.resumen,before.resumen);assert.equal(full.total_filtrado,before.total_filtrado);
      assert.deepEqual([...full.rows].sort((a,b)=>a.producto_codigo.localeCompare(b.producto_codigo)),[...before.rows].sort((a,b)=>a.producto_codigo.localeCompare(b.producto_codigo)));
      if(key==='stock_global'||key==='ultima_venta')assert.equal(full.rows.at(-1).producto_codigo,'REP3');
    }
  }
  const natural=(await run('producto_codigo','asc',1000)).rows;
  assert.ok(natural.findIndex(r=>r.producto_codigo==='REP2')<natural.findIndex(r=>r.producto_codigo==='REP10'));
  const filtered=await run('sugerencia_unidades','desc',1000,0,true);
  assert.ok(filtered.rows.every(r=>r.sugerencia_unidades>0));assert.equal(filtered.rows.length,filtered.total_filtrado);
  await assert.rejects(run('arbitrary','asc'),/Orden inválido/);
  await db.exec("SET fixture.denied='on'");
  await assert.rejects(run('stock_global','asc'),/No tenes acceso/);
  console.log('OK: all eight headers, both directions, global pages, natural codes, nulls last, unchanged forecasts/summary/filters and access.');
} catch (error) { console.error(error.message); process.exitCode=1; }
finally { await db.close(); }
