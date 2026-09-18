// Isolated PostgreSQL engine; never loads .env or connects to Supabase.
// node scripts/test-filtered-park-billing.mjs <PGlite module path or URL>
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.argv[2]??'@electric-sql/pglite');
const db=new PGlite();
const migration='supabase/migrations/20260918220000_optimize_filtered_park_billing.sql';
const definition=(file,name)=>readFileSync(file,'utf8').match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
try {
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE TYPE app_role AS ENUM ('admin','superadmin');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('test.allowed',true),'true')='true' $$;
 CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE clientes(id uuid PRIMARY KEY,nombre text,creado_en timestamptz);
 CREATE TABLE parque_maquinas(id uuid PRIMARY KEY,serie text,cliente_id uuid,marca text,activo boolean);
 CREATE TABLE ordenes_servicio_importadas(os_numero text,nro_chasis text,factura text,situacion_os text,fecha_abierta_os timestamptz,fecha_cierre_os timestamptz,fecha_emision_factura timestamptz);
 CREATE TABLE facturacion(id uuid PRIMARY KEY,cod_factura text,cliente_id uuid,fecha date,total_venta numeric,grupo_fx text,grupo text,marca_normalizada text,sucursal text,importado_en timestamptz,excluido_de_reportes boolean);
 CREATE TABLE facturacion_lineas_importadas(id uuid PRIMARY KEY,factura text,codigo_interno_factura text,cliente_id uuid,fecha_factura timestamptz,total_venta numeric,grupo_normalizado text,subgrupo_original text,marca_normalizada text,entidad_nombre text,sucursal text);
 INSERT INTO clientes VALUES ('00000000-0000-0000-0000-000000000001','Cliente uno','2020-01-01'),('00000000-0000-0000-0000-000000000002','Cliente dos','2021-01-01'),('00000000-0000-0000-0000-000000000003','Cliente uno','2022-01-01');
 INSERT INTO parque_maquinas VALUES ('00000000-0000-0000-0000-000000000010','CHA-001','00000000-0000-0000-0000-000000000001','CLAAS',true),('00000000-0000-0000-0000-000000000011','CHA002','00000000-0000-0000-0000-000000000002','HORSCH',true),('00000000-0000-0000-0000-000000000012','CHA003','00000000-0000-0000-0000-000000000001',NULL,true);
 INSERT INTO ordenes_servicio_importadas VALUES ('OS1','CHA001','INV1;INVAMB;INVMIX','Cerrada','2026-08-01',NULL,NULL),('OS2','CHA002','INT1;INVAMB','Cerrada','2026-08-01',NULL,NULL),('OS3','CHA003','INVMIX','Cerrada','2026-08-01',NULL,NULL);
 INSERT INTO facturacion VALUES
 ('00000000-0000-0000-0000-000000000020','OLD1','00000000-0000-0000-0000-000000000001','2025-08-01',100.25,'repuestos','REPUESTOS - CLAAS',NULL,'Santa Rita','2025-08-01',false),
 ('00000000-0000-0000-0000-000000000021','HIST','00000000-0000-0000-0000-000000000002','2026-01-01',-10.55,'mano de obra','SERVICE - HORSCH',NULL,'Santa Rita','2026-01-01',false),
 ('00000000-0000-0000-0000-000000000022','FALLBACK','00000000-0000-0000-0000-000000000001','2026-08-01',5.75,'kilometraje','SERVICE - CLAAS',NULL,'Santa Rita','2026-08-01',false),
 ('00000000-0000-0000-0000-000000000023','INV1','00000000-0000-0000-0000-000000000002','2026-08-01',999,'repuestos','REPUESTOS - HORSCH',NULL,'Santa Rita','2026-08-01',false),
 ('00000000-0000-0000-0000-000000000024','MATCH','00000000-0000-0000-0000-000000000002','2026-08-01',999,'repuestos','REPUESTOS - HORSCH',NULL,'Santa Rita','2026-08-01',false),
 ('00000000-0000-0000-0000-000000000025','EXCLUDED','00000000-0000-0000-0000-000000000001','2026-01-01',999,'repuestos',NULL,NULL,NULL,'2026-01-01',true);
 INSERT INTO facturacion_lineas_importadas VALUES
 ('00000000-0000-0000-0000-000000000030','INV1','INT1',NULL,'2026-08-01',125.55,'repuestos',NULL,'HORSCH','Cliente dos','Santa Rita'),
 ('00000000-0000-0000-0000-000000000031','UNKNOWN','INT1',NULL,'2026-08-01',10.25,'kilometraje',NULL,'CLAAS','Cliente uno','Santa Rita'),
 ('00000000-0000-0000-0000-000000000032','INVAMB',NULL,NULL,'2026-08-01',-2.45,'repuestos',NULL,'HORSCH','Cliente uno','Santa Rita'),
 ('00000000-0000-0000-0000-000000000033','MATCH',NULL,NULL,'2026-08-01',7.35,'mano de obra',NULL,'HORSCH','Cliente uno','Santa Rita'),
 ('00000000-0000-0000-0000-000000000034','NAME',NULL,NULL,'2026-08-01',3.15,'repuestos',NULL,'CLAAS','  CLIENTE UNO  ','Santa Rita'),
 ('00000000-0000-0000-0000-000000000035','INVMIX','INT1',NULL,'2026-08-01',4.75,'repuestos',NULL,'CLAAS','Cliente dos','Santa Rita'),
 ('00000000-0000-0000-0000-000000000036','OTHER',NULL,NULL,'2026-08-01',999,'otros',NULL,'CLAAS','Cliente uno','Santa Rita'),
 ('00000000-0000-0000-0000-000000000037','NOBODY',NULL,NULL,'2026-08-01',999,'repuestos',NULL,NULL,'Unknown','Santa Rita');
 `);
 await db.exec(definition('supabase/migrations/20260803120000_attribute_park_consumption_by_os_chassis.sql','parque_normalizar_clave'));
 const original=definition('supabase/migrations/20260812173000_optimize_park_billing_range.sql','parque_facturacion_atribuida_rango');
 await db.exec(original);
 await db.exec(original.replace('public.parque_facturacion_atribuida_rango(','public.parque_facturacion_atribuida_rango_baseline('));
 await db.exec(definition('supabase/migrations/20260812190000_limit_park_os_activity_by_range.sql','parque_actividad_os_chasis_rango'));
 for(const name of ['parque_facturacion_legacy_fallback_rango','parque_resumen_facturacion_filtros'])await db.exec(definition('supabase/migrations/20260820100000_harden_audit_and_recover_legacy_billing.sql',name));
 const rows=async()=> (await db.query(`SELECT * FROM parque_facturacion_atribuida_rango('2025-01-01','2026-12-31') ORDER BY cliente_id,fecha,total_venta,marca NULLS LAST`)).rows;
 const run=async(marca,rubro)=> (await db.query(`SELECT * FROM parque_resumen_facturacion_filtros('2026-01-01','2026-12-31','2025-01-01','2025-12-31',$1,$2) ORDER BY cliente_id`,[marca,rubro])).rows;
 const beforeRows=await rows();const before=new Map();
 const brands=['ALL','CLAAS','HORSCH','AMBAS','OTROS'];const rubros=['ALL','REPUESTOS','SERVICIOS','KM','REPUESTO','MANO DE OBRA','KILOMETRAJE','INVALID'];
 for(const brand of brands)for(const rubro of rubros)before.set(`${brand}/${rubro}`,await run(brand,rubro));
 await db.exec(readFileSync(migration,'utf8'));
 assert.deepEqual(await rows(),beforeRows,'line-level amounts/owner/brand must not change');
 for(const brand of brands)for(const rubro of rubros)assert.deepEqual(await run(brand,rubro),before.get(`${brand}/${rubro}`),`${brand}/${rubro}`);
 const claas=await run('CLAAS','REPUESTOS');assert.equal(Number(claas[0].fact_actual),133.45);assert.equal(Number(claas[0].fact_prev),100.25);
 assert.equal(claas[0].tiene_srv_rango,true,'OS activity must survive monetary rubro filter');
 await db.exec(readFileSync(migration,'utf8'));assert.deepEqual(await rows(),beforeRows,'idempotent');
 await db.exec(`SET test.uid='00000000-0000-0000-0000-000000000099';SET test.allowed='false'`);
 assert.deepEqual(await run('ALL','REPUESTOS'),[],'unauthorized session');
 await db.exec(`SET test.allowed='true'`);assert.deepEqual(await run('ALL','REPUESTOS'),before.get('ALL/REPUESTOS'));
 console.log('40 filter combinations match baseline; line identity/priority, NC, exclusions, fallback, coverage, authorization and idempotence verified.');
 await db.exec(`
 INSERT INTO ordenes_servicio_importadas SELECT 'BENCH'||i,'CHA001','BENCH'||i,'Cerrada','2026-08-01',NULL,NULL FROM generate_series(1,800) i;
 INSERT INTO facturacion_lineas_importadas SELECT md5('bench'||i)::uuid,'BENCH'||i,NULL,NULL,'2026-08-01',i/100.0,'repuestos',NULL,'CLAAS','Cliente dos','Santa Rita' FROM generate_series(1,800) i;
 ANALYZE;
 `);
 const bench=async fn=>{const start=performance.now();const res=await db.query(`SELECT count(*) n,sum(total_venta) importe FROM ${fn}('2025-01-01','2026-12-31')`);return{ms:Math.round(performance.now()-start),rows:res.rows};};
 const old=await bench('parque_facturacion_atribuida_rango_baseline');const optimized=await bench('parque_facturacion_atribuida_rango');
 assert.deepEqual(optimized.rows,old.rows,'larger fixture remains financially identical');
 console.log(JSON.stringify({fixtureLines:808,baselineMs:old.ms,optimizedMs:optimized.ms}));
}finally{await db.close();}
