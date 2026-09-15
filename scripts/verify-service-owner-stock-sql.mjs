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
alter table parque_maquinas add column activo boolean not null default true;
create table parque_stock_maquinas(chasis text,marca text,tipo text,modelo text,saldo_actual numeric);
insert into parque_stock_maquinas values
 ('C7501463','HORSCH','SEMBRADORAS','MAESTRO',1),
 ('ST-001','CLAAS','COSECHADORAS','LEXION',1),
 ('ST001','CLAAS','COSECHADORAS','LEXION',1),
 ('ZERO','CLAAS','COSECHADORAS','LEXION',0),
 ('NEG','CLAAS','COSECHADORAS','LEXION',-1),
 ('24491414','CLAAS','COSECHADORAS','OTHER',1);
insert into clientes values
 ('00000000-0000-0000-0000-000000000003','CAMPOS DEL MANANA S. A. - SANTA RITA'),
 ('00000000-0000-0000-0000-000000000004','campos del mañana SA (OTRA SEDE)'),
 ('00000000-0000-0000-0000-000000000005','Otro dueño');
insert into parque_maquinas values
 ('INACT','00000000-0000-0000-0000-000000000005','CLAAS',null,'COSECHADORAS',null,'VIEJO',false),
 ('DUP','00000000-0000-0000-0000-000000000003','HORSCH',null,'SEMBRADORAS',null,'MAESTRO',true),
 ('D-UP','00000000-0000-0000-0000-000000000004','HORSCH',null,'SEMBRADORAS',null,'MAESTRO',true),
 ('CONFLICT','00000000-0000-0000-0000-000000000003','HORSCH',null,'SEMBRADORAS',null,'MAESTRO',true),
 ('CON-FLICT','00000000-0000-0000-0000-000000000005','HORSCH',null,'SEMBRADORAS',null,'MAESTRO',true),
 ('NOOWNER',null,'HORSCH',null,'SEMBRADORAS',null,'MAESTRO',true);
insert into parque_stock_maquinas values ('INACT','CLAAS','COSECHADORAS','NUEVO',1),('NOOWNER','HORSCH','SEMBRADORAS','MAESTRO',1);
insert into ordenes_servicio_importadas(os_numero,nro_chasis,tipo_tiempo,raw_data,cliente_nombre,fecha_abierta_os,servicios_cantidad) values
 ('STOCK','ST001','Cliente','{"Nombre":"campos del manana SA - KATUETE","CLIFAC":"123"}','Pagador externo','2026-08-10',2),
 ('ZERO','ZERO','Cliente','{"Nombre":"Pagador externo","CLIFAC":"123"}','Pagador externo','2026-08-10',3),
 ('NEG','NEG','Cliente','{}','Pagador externo','2026-08-10',4);
insert into facturacion_lineas_importadas(id,tipo_tiempo,raw_data) values
 ('00000000-0000-0000-0000-000000000020','Cliente','{"linked_service_order":"STOCK"}'),
 ('00000000-0000-0000-0000-000000000021','Cliente','{"linked_service_order":"ZERO"}'),
 ('00000000-0000-0000-0000-000000000022','Cliente','{"linked_service_order":"NEG"}');
insert into movements(linea_id,fecha,factura,cliente,sucursal,concepto,total_venta,metodologia,os_numero,cantidad,area_calculada,vinculada_os,es_nota_credito) values
 ('00000000-0000-0000-0000-000000000020','2026-08-10','STF1','CAMPOS DEL MANANA S.A. - SANTA RITA','Santa Rita','Servicio',10,'actual','STOCK',1,'servicios',true,false),
 ('00000000-0000-0000-0000-000000000021','2026-08-10','STF2','campos del mañana SA (OTRA SEDE)','Santa Rita','Servicio',20,'actual','ZERO',1,'servicios',true,false),
 ('00000000-0000-0000-0000-000000000022','2026-08-10','STF3','Otro facturado','Santa Rita','Servicio',30,'actual','NEG',1,'servicios',true,false);
