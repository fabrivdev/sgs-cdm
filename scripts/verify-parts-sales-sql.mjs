// Fixture PostgreSQL aislada. No lee ni modifica producción.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function has_section_access(uuid,text) returns boolean language sql as $$select $2='repuestos.ventas'$$;
create function cliente_nombre_canonico(text) returns text language sql as $$select case when upper($1) like 'CAMPOS DEL MA%ANA%' then 'CAMPOS DEL MAÑANA S.A.' else $1 end$$;
create table movements(linea_id text,fecha date,factura text,cliente text,sucursal text,
  metodologia text,codigo text,codigo_fabricante text,descripcion text,cantidad numeric,
  total_venta numeric,es_nota_credito boolean,area_calculada text);
create function ventas_area_movimientos_base(date,date,text,text) returns setof movements language sql as $$
  select * from movements where fecha between $1 and $2
    and ($3 is null or sucursal=$3)
    and ($4 is null or cliente ilike '%'||$4||'%' or codigo ilike '%'||$4||'%' or factura ilike '%'||$4||'%')
$$;
insert into movements values
 ('a','2026-08-10','FACT1','CAMPOS DEL MAÑANA S.A. - SANTA RITA','Santa Rita','actual','REP1','FAB1','Rodamiento',2,100,false,'repuestos'),
 ('b','2026-08-10','FACT1','CAMPOS DEL MAÑANA S.A.','Santa Rita','actual','REP2','FAB2','Correa',1,50,false,'repuestos'),
 ('c','2026-08-21','FACT1','CAMPOS DEL MAÑANA S.A.','Santa Rita','actual','REP1','FAB1','Rodamiento',1,-25,true,'repuestos'),
 ('d','2026-08-31','FACT2','Cliente B','Katuete','actual','REP1','FAB1','Rodamiento',2,80,false,'repuestos'),
 ('os','2026-08-21','FACTOS','Cliente OS','Santa Rita','actual','REP3','FAB3','Servicio',1,999,false,'servicios'),
 ('sept','2026-09-01','FACTSEP','Cliente B','Katuete','actual','REP1','FAB1','Rodamiento',1,1234,false,'repuestos'),
 ('july','2026-07-31','FACTJUL','Cliente B','Katuete','actual','REP1','FAB1','Rodamiento',1,40,false,'repuestos'),
 ('june','2026-06-30','FACTJUN','Cliente B','Katuete','historico',null,null,'Repuestos',9999,60,false,'repuestos'),
 ('ly','2025-08-31','FACTLY','Cliente B','Katuete','historico',null,null,'Repuestos',1000,10,false,'repuestos');
