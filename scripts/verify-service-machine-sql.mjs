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
await db.exec(readFileSync('supabase/migrations/20260911180000_service_machine_dimensions.sql','utf8'));
const call = async sql => (await db.query('select '+sql+' as result')).rows[0].result;
const detail = await call("ventas_servicios_detalle_os_v2('2026-08-01','2026-08-31')");
assert.equal(detail.length,1); assert.equal(detail[0].propietario,'Dueño'); assert.equal(detail[0].total,100);
const lines = await call("ventas_servicios_lineas_v2('2026-08-01','2026-08-31')");
assert.equal(lines[0].cliente,'Facturado'); assert.equal(lines[0].propietario,'Dueño'); assert.equal(lines[0].marca,'HORSCH'); assert.equal(lines[0].tipo_maquina,'SEMBRADORAS');
const panorama = await call("ventas_servicios_panorama_v2('2026-08-01','2026-08-31')");
assert.equal(panorama.resumen.total,100);
assert.equal((await call("ventas_servicios_lineas_v2('2026-08-01','2026-08-31',null,null,'CLAAS')")).length,0);
assert.equal((await call("ventas_servicios_historial('24491414','os')")).length,2);
assert.equal((await call("ventas_servicios_historial('24491414','maquina')")).clientes.nombre,'Dueño');
assert.equal((await call("ventas_servicios_historial('24491414','repuestos')"))[0].codigo_fabricante,'FAB1');
assert.ok((await call("ventas_servicios_dimensiones()")).length > 0);
await db.exec("insert into parque_maquinas select * from parque_maquinas;");
const ambiguous = await call("ventas_servicios_detalle_os_v2('2026-08-01','2026-08-31')");
assert.equal(ambiguous[0].total,100); // Never multiply sales on ambiguous chassis.
assert.equal(ambiguous[0].propietario,'Propietario no informado');
await db.exec("create or replace function has_section_access(uuid,text) returns boolean language sql as $$select false$$;");
await assert.rejects(()=>call("ventas_servicios_historial('24491414','os')"),/No tenes acceso/);
await db.close();
console.log('SQL passed: owner vs billed, enum fields, totals, brand filter, historical OS, individual parts, authorization.');
