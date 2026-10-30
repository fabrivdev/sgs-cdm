import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
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
INSERT INTO parque_maquinas VALUES
('00000000-0000-0000-0000-000000000001',true),('00000000-0000-0000-0000-000000000001',true),
('00000000-0000-0000-0000-000000000002',null),('00000000-0000-0000-0000-000000000003',true),
('00000000-0000-0000-0000-000000000004',false),(null,true);
INSERT INTO facturacion VALUES
('00000000-0000-0000-0000-000000000001','2026-06-30','A',100,'PYG','repuesto','OLD',false),
('00000000-0000-0000-0000-000000000002','2026-07-01','A',900,'USD','servicios','REPLACED',false),
('00000000-0000-0000-0000-000000000003','2026-07-02','A',900,'USD','servicios','EXCLUDED',true);
INSERT INTO facturacion_lineas_importadas VALUES
('00000000-0000-0000-0000-000000000001','2026-07-01T00:00Z','A',100,'USD','{}','repuestos',null,'A','IA'),
('00000000-0000-0000-0000-000000000001','2026-07-01T00:00Z','A',50,'USD','{}','servicios',null,'B','IB'),
('00000000-0000-0000-0000-000000000002','2026-07-31T23:59:59Z','A',40,'USD','{}','kilometraje',null,'REPLACED','IR'),
('00000000-0000-0000-0000-000000000003','2026-07-01T00:00Z','A',-20,'USD','{}','repuestos',null,'NC','INC'),
('00000000-0000-0000-0000-000000000003','2026-07-01T00:00Z','A',null,'USD','{}',null,null,'UNKNOWN','IU'),
('00000000-0000-0000-0000-000000000001','2026-08-01T00:00Z','A',1000,'USD','{}','servicios',null,'NEXT','IN');`);
const ref=await readFile(root+'supabase/review/panorama-v2/gerencial_clientes_movimientos_posventa_v1.live-reference.sql','utf8');
await db.exec(ref);
const sql=await readFile(root+'supabase/migrations/20261029210000_campi_coverage_rubros.sql','utf8');
await db.exec(sql);
const run=async(date,mode)=>(await db.query('SELECT public.campi_cobertura_rubros_v1($1::date,$2::text) v',[date,mode])).rows[0].v;
const start=performance.now();const july=await run('2026-07-31','month');
assert.equal(july.owners.length,3);assert.equal(july.rows.length,6);
assert.deepEqual(july.rows.at(-1).nets.map(x=>x.slice(1)),[[100,50,150],[0,40,40],[-20,0,-20]]);
assert(july.rows.every(r=>r.source_mismatches===0&&r.union_conflicts===0));
const ytd=await run('2026-07-31','ytd');assert.equal(ytd.rows.length,7);
assert.deepEqual(ytd.rows.at(-1).nets[0].slice(1),[200,50,250]);
assert.equal((await run('2026-07-01','month')).rows.at(-1).nets[1][2],0);
await db.exec("SET TIME ZONE 'America/Asuncion'");
const localZone=await run('2026-07-31','month');assert.equal(localZone.rows.at(-1).source_mismatches,0);assert.equal(localZone.rows.at(-1).nets[0][2],1000);
await db.exec("SET TIME ZONE 'UTC'");
await db.exec("INSERT INTO facturacion_lineas_importadas SELECT * FROM facturacion_lineas_importadas WHERE factura='A'");
const dup=await run('2026-07-31','month');assert.equal(dup.rows.at(-1).nets.length,3);assert.equal(dup.rows.at(-1).nets[0][1],200);
await db.exec("INSERT INTO facturacion_lineas_importadas VALUES('00000000-0000-0000-0000-000000000001','2026-07-10','A',-500,'USD','{}','servicios',null,'NC2','INC2')");
assert.equal((await run('2026-07-31','month')).rows.at(-1).union_conflicts,1);
assert.equal((await run('2026-07-31','month')).rows.at(-1).source_mismatches,0);
for(const role of ['admin','gerencia','superadmin']){await db.exec(`SET test.role='${role}'`);assert.equal((await run('2026-07-31','month')).owners.length,3);}
await db.exec("SET test.role='tecnico'");await assert.rejects(run('2026-07-31','month'),/Sin acceso/);
await db.exec("SET test.role='admin';SET test.section='no'");await assert.rejects(run('2026-07-31','month'),/Sin acceso/);
await db.exec("SET test.section='yes';SET test.module='no'");await assert.rejects(run('2026-07-31','month'),/Sin acceso/);
await db.exec("SET test.module='yes';SET test.uid='none'");await assert.rejects(run('2026-07-31','month'),/Sin acceso/);
await db.exec("SET test.uid='yes'");await assert.rejects(run('2026-07-31','invalid'),/inválido/);await assert.rejects(run(null,'month'),/inválido/);
const acl=(await db.query("SELECT has_function_privilege('anon','public.campi_cobertura_rubros_v1(date,text)','EXECUTE') a,has_function_privilege('service_role','public.campi_cobertura_rubros_v1(date,text)','EXECUTE') s,has_function_privilege('authenticated','public.campi_cobertura_rubros_v1(date,text)','EXECUTE') u")).rows[0];assert.deepEqual(acl,{a:false,s:false,u:true});
await db.exec("CREATE OR REPLACE FUNCTION public.gerencial_clientes_movimientos_posventa_v1(p_desde date,p_hasta date) RETURNS TABLE(contrato text,cliente_id uuid,fecha date,sucursal text,total_venta numeric) LANGUAGE sql AS $$SELECT 'COBERTURA','00000000-0000-0000-0000-000000000001'::uuid,'2026-07-01'::date,'A',999::numeric$$");
assert((await run('2026-07-31','month')).rows.at(-1).source_mismatches>0);
await db.exec('TRUNCATE parque_maquinas');const empty=await run('2026-07-31','month');assert.deepEqual(empty.owners,[]);assert(empty.rows.every(x=>x.nets.length===0));
console.log('PASS SQL aislado: fuente canónica real en fixture, rubros, unión/NC conflictiva, fechas, sustitución legacy, nulos, propietario duplicado/inactivo, roles, ACL, divergencia de fuente y vacío. '+Math.round(performance.now()-start)+' ms para conjunto de pruebas; no medición productiva.');
await db.close();
