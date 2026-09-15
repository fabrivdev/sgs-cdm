// Run from repo root after: npm install --prefix output/sql-check @electric-sql/pglite --no-save --package-lock=false
// Isolated fixture database only: never connects to production.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
create function public.has_section_access(uuid,text) returns boolean language sql as $$select true$$;
create function public.parque_normalizar_clave(text) returns text immutable language sql as $$select upper(regexp_replace($1,'[^a-zA-Z0-9]','','g'))$$;
create function public.ventas_tipo_tiempo_normalizado(text) returns text language sql as $$select coalesce($1,'No informado')$$;
create type marca as enum ('HORSCH','CLAAS');
create type subgrupo_maquina as enum ('SEMBRADORAS','COSECHADORAS');
create table clientes(id uuid primary key, nombre text);
create table parque_maquinas(serie text, cliente_id uuid, marca marca, marca_nombre text, subgrupo subgrupo_maquina, subgrupo_personalizado text, modelo_tipo text);
create table ordenes_servicio_importadas(os_numero text primary key,nro_chasis text,tipo_tiempo text,raw_data jsonb,cliente_nombre text,fecha_abierta_os date,fecha_cierre_os date,servicios_cantidad numeric,km_cantidad numeric,responsable text,situacion_os text,factura text);
create table facturacion_lineas_importadas(id uuid primary key,tipo_tiempo text,raw_data jsonb,fecha_factura date,factura text,cod_mercaderia text,codigo_fabricante text,mercaderia text,observacion text,cantidad numeric,total_venta numeric,grupo_normalizado text,subgrupo_original text);
create table movements(linea_id text,fecha date,factura text,cliente text,sucursal text,concepto text,total_venta numeric,metodologia text,vinculada_os boolean,es_nota_credito boolean,os_numero text,codigo text,codigo_fabricante text,descripcion text,cantidad numeric,marca text,modelo text,chasis text,area_calculada text);
create function ventas_area_movimientos_base(date,date,text,text) returns setof movements language sql as $$select * from movements where fecha between $1 and $2$$;
insert into clientes values ('00000000-0000-0000-0000-000000000002','Dueño');
insert into parque_maquinas values ('24-491414','00000000-0000-0000-0000-000000000002','HORSCH',null,'SEMBRADORAS',null,'MAESTRO');
insert into ordenes_servicio_importadas values ('OS1','24491414','Garantia','{"Nombre":"Facturado"}','Facturado','2026-08-01',null,8,173,'Tecnico','Cerrada','FAC1'),('LEGACY','24491414','Cliente','{}','Facturado','2025-01-01',null,5,0,'Tecnico','Cerrada',null);
insert into facturacion_lineas_importadas values ('00000000-0000-0000-0000-000000000010','Garantia','{"linked_service_order":"OS1"}','2026-08-10','FAC1','REP1','FAB1','Repuesto',null,2,100,'Repuestos',null);
insert into movements(linea_id,fecha,factura,cliente,sucursal,concepto,total_venta,metodologia,os_numero,cantidad,area_calculada)
values ('00000000-0000-0000-0000-000000000010','2026-08-10','FAC1','Facturado','Santa Rita','Repuestos',100,'actual','OS1',2,'servicios');
`);

await db.exec(`
create table trabajos(id uuid primary key,sucursal text);
alter table ordenes_servicio_importadas add column trabajo_id uuid;
alter table ordenes_servicio_importadas add column fecha_emision_factura timestamptz;
create table comisiones_jornadas(os_numero text,tecnico_profile_id uuid,tecnico_nombre text,tipo_tiempo text,
 tipo_tiempo_importado text,horas_validas numeric,horas_calculadas numeric,horas_reportadas numeric,vigente boolean,estado_validacion text);
update ordenes_servicio_importadas set cliente_nombre='VALDECIR MOHR',raw_data='{"Nombre":"VALDECIR MOHR","CLIFAC":"123"}' where os_numero='OS1';
insert into comisiones_jornadas values('OS1',null,'Técnico','Garantia','Cliente',2,null,null,true,null);
insert into ordenes_servicio_importadas(os_numero,nro_chasis,tipo_tiempo,raw_data,cliente_nombre,fecha_abierta_os,servicios_cantidad,factura,fecha_emision_factura) values
 ('5734','C7501463','Cliente','{"canonical_branch":"Santa Rita"}','VALDECIR MOHR','2026-04-29',13,'1-3-201','2026-05-11'),
 ('OTRA-SEDE','CH2','Cliente','{"canonical_branch":"Misiones"}','Otro dueño','2026-04-01',3,'1-3-201','2026-05-11'),
 ('OTRO-ANIO','CH3','Cliente','{"canonical_branch":"Santa Rita"}','Otro año','2025-04-01',3,'1-3-201','2025-05-11'),
 ('AMB1','CH4','Cliente','{"canonical_branch":"Santa Rita"}','Dueño A','2026-04-01',4,'1-3-202','2026-05-11'),
 ('AMB2','CH5','Cliente','{"canonical_branch":"Santa Rita"}','Dueño B','2026-04-01',5,'1-3-202','2026-05-11'),
 ('ABIERTA','C7501463','Cliente','{"canonical_branch":"Santa Rita"}','VALDECIR MOHR','2026-05-01',5,null,null),
 ('SIN-FECHA','C7501463','Cliente','{"canonical_branch":"Santa Rita"}','VALDECIR MOHR','2026-05-01',5,'1-3-203',null);
