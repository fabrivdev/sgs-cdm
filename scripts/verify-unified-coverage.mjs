import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`SET TIME ZONE 'UTC';CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM('superadmin','admin','gerencia','tecnico');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT CASE WHEN current_setting('test.uid',true)='none' THEN NULL ELSE '00000000-0000-0000-0000-000000000001'::uuid END$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql AS $$SELECT $2::text=coalesce(nullif(current_setting('test.role',true),''),'admin')$$;
CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.module',true),'yes')<>'no'$$;
CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(current_setting('test.section',true),'yes')<>'no'$$;
CREATE FUNCTION public.parque_normalizar_clave(text) RETURNS text LANGUAGE sql AS $$SELECT upper(btrim(coalesce($1,'')))$$;
CREATE TABLE public.parque_maquinas(cliente_id uuid,activo boolean);
CREATE TABLE public.facturacion(cliente_id uuid,fecha date,sucursal text,total_venta numeric,moneda text,grupo_fx text,cod_factura text,excluido_de_reportes boolean);
CREATE TABLE public.facturacion_lineas_importadas(cliente_id uuid,fecha_factura timestamptz,sucursal text,total_venta numeric,moneda text,raw_data jsonb,grupo_normalizado text,subgrupo_original text,factura text,codigo_interno_factura text);
CREATE FUNCTION public.campi_cobertura_parque_actual_serie_v1(date,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;

CREATE TYPE public.subgrupo_maquina AS ENUM ('COSECHADORAS','SEMBRADORAS','PICADORAS','PLATAFORMAS','PULVERIZADORAS','TRACTORES','OTRO','PLATAFORMAS/CABEZALES','SUELO');
ALTER TABLE parque_maquinas ADD COLUMN id uuid, ADD COLUMN serie text, ADD COLUMN subgrupo public.subgrupo_maquina, ADD COLUMN subgrupo_personalizado text;
CREATE FUNCTION public.campi_cobertura_rubros_v1(date,text) RETURNS jsonb LANGUAGE sql AS $$SELECT '{}'::jsonb$$;
CREATE TABLE ordenes_servicio_importadas(os_numero text PRIMARY KEY,nro_chasis text,situacion_os text,fecha_abierta_os timestamptz,fecha_cierre_os timestamptz,trabajo_id uuid);
CREATE TABLE trabajos(id uuid PRIMARY KEY,legacy_servicio_id uuid);
CREATE TABLE servicio_jornadas(id uuid PRIMARY KEY,servicio_id uuid,fecha date,estado text);
INSERT INTO parque_maquinas(cliente_id,activo,id,serie,subgrupo) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,true,('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'C'||n,CASE WHEN n=5 THEN 'PLATAFORMAS/CABEZALES' ELSE 'TRACTORES' END::public.subgrupo_maquina FROM generate_series(1,5)n;
INSERT INTO ordenes_servicio_importadas VALUES
('closed-fallback','C1','CERRADA','2026-01-05',NULL,NULL),
('closed-dated','C2','Cerrada','2025-12-01','2026-10-04',NULL),
('open-work','C3','Abierta','2025-01-01',NULL,'20000000-0000-0000-0000-000000000001'),
('open-empty','C4','ABIERTA','2026-10-01',NULL,NULL),
('cancelled','C4','CANCELADA','2026-10-01','2026-10-05',NULL),
('platform','C5','CERRADA','2026-10-01','2026-10-05',NULL);
INSERT INTO trabajos VALUES('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001');
INSERT INTO servicio_jornadas VALUES
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-10-02','Completado'),
('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','2026-10-03','Pendiente');
INSERT INTO facturacion VALUES
('00000000-0000-0000-0000-000000000001','2026-01-02','A',100,'USD','repuestos','A',false),
('00000000-0000-0000-0000-000000000001','2026-01-03','A',-100,'USD','repuestos','NC',false),
('00000000-0000-0000-0000-000000000002','2026-01-03','A',200,'USD','servicios','S',false);
`);
await db.exec((await readFile('supabase/migrations/20261029230000_unified_park_coverage.sql','utf8')).replace(/\r\n/g,'\n'));
const run=async(from='2026-01-01',to='2026-10-29')=>(await db.query('SELECT public.parque_cobertura_unificada_v1($1::date,$2::date) v',[from,to])).rows[0].v;
await assert.rejects(run(),error=>error.code==='42883' && error.message.includes('btrim'));
console.log('REPRODUCED original SQLSTATE 42883 against real enum type.');
const aclBefore=(await db.query("SELECT proacl::text acl FROM pg_proc WHERE oid='public.parque_cobertura_unificada_v1(date,date)'::regprocedure")).rows[0].acl;
await db.exec((await readFile('supabase/migrations/20261030110000_fix_unified_coverage_subgroup_enum.sql','utf8')).replace(/\r\n/g,'\n'));
const aclAfter=(await db.query("SELECT proacl::text acl FROM pg_proc WHERE oid='public.parque_cobertura_unificada_v1(date,date)'::regprocedure")).rows[0].acl;
assert.equal(aclAfter,aclBefore);
let p=await run();assert.equal(p.owners.length,4);assert.equal(p.services.length,3);assert.deepEqual(p.services.map(r=>r[3]),['apertura_historica','cierre','jornada']);assert.equal(p.parts.reduce((n,r)=>n+r[2],0),0);assert.deepEqual(p.uncertainOwners,[]);
assert.equal((await run('2026-10-01')).services.length,2);
await db.exec(`UPDATE ordenes_servicio_importadas SET situacion_os='CERRADA',fecha_cierre_os='2026-09-01' WHERE os_numero='open-work'`);
p=await run('2026-10-01');assert.equal(p.services.length,1); // no extra completed journal after closed reference
await db.exec(`INSERT INTO ordenes_servicio_importadas VALUES ('bad-date','C4','CERRADA','2026-10-05','2026-10-01',NULL)`);
p=await run();assert.equal(p.uncertainOwners.length,1);assert(!p.services.some(r=>r[2]==='bad-date'));
await db.exec(`INSERT INTO parque_maquinas(cliente_id,activo,id,serie,subgrupo) VALUES('00000000-0000-0000-0000-000000000004',true,'10000000-0000-0000-0000-000000000006','C1','TRACTORES')`);
p=await run();assert.equal(p.uncertainOwners.length,2);assert(!p.services.some(r=>r[2]==='closed-fallback'));
for(const setting of ["SET test.uid='none'","SET test.uid='yes';SET test.role='tecnico'","SET test.role='admin';SET test.section='no'","SET test.section='yes';SET test.module='no'"]){await db.exec(setting);await assert.rejects(run(),/Sin acceso/);}
await db.exec("SET test.module='yes'");await assert.rejects(run('2026-10-30'),/Rango/);
const acl=(await db.query("SELECT has_function_privilege('anon','public.parque_cobertura_unificada_v1(date,date)','EXECUTE') a,has_function_privilege('service_role','public.parque_cobertura_unificada_v1(date,date)','EXECUTE') s,has_function_privilege('authenticated','public.parque_cobertura_unificada_v1(date,date)','EXECUTE') u")).rows[0];assert.deepEqual(acl,{a:false,s:false,u:true});
console.log('PASS SQL aislado: principal/unicos, cierre/apertura, abierta con jornada, canceladas, prioridad, fechas invalidas, identidad ambigua, NC, permisos y ACL. No producción.');await db.close();
