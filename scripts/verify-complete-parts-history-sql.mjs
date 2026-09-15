// PostgreSQL aislado: no usa credenciales ni accede a producción.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const previous = readFileSync('scripts/verify-parts-sales-sql.mjs','utf8');
await db.exec(previous.split('await db.exec(`')[1].split('`);')[0]);
await db.exec(`
create type app_role as enum ('admin'); create type marca as enum ('CLAAS','HORSCH','OTROS');
create type tipo_facturacion as enum ('Repuesto');
create function has_role(uuid,app_role) returns boolean language sql as $$select true$$;
create function normalizar_codigo_repuesto_flexible(text) returns text language sql immutable as $$select upper(regexp_replace($1,'[^A-Za-z0-9]','','g'))$$;
create table facturacion_lineas_importadas(id uuid primary key default gen_random_uuid(),origen_sistema text,
  codigo_interno_factura text,factura text,entidad_nombre text,fecha_factura timestamptz,
  subgrupo_original text,grupo_normalizado text,marca_normalizada marca,tipo_facturacion tipo_facturacion,
  tipo_tiempo text,observacion text,cod_mercaderia text,codigo_fabricante text,mercaderia text,
  cantidad numeric,valor_unitario numeric,total_venta numeric,moneda text,raw_data jsonb,
  linea_hash text,actualizado_en timestamptz,unique(origen_sistema,linea_hash));
create table productos(codigo_interno text primary key,codigo_fabricante text,descripcion text);
create table repuestos_ventas_vinculacion(linea_id uuid primary key,estado_vinculo text,producto_codigo text);
create table repuestos_conversiones_unidad_historica(id int primary key,activa boolean,codigo_legacy_norm text,
  fecha_desde date,fecha_hasta_exclusiva date,precio_unitario_min numeric,precio_unitario_max numeric,factor_cantidad numeric);
create table repuestos_facturacion_historica_cargas(id uuid primary key,activo boolean,estado text,
  filas_archivo int default 0,filas_recibidas int default 0,completado_en timestamptz,publicacion_estado text,publicado_en timestamptz);
insert into repuestos_facturacion_historica_cargas values ('00000000-0000-0000-0000-000000000010',true,'COMPLETADO',2,2,now(),'COMPLETADO',now());
insert into productos values ('REP1','FAB1','Rodamiento');
`);
const foundation=readFileSync('supabase/migrations/20260604100000_prepare_billing_migration_foundation.sql','utf8');
const hashStart=foundation.indexOf('CREATE OR REPLACE FUNCTION public.set_facturacion_linea_hash()');
const hashEnd=foundation.indexOf('EXECUTE FUNCTION public.set_facturacion_linea_hash();',hashStart)+ 'EXECUTE FUNCTION public.set_facturacion_linea_hash();'.length;
await db.exec(foundation.slice(hashStart,hashEnd));
const loaders=readFileSync('supabase/migrations/20260817140000_close_anon_bypass_repuestos_profiles_roles.sql','utf8');
const loaderStart=loaders.indexOf('CREATE OR REPLACE FUNCTION public.repuestos_importar_facturacion_historica_lote(');
const loaderEnd=loaders.indexOf('CREATE OR REPLACE FUNCTION public.repuestos_finalizar_facturacion_historica(',loaderStart);
await db.exec(loaders.slice(loaderStart,loaderEnd));
const migration=readFileSync('supabase/migrations/20260915160000_use_complete_parts_history_and_credit_notes.sql','utf8');
await db.exec(migration); await db.exec(migration);
await db.exec(`insert into facturacion_lineas_importadas(origen_sistema,fecha_factura,factura,entidad_nombre,cod_mercaderia,
  mercaderia,cantidad,total_venta,moneda,observacion,raw_data) values
 ('legacy_historico_detallado','2026-06-30','H1','Cliente B','OLD1','Rodamiento histórico',2,60,'USD','HISTORICO_LEGACY:2|2026-06-30|H1|OLD1','{"linea_clave":"2|2026-06-30|H1|OLD1","movimiento":"S","sucursal_original":"KATUETE"}'),
 ('legacy_historico_detallado','2026-06-30','H1','Cliente B','OLD1','Rodamiento histórico',2,60,'USD','HISTORICO_LEGACY:3|2026-06-30|H1|OLD1','{"linea_clave":"3|2026-06-30|H1|OLD1","movimiento":"S","sucursal_original":"KATUETE"}'),
 ('legacy_historico_detallado','2026-06-15','H2','Cliente B','NO_LINK','Pieza sin vínculo',1,10,'USD','HISTORICO_LEGACY:4','{"linea_clave":"4","movimiento":"S","sucursal_original":"CENTRAL"}'),
 ('legacy_historico_detallado','2025-08-31','LY','Cliente B','NO_LINK','Pieza sin vínculo',1,10,'USD','HISTORICO_LEGACY:5','{"linea_clave":"5","movimiento":"S","sucursal_original":"KATUETE"}'),
 ('legacy_historico_detallado','2026-06-15','GS','Cliente B','NO_LINK','Guaraníes',1,100000,'PYG','HISTORICO_LEGACY:6','{}'),
 ('grid_campos','2026-06-30','H1','Cliente B','OLD1','Otro origen duplicado',2,60,'USD','GRID','{}');
 insert into repuestos_ventas_vinculacion select id,'CONFIRMADA','REP1' from facturacion_lineas_importadas where cod_mercaderia='OLD1' and origen_sistema='legacy_historico_detallado';
 insert into repuestos_conversiones_unidad_historica values(1,true,'NOLINK',null,null,null,null,2);
`);
const call=async(name,args)=>(await db.query(`select ${name}(${args}) as result`)).rows[0].result;
let detail=await call('ventas_repuestos_listado_v1',"'2026-06-01','2026-08-31',null,null,'detalle'");
assert.equal(detail.total_periodo,375); // 130 detallado + 40 julio + 205 agosto, no histórico agrupado ni GRID.
assert.equal(detail.filas.filter(r=>r.factura==='H1').length,2); // Repeticiones genuinas retenidas.
assert.ok(detail.filas.some(r=>r.codigo==='NO_LINK'&&r.descripcion==='Pieza sin vínculo'&&r.cantidad===2));
assert.ok(detail.filas.some(r=>r.factura==='H1'&&r.codigo==='REP1'&&r.codigo_fabricante==='FAB1'));
let products=await call('ventas_repuestos_listado_v1',"'2026-06-01','2026-08-31',null,null,'repuestos'");
assert.equal(products.filas.filter(r=>r.codigo==='REP1').length,1); // Un producto canónico entre sistemas.
const anchors=[{linea_clave:'2|2026-06-30|H1|OLD1',total_venta:60},{linea_clave:'3|2026-06-30|H1|OLD1',total_venta:60}];
const note={linea_clave:'7|2026-06-30|NC1|OLD1',fecha:'2026-06-30',documento:'NC1',codigo_legacy:'OLD1',descripcion:'Rodamiento devuelto',entidad:'Cliente B',grupo:'REPUESTOS CLAAS',sucursal:'KATUETE',movimiento:'E',cantidad:-1,total_venta:-30,valor_unitario:30};
const complement=(row=note,refs=anchors)=>call('repuestos_completar_notas_credito_historicas',`'00000000-0000-0000-0000-000000000010','${JSON.stringify([row])}'::jsonb,'${JSON.stringify(refs)}'::jsonb`);
assert.equal((await complement()).insertadas,1);
assert.equal((await complement()).insertadas,0);
await assert.rejects(complement({...note,movimiento:'S',cantidad:1,total_venta:30}),/solo admite/);
await assert.rejects(complement({...note,total_venta:-31}),/difiere/);
await assert.rejects(complement(note,[{linea_clave:'WRONG',total_venta:60},anchors[1]]),/no coincide/);
await assert.rejects(call('repuestos_verificar_notas_credito_historicas',"'00000000-0000-0000-0000-000000000010',ARRAY['MISSING']"),/sin cargar/);
assert.equal((await call('repuestos_verificar_notas_credito_historicas',`'00000000-0000-0000-0000-000000000010',ARRAY['${note.linea_clave}']`)).verificadas,1);
assert.equal((await call('ventas_repuestos_estado_historico_v1','')).notas_credito_verificadas,true);
const report=await call('ventas_repuestos_panorama_v1',"'2026-06-01','2026-08-31'");
assert.equal(report.resumen.facturado,345);
assert.equal(report.resumen.notas_credito,-55);
assert.equal(report.resumen.unidades_netas,10);
assert.equal(report.por_sucursal.reduce((s,r)=>s+r.facturado,0),345);
for(const view of ['clientes','repuestos','detalle']) {
 const list=await call('ventas_repuestos_listado_v1',`'2026-06-01','2026-08-31',null,null,'${view}'`);
 assert.equal(list.total_periodo,345);
 assert.equal(list.filas.reduce((s,r)=>s+r.facturado,0),345);
}
const search=await call('ventas_repuestos_listado_v1',"'2026-06-01','2026-06-30',null,'OLD1','detalle'");
assert.equal(search.total_periodo,90); // Buscar también el código legacy de una pieza canónica.
await db.exec(`insert into repuestos_facturacion_historica_cargas(id,activo,estado) values('00000000-0000-0000-0000-000000000011',false,'PROCESANDO');`);
const initial=await call('repuestos_importar_facturacion_historica_lote',`'00000000-0000-0000-0000-000000000011','${JSON.stringify([{...note,linea_clave:'8|2026-06-30|NC2|OLD1',documento:'NC2'}])}'::jsonb`);
assert.equal(initial.insertadas,1); // El cargador inicial real ahora admite E.
await db.exec(`create or replace function has_role(uuid,app_role) returns boolean language sql as $$select false$$;`);
await assert.rejects(complement(),/administrador/);
await db.exec(`create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;`);
await assert.rejects(call('ventas_repuestos_listado_v1',"'2026-06-01','2026-08-31'"),/acceso/);
await db.close();
console.log('OK: histórico completo, S/E, vínculos opcionales, unidades, fuentes sin duplicar, complemento idempotente, permisos y conciliación de las 4 vistas.');
