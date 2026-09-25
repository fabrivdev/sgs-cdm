// Isolated, in-memory PostgreSQL. Optional argv[2]: installed PGlite module path.
// No credentials, network calls, production connection or source data.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const moduleUrl = process.argv[2] ? pathToFileURL(process.argv[2]).href : new URL('../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href;
const { PGlite } = await import(moduleUrl);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.logged_out',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2<>coalesce(current_setting('fixture.denied_section',true),'') $$;
CREATE TABLE ordenes_servicio_importadas(os_numero text PRIMARY KEY,fecha_emision_factura timestamptz);
INSERT INTO ordenes_servicio_importadas VALUES ('01-A',NULL),('02-A',NULL),('LEGACY','2026-06-30'),('NO-RATE',NULL),('EMPTY',NULL),('CREDIT',NULL),('COLLISION',NULL),(' collision ',NULL);
CREATE TABLE facturacion_lineas_importadas(id text PRIMARY KEY,fecha_factura timestamptz,raw_data jsonb,valor_unitario numeric);
CREATE TABLE movimientos(linea_id text,fecha date,factura text,os_numero text,concepto text,total_venta numeric,metodologia text,es_nota_credito boolean,vinculo_os text);
CREATE FUNCTION ventas_servicios_movimientos_enriquecidos(date,date,text) RETURNS SETOF movimientos LANGUAGE sql STABLE AS $$ SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2 $$;
INSERT INTO movimientos VALUES
 ('a1','2026-07-01','0001','01-A','Servicio',100,'actual',false,'actual'),
 ('a2','2026-09-30','0002','01-A','Servicio',150,'actual',false,'actual'),
 ('a3','2026-10-01','0003','01-A','Servicio',-50,'actual',true,'actual'),
 ('a4','2026-09-30','0002','01-A','Kilometraje',180,'actual',false,'actual'),
 ('a5','2026-09-30','0002','01-A','Repuestos',50,'actual',false,'actual'),
 ('later','2026-10-02','0004','01-A','Servicio',999,'actual',false,'actual'),
 ('branch','2026-09-30','0002','02-A','Servicio',700,'actual',false,'actual'),
 ('legacy','2026-06-30','L-1','LEGACY','Servicio',1000,'historico',false,'factura_sucursal_anio'),
 ('missing','2026-09-01','N-1','NO-RATE','Servicio',100,'actual',false,'actual'),
 ('credit','2026-09-01','NC-1','CREDIT','Servicio',-100,'actual',true,'actual'),
 ('collision','2026-09-01','C-1','COLLISION','Servicio',100,'actual',false,'actual'),
 ('unlinked','2026-09-01','0002',NULL,'Servicio',888,'actual',false,'sin_vinculo_verificable');
INSERT INTO facturacion_lineas_importadas
 SELECT linea_id,fecha,jsonb_build_object('linked_service_order',os_numero),
 CASE linea_id WHEN 'a1' THEN 50 WHEN 'a2' THEN 75 WHEN 'a3' THEN -50 WHEN 'branch' THEN 70 WHEN 'missing' THEN 0 WHEN 'credit' THEN -50 ELSE 1 END
 FROM movimientos WHERE metodologia='actual';
`);
const migration = readFileSync('supabase/migrations/20260925200000_service_order_billing_efficiency.sql','utf8');
await db.exec(migration); await db.exec(migration);
const call = async (keys, cutoff='2026-10-01') => (await db.query('SELECT service_orders_billing_v1($1::text[],$2::date) AS result',[keys,cutoff])).rows[0].result;
const result = await call(['01-A','02-A','LEGACY','NO-RATE','EMPTY','CREDIT','COLLISION']);
assert.equal(result.length,7);
const row = key => result.find(r=>r.os===key);
assert.deepEqual(row('01-A'),{os:'01-A',matched:true,ambiguous:false,documents:['0001','0002','0003'],date:'2026-09-30',labor:200,parts:50,travel:180,thirdParty:0,total:430,laborLines:3,missingRates:0,billedHours:3});
assert.equal(row('02-A').labor,700); assert.equal(row('02-A').billedHours,10);
assert.equal(row('LEGACY').labor,1000); assert.equal(row('LEGACY').billedHours,null); assert.equal(row('LEGACY').missingRates,1);
assert.equal(row('NO-RATE').total,100); assert.equal(row('NO-RATE').billedHours,null);
assert.equal(row('EMPTY').matched,false); assert.equal(row('EMPTY').total,null);
assert.equal(row('COLLISION').ambiguous,true); assert.equal(row('COLLISION').total,null);
assert.equal(row('CREDIT').labor,-100); assert.equal(row('CREDIT').billedHours,-2);
assert.equal((await call(['01-A'],'2026-09-30'))[0].billedHours,4);
assert.equal((await call(['01-A'],'2026-06-30'))[0].matched,false);
assert.equal((await call([' 01-a ']))[0].labor,200);
assert.deepEqual(await call([]),[]);
assert.equal((await call(['UNKNOWN']))[0].ambiguous,true);
// An incomplete financial rate never publishes a partial hours sum.
await db.exec("UPDATE facturacion_lineas_importadas SET valor_unitario=NULL WHERE id='a2'");
assert.equal((await call(['01-A']))[0].billedHours,null);
await db.exec("UPDATE facturacion_lineas_importadas SET valor_unitario='NaN' WHERE id='a2'");
assert.equal((await call(['01-A']))[0].missingRates,1);
await assert.rejects(()=>call(Array.from({length:251},(_,i)=>String(i))),/Parametros/);
await assert.rejects(()=>call(['']),/Parametros/);
for (const section of ['servicios.ordenes','servicios.ventas']) {
 await db.query("SELECT set_config('fixture.denied_section',$1,false)",[section]);
 await assert.rejects(()=>call(['01-A']),/Sin acceso/);
}
await db.exec("SELECT set_config('fixture.denied_section','',false); SELECT set_config('fixture.logged_out','on',false)");
await assert.rejects(()=>call(['01-A']),/Sin acceso/);
assert.equal((await db.query("SELECT has_function_privilege('anon','service_orders_billing_v1(text[],date)','EXECUTE') AS allowed")).rows[0].allowed,false);
await db.close();
console.log('PASS: service-order billing SQL — canonical values, line rates, credits, exact OS/branch, quarter boundaries, cutoff, ambiguity, incomplete rates, idempotence and access.');