`);
const migration = readFileSync('supabase/migrations/20260915150000_rebuild_parts_sales_dashboard.sql', 'utf8');
await db.exec(migration);
await db.exec(migration); // Pegar nuevamente es seguro.
const call = async (name, args) => (await db.query(`select ${name}(${args}) as result`)).rows[0].result;
let report = await call('ventas_repuestos_panorama_v1', "'2026-08-01','2026-08-31'");
assert.equal(report.resumen.facturado,205);
assert.equal(report.resumen.ventas,230);
assert.equal(report.resumen.notas_credito,-25);
assert.equal(report.resumen.clientes,2); // Campos unificado antes de contar/agrupar.
assert.equal(report.resumen.documentos,3);
assert.equal(report.resumen.unidades_netas,4);
assert.equal(report.periodos[0].anterior,40);
assert.equal(report.periodos[0].anio_anterior,10);
assert.equal(report.periodos[0].hasta,'2026-08-31');
assert.equal(report.por_sucursal.reduce((s,r)=>s+r.facturado,0),205);
assert.equal(report.por_origen.reduce((s,r)=>s+r.facturado,0),205);
assert.equal(report.periodos.reduce((s,r)=>s+r.facturado,0),205);
let listing=await call('ventas_repuestos_listado_v1', "'2026-08-01','2026-08-31',null,null,'detalle'");
assert.equal(listing.total,4);
assert.equal(listing.filas.filter(r=>r.factura==='FACT1').length,3);
assert.equal(listing.filas.find(r=>r.id==='actual:c').cantidad,-1);
assert.equal(listing.total_periodo,205);
listing=await call('ventas_repuestos_listado_v1', "'2026-08-01','2026-08-31',null,null,'repuestos'");
assert.equal(listing.total,2);
assert.equal(listing.filas.find(r=>r.codigo==='REP1').facturado,155);
assert.equal(listing.filas.find(r=>r.codigo==='REP1').unidades_netas,3);
assert.equal(listing.filas.find(r=>r.codigo==='REP1').unidades_vendidas,4);
assert.equal(listing.filas.find(r=>r.codigo==='REP1').unidades_devueltas,1);
listing=await call('ventas_repuestos_listado_v1', "'2026-08-01','2026-08-31',null,null,'clientes'");
assert.equal(listing.total,2);
assert.equal(listing.filas.find(r=>r.cliente==='Cliente B').anterior,10);
assert.equal(listing.filas.find(r=>r.cliente==='CAMPOS DEL MAÑANA S.A.').facturado,125);
report=await call('ventas_repuestos_panorama_v1', "'2026-06-01','2026-08-31'");
assert.equal(report.resumen.facturado,305);
assert.equal(report.resumen.unidades_netas,null); // Histórico no se presenta como unidades de artículos.
report=await call('ventas_repuestos_panorama_v1', "'2026-08-01','2026-08-31','Katuete'");
assert.equal(report.resumen.facturado,80);
listing=await call('ventas_repuestos_listado_v1', "'2026-08-01','2026-08-31',null,'REP2','detalle'");
assert.equal(listing.total_periodo,50);
await db.exec(`insert into movements select 'bulk'||n,'2026-08-15','BULK','Cliente B','Katuete','actual','REP4','FAB4','Tornillo',1,1,false,'repuestos' from generate_series(1,520) n;`);
report=await call('ventas_repuestos_panorama_v1', "'2026-08-01','2026-08-31'");
assert.equal(report.resumen.facturado,725);
assert.equal(report.resumen.lineas,524);
assert.equal(report.resumen.documentos,4);
listing=await call('ventas_repuestos_listado_v1', "'2026-08-01','2026-08-31',null,null,'detalle',11,50");
assert.equal(listing.total,524);
assert.equal(listing.filas.length,24);
assert.equal(listing.total_periodo,725);
const seen=new Set();
for(let page=1;page<=11;page++) {
 const batch=await call('ventas_repuestos_listado_v1',`'2026-08-01','2026-08-31',null,null,'detalle',${page},50`);
 for(const row of batch.filas) {assert.ok(!seen.has(row.id));seen.add(row.id);}
}
assert.equal(seen.size,524);
report=await call('ventas_repuestos_panorama_v1', "'2024-01-01','2024-01-31'");
assert.equal(report.resumen.facturado,0);
assert.equal(report.periodos.length,1);
assert.equal(report.periodos[0].anterior_lineas,0);
await db.exec(`insert into movements values
 ('month-end','2026-01-31','JANEND','Cliente B','Katuete','actual','REP1','FAB1','Correa',1,7,false,'repuestos'),
 ('leap-end','2024-02-29','FEBEND','Cliente B','Katuete','historico',null,null,'Repuestos',1,8,false,'repuestos');`);
report=await call('ventas_repuestos_panorama_v1',"'2026-02-01','2026-02-28'");
assert.equal(report.periodos[0].anterior,7); // Febrero completo vs enero completo, incluye 31/01.
assert.equal(report.comparacion.hasta,'2026-01-31');
report=await call('ventas_repuestos_panorama_v1',"'2025-02-01','2025-02-28'");
assert.equal(report.periodos[0].anio_anterior,8); // Incluye el 29/02 del año bisiesto.
assert.equal(report.comparacion_ly.hasta,'2024-02-29');
for(const mode of ['dia','semana','anio']) {
 report=await call('ventas_repuestos_panorama_v1',`'2026-08-01','2026-08-31',null,null,'${mode}'`);
 assert.equal(report.periodos.reduce((s,r)=>s+r.facturado,0),725);
}
for (const args of ["null,'2026-08-31'", "'2026-09-01','2026-08-31'"]) {
 await assert.rejects(call('ventas_repuestos_panorama_v1',args),/rango de fechas/i);
}
await assert.rejects(call('ventas_repuestos_panorama_v1',"'2026-08-01','2026-08-31',null,null,'month'"),/Agrupación/);
await db.exec(`create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;`);
await assert.rejects(call('ventas_repuestos_listado_v1',"'2026-08-01','2026-08-31'"),/acceso/);
await assert.rejects(call('ventas_repuestos_panorama_v1',"'2026-08-01','2026-08-31'"),/acceso/);
await db.close();
console.log('OK: neto, NC, documentos, códigos, Campos, filtros, corte histórico, permisos y 524 líneas sin truncamiento.');