insert into movements(linea_id,fecha,factura,cliente,sucursal,concepto,total_venta,metodologia,os_numero,cantidad,area_calculada,vinculada_os,es_nota_credito) values
 ('H1','2026-05-11','001-003-0000201','Pagador tercero','Santa Rita','Servicio',200,'historico',null,1,'servicios',false,false),
 ('H2','2026-05-11','001-003-0000201','Pagador tercero','Santa Rita','Kilometraje',20,'historico',null,1,'servicios',false,false),
 ('AMB','2026-05-11','1-3-202','Pagador tercero','Santa Rita','Servicio',50,'historico',null,1,'servicios',false,false),
 ('SIN-FECHA','2026-05-11','1-3-203','Pagador tercero','Santa Rita','Servicio',60,'historico',null,1,'servicios',false,false),
 ('NO-VENTAS','2026-05-11','1-3-300','VALDECIR MOHR','Santa Rita','Repuestos',500,'historico',null,1,'repuestos',false,false);
`);
await db.exec(readFileSync('supabase/migrations/20260911180000_service_machine_dimensions.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260911210000_reconcile_service_sales_technician_attribution.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql','utf8'));
// Idempotent when pasted again.
await db.exec(readFileSync('supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql','utf8'));

await db.exec(`
update ordenes_servicio_importadas set raw_data=raw_data || '{"totales_por_tipo":{"Garantia":{"horas":8},"Cliente":{"horas":2}}}'::jsonb where os_numero='OS1';
insert into facturacion_lineas_importadas(id,tipo_tiempo,raw_data) values
 ('00000000-0000-0000-0000-000000000011','Cliente','{"linked_service_order":"OS1"}'),
 ('00000000-0000-0000-0000-000000000012',null,'{"canonical_document_kind":"NotaCredito"}');
insert into movements(linea_id,fecha,factura,cliente,sucursal,concepto,total_venta,metodologia,os_numero,cantidad,area_calculada,vinculada_os,es_nota_credito) values
 ('00000000-0000-0000-0000-000000000011','2026-08-10','FAC2','Facturado','Santa Rita','Servicio',30,'actual','OS1',1,'servicios',true,false),
 ('00000000-0000-0000-0000-000000000012','2026-08-21','NC1','Facturado','Santa Rita','Servicio',-10,'actual',null,1,'servicios',false,true);
`);
const migration=readFileSync('supabase/migrations/20260915110000_restore_service_summary_brand_breakdown.sql','utf8');
await db.exec(migration);
await db.exec(migration); // Safe to paste again.
const call = async sql => (await db.query('select '+sql+' as result')).rows[0].result;
const report = await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31')");
assert.equal(report.totales.neto,450);
assert.equal(report.totales.horas,23);
assert.equal(report.totales.ordenes,2); // Same OS with 2 time types still counts once.
assert.equal(report.por_tipo.length,4);
assert.equal(report.por_marca_tipo.length,5);
const sum = (rows,key) => rows.reduce((total,r)=>total+Number(r[key]??0),0);
for(const key of ['mo','km','repuestos','terceros','neto']) {
 assert.equal(sum(report.por_tipo,key),report.totales[key]);
 assert.equal(sum(report.por_marca_tipo,key),report.totales[key]);
 assert.equal(sum(report.por_maquina,key),report.totales[key]);
}
assert.equal(sum(report.por_marca_tipo,'horas'),report.totales.horas);
const historical=report.por_tipo.find(r=>r.sin_vinculo_historico);
assert.equal(historical.neto,110);
assert.equal(historical.horas,null);
assert.equal(historical.ordenes,0); // UI displays missing links as em dash, not measured 0 orders.
const unclassified=report.por_tipo.find(r=>r.tipo_tiempo==='No informado'&&!r.sin_vinculo_historico);
assert.equal(unclassified.neto,-10); assert.equal(unclassified.horas,0);
const guarantee=report.por_marca_tipo.find(r=>r.marca==='HORSCH'&&r.tipo_tiempo==='Garantia');
assert.equal(guarantee.neto,100); assert.equal(guarantee.horas,8);
const client=report.por_marca_tipo.find(r=>r.marca==='HORSCH'&&r.tipo_tiempo==='Cliente');
assert.equal(client.neto,30); assert.equal(client.horas,2);
assert.equal(report.por_marca_tipo.find(r=>r.sin_vinculo_historico).horas,null);
const filtered = await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31',null,null,null,null,'Valdécir Mohr')");
assert.equal(filtered.totales.neto,350);
assert.equal(sum(filtered.por_marca_tipo,'neto'),350);
const brand = await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31',null,null,'HORSCH')");
assert.equal(brand.totales.neto,130); assert.equal(brand.por_marca_tipo.length,2);
const type = await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31',null,'Cliente')");
assert.equal(type.totales.neto,250); assert.ok(type.por_marca_tipo.every(r=>r.tipo_tiempo==='Cliente'));
const month = await call("ventas_servicios_indicadores_v1('2026-08-01','2026-08-31')");
assert.equal(month.totales.neto,120); assert.ok(month.por_tipo.every(r=>!r.sin_vinculo_historico));
const empty = await call("ventas_servicios_indicadores_v1('2099-01-01','2099-01-31')");
assert.deepEqual(empty.por_marca_tipo,[]); assert.equal(empty.totales.neto,0);
const panorama = await call("ventas_servicios_panorama_v2('2026-01-01','2026-08-31')");
assert.equal(panorama.resumen.total,report.totales.neto);
const tech = await call("ventas_servicios_tecnicos_v1('2026-01-01','2026-08-31')");
assert.equal(sum(tech,'mo_total'),report.totales.mo);
await db.exec("create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;");
await assert.rejects(()=>call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31')"),/No tenes acceso/);
await db.close();
console.log('Passed: restored brand/time contract, all components reconcile, multi-time OS, hours once per OS/type, historical nulls separate from NC, search/brand/time/date filters, technician totals, empty response, idempotence, authorization.');
