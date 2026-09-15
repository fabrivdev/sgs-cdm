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
const call = async sql => (await db.query('select '+sql+' as result')).rows[0].result;
const h = (await db.query("select * from ventas_servicios_movimientos_enriquecidos('2026-01-01','2026-08-31')")).rows;
assert.equal(h.length,5);
assert.equal(h.reduce((sum,r)=>sum+Number(r.total_venta),0),430);
assert.equal(h.find(r=>r.linea_id==='H1').os_numero,'5734');
assert.equal(h.find(r=>r.linea_id==='H1').nro_chasis,'C7501463');
assert.equal(h.find(r=>r.linea_id==='H1').propietario_os,'VALDECIR MOHR');
assert.equal(h.find(r=>r.linea_id==='H1').propietario,null); // Never substitute billed/historical owner for current owner.
assert.equal(h.find(r=>r.linea_id==='AMB').os_numero,null);
assert.equal(h.find(r=>r.linea_id==='AMB').vinculo_os,'ambiguo');
assert.equal(h.find(r=>r.linea_id==='SIN-FECHA').os_numero,null);
assert.equal(await call("ventas_servicios_factura_clave('001-003-0000054')"),'1-3-54');
assert.notEqual(await call("ventas_servicios_factura_clave('1-3-54')"),await call("ventas_servicios_factura_clave('13-5-4')"));
assert.equal(await call("ventas_servicios_texto_normalizado('  Valdécir  Mohr  ')"),'VALDECIR MOHR');

const detail = await call("ventas_servicios_detalle_os_v2('2026-01-01','2026-08-31',null,'Valdécir Mohr')");
assert.equal(detail.reduce((sum,r)=>sum+Number(r.total),0),320);
assert.equal(detail.length,2); // OS1 and uniquely linked 5734, not ABIERTA.
const legacy = detail.find(r=>r.os_numero==='5734');
assert.equal(legacy.total,220); assert.equal(legacy.chasis,'C7501463');
assert.equal(legacy.propietario,'Propietario no informado');
assert.equal(legacy.propietario_os,'VALDECIR MOHR');
assert.equal(legacy.cliente_facturado,'Pagador tercero'); assert.equal(legacy.facturas,1);
const current=detail.find(r=>r.os_numero==='OS1');
assert.equal(current.propietario,'Dueño'); assert.equal(current.cliente_facturado,'Facturado');

const panorama=await call("ventas_servicios_panorama_v2('2026-01-01','2026-08-31',null,null,'mes','Valdécir Mohr')");
const indicators=await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31',null,null,null,null,'Valdécir Mohr')");
assert.equal(panorama.resumen.total,320); assert.equal(indicators.totales.neto,320);
assert.equal(panorama.resumen.ordenes,2); assert.equal(indicators.totales.ordenes,2);
const lines=await call("ventas_servicios_lineas_v2('2026-01-01','2026-08-31')");
assert.equal(lines.filter(r=>r.texto_busqueda.includes('VALDECIR MOHR')).reduce((sum,r)=>sum+Number(r.total_venta),0),320);
assert.equal(lines.find(r=>r.id==='H1').cliente,'Pagador tercero');
const tech=await call("ventas_servicios_tecnicos_v1('2026-01-01','2026-08-31',null,null,null,null,'Valdécir Mohr')");
assert.equal(tech.reduce((sum,r)=>sum+Number(r.mo_total),0),200); // Missing legacy participation stays explicitly unattributed.
assert.equal((await call("ventas_servicios_panorama_v2('2026-01-01','2026-08-31')")).resumen.total,430);
assert.equal((await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31',null,null,'CLAAS')")).totales.neto,0);
// A normalized OS collision must not multiply any financial line either.
await db.exec("insert into ordenes_servicio_importadas(os_numero,nro_chasis,tipo_tiempo,raw_data) values(' os1 ','WRONG','Cliente','{}');");
const collision=(await db.query("select * from ventas_servicios_movimientos_enriquecidos('2026-01-01','2026-08-31')")).rows;
assert.equal(collision.length,5);
assert.equal(collision.reduce((sum,r)=>sum+Number(r.total_venta),0),430);
assert.equal(collision.find(r=>r.os_numero==='OS1').nro_chasis,null);
await db.exec("create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;");
await assert.rejects(()=>call("ventas_servicios_movimientos_enriquecidos('2026-01-01','2026-08-31')"),/No tenes acceso/);
await db.close();
console.log('Passed: migration/idempotence, unique legacy invoice+branch+year, ambiguous/unmatched links, owner identities, uniform search/totals, no open OS or other areas, technician reconciliation, authorization.');
