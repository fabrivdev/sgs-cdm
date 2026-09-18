// Isolated PostgreSQL fixture; no production connection or private records.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.denied',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
    CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE movimientos(id text,fecha date,factura text,cliente text,sucursal text,metodologia text,codigo text,codigo_fabricante text,descripcion text,cantidad numeric,importe numeric,es_nota_credito boolean,documento text,marca text,vendedor text);
    CREATE FUNCTION ventas_repuestos_movimientos_v2(date,date,text,text) RETURNS SETOF movimientos LANGUAGE sql STABLE AS $$ SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2 AND ($3 IS NULL OR sucursal=$3) AND ($4 IS NULL OR cliente ILIKE '%'||$4||'%') $$;
    INSERT INTO movimientos SELECT i::text,date '2026-08-01'+i%28,lpad(i::text,12,'0'),'Cliente ficticio','Santa Rita','actual','REP'||i,'FAB'||i,'Pieza ficticia',CASE WHEN i=3 THEN NULL ELSE 1 END,i/100.0,false,'DOC'||i,'CLAAS','Vendedor ficticio' FROM generate_series(1,121) i;
    INSERT INTO movimientos VALUES ('nc','2026-08-02','000000000001','Cliente ficticio','Santa Rita','actual','REP1','FAB1','Devolución ficticia',-1,-2.55,true,'NC1','CLAAS','Vendedor ficticio');
  `);
  await db.exec(readFileSync('drizzle/migrations/0007_fix_parts_sales_product_grouping.sql','utf8'));
  const before = (await db.query(`SELECT ventas_repuestos_listado_v2('2026-08-01','2026-08-31',NULL,NULL,'repuestos',1,100) r`)).rows[0].r;
  await db.exec(readFileSync('supabase/migrations/20260918200000_parts_sales_global_sort_and_export.sql','utf8'));
  const spanish = (await db.query(`SELECT name FROM unnest(ARRAY['Carlos','Cañete','Campos','Álvaro','Núñez','Ñandú','Oscar']) name ORDER BY ventas_orden_natural(name) COLLATE "C"`)).rows.map(r=>r.name);
  assert.deepEqual(spanish,['Álvaro','Campos','Cañete','Carlos','Núñez','Ñandú','Oscar']);
  const run = async (view, key, dir, page=1, full=false) => (await db.query(`SELECT ventas_repuestos_listado_v3('2026-08-01','2026-08-31',NULL,NULL,$1,$2,50,$3,$4,$5) r`,[view,page,key,dir,full])).rows[0].r;
  const asc = await run('detalle','facturado','asc');
  assert.equal(asc.filas[0].facturado,-2.55);
  const full = await run('detalle','facturado','asc',1,true);
  assert.equal(full.total,122); assert.equal(full.filas.length,122);
  const pages=[...(await run('detalle','facturado','asc',1)).filas,...(await run('detalle','facturado','asc',2)).filas,...(await run('detalle','facturado','asc',3)).filas];
  assert.deepEqual(pages,full.filas); assert.equal(new Set(pages.map(r=>r.id)).size,122);
  const natural=await run('detalle','codigo','asc',1,true);
  assert.ok(natural.filas.findIndex(r=>r.codigo==='REP2') < natural.filas.findIndex(r=>r.codigo==='REP10'));
  for (const dir of ['asc','desc']) assert.equal((await run('detalle','cantidad',dir,1,true)).filas.at(-1).cantidad,null);
  for (const view of ['clientes','vendedores','repuestos']) {
    const report=await run(view,'facturado','desc',1,true);
    assert.ok(Math.abs(report.filas.reduce((n,r)=>n+r.facturado,0)-full.total_periodo)<1e-8);
  }
  const products=await run('repuestos','codigo','asc',1,true);
  for (const row of before.filas) assert.deepEqual(products.filas.find(r=>r.id===row.id),row);
  await assert.rejects(run('detalle',"facturado; DELETE FROM movimientos",'asc'),/Columna inválida/);
  await assert.rejects(run('detalle','fecha','invalid'),/Dirección inválida/);
  await db.exec("SET fixture.denied='on'");
  await assert.rejects(run('detalle','fecha','asc',1,true),/No tenes acceso/);
  console.log('OK: complete export, global ordering before pagination, natural codes, nulls last, NC, unchanged ABC/totals and authorization.');
} finally { await db.close(); }