`);
await db.exec(readFileSync('supabase/migrations/20260915110000_restore_service_summary_brand_breakdown.sql','utf8'));
const migration=readFileSync('supabase/migrations/20260915120000_resolve_service_stock_owners_and_campos_identity.sql','utf8');
await db.exec(migration);
await db.exec(migration);
const call = async sql => (await db.query('select '+sql+' as result')).rows[0].result;
const canonical='CAMPOS DEL MAÑANA S.A.';
for (const name of ['campos del manana','CAMPOS DEL MAÑANA S.A. - OTRA SEDE','CAMPOS DEL MANANA S. A. (TALLER)']) {
 assert.equal(await call("cliente_nombre_canonico('"+name+"')"),canonical);
}
assert.equal(await call("cliente_nombre_canonico('CAMPOS DEL MAÑANAL S.A.')"),'CAMPOS DEL MAÑANAL S.A.');
const machines=(await db.query('select * from ventas_servicios_maquinas_identidad()')).rows;
const machine=ch=>machines.find(m=>m.chasis_clave===ch);
assert.equal(machine('ST001').propietario,canonical);
assert.equal(machine('ST001').fuente_propietario,'stock');
assert.equal(machine('INACT').propietario,canonical); // inactive park is not a current owner
assert.equal(machine('NOOWNER').propietario,canonical);
assert.equal(machine('24491414').propietario,'Dueño'); // explicit active park owner beats stale stock
assert.equal(machine('DUP').propietario,canonical); // same legal owner: no false ambiguity
assert.equal(machine('CONFLICT').propietario,null); // genuinely different owners: never choose one
assert.equal(machine('CONFLICT').fuente_propietario,'ambiguo');
assert.equal(machine('ZERO'),undefined); assert.equal(machine('NEG'),undefined);
const h=(await db.query("select * from ventas_servicios_movimientos_enriquecidos('2026-01-01','2026-08-31')")).rows;
assert.equal(h.length,8);
assert.equal(h.reduce((sum,r)=>sum+Number(r.total_venta),0),490);
assert.equal(h.find(r=>r.os_numero==='STOCK').propietario,canonical);
assert.equal(h.find(r=>r.os_numero==='STOCK').cliente,canonical);
assert.equal(h.find(r=>r.os_numero==='STOCK').propietario_os,canonical);
assert.equal(h.find(r=>r.os_numero==='ZERO').propietario,null); // payer never substitutes owner
assert.equal(h.find(r=>r.linea_id==='H1').propietario,canonical);
assert.equal(h.find(r=>r.linea_id==='H1').propietario_os,'VALDECIR MOHR');
assert.equal(h.find(r=>r.linea_id==='AMB').os_numero,null);
const history=await call("ventas_servicios_historial('ST-001','maquina')");
assert.equal(history.clientes.nombre,canonical); assert.equal(history.modelo_tipo,'LEXION');
assert.equal(history.fuente_propietario,'stock');
assert.equal((await call("ventas_servicios_historial('ST-001','os')")).length,1);
assert.equal((await call("ventas_servicios_historial('24491414','repuestos')")).length,1);
const detail=await call("ventas_servicios_detalle_os_v2('2026-01-01','2026-08-31')");
assert.equal(detail.reduce((sum,r)=>sum+Number(r.total),0),490);
assert.equal(detail.find(r=>r.os_numero==='STOCK').propietario,canonical);
const lines=await call("ventas_servicios_lineas_v2('2026-01-01','2026-08-31')");
assert.equal(lines.filter(r=>r.cliente===canonical).reduce((s,r)=>s+Number(r.total_venta),0),30);
const panorama=await call("ventas_servicios_panorama_v2('2026-01-01','2026-08-31')");
const indicators=await call("ventas_servicios_indicadores_v1('2026-01-01','2026-08-31')");
assert.equal(panorama.resumen.total,490); assert.equal(indicators.totales.neto,490);
assert.equal(indicators.por_marca_tipo.reduce((s,r)=>s+Number(r.neto),0),490);
const searched=await call("ventas_servicios_panorama_v2('2026-01-01','2026-08-31',null,null,'mes','campos del mañana')");
assert.equal(searched.resumen.total,250); // stock owner legacy220 + stock10 + billed20
await db.exec("create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;");
await assert.rejects(()=>db.query('select * from ventas_servicios_maquinas_identidad()'),/No tenes acceso/);
await db.close();
console.log('Passed: stock-only/current ownership, inactive/empty/ambiguous park, positive balances, duplicate chassis without fan-out, canonical Campos in owner/payer/search/history, unchanged totals and idempotence.');
