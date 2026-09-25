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

// Test the optimized function against the previous result and the REAL current
// Sales classifier, not just a mocked aggregate. No imported/production data.
await db.exec(`
SELECT set_config('fixture.logged_out','off',false);
UPDATE facturacion_lineas_importadas SET valor_unitario=75 WHERE id='a2';
ALTER TABLE facturacion_lineas_importadas
 ADD COLUMN factura text, ADD COLUMN codigo_interno_factura text, ADD COLUMN moneda text,
 ADD COLUMN mercaderia text, ADD COLUMN observacion text, ADD COLUMN grupo_normalizado text,
 ADD COLUMN subgrupo_original text, ADD COLUMN cod_mercaderia text, ADD COLUMN total_venta numeric,
 ADD COLUMN entidad_nombre text, ADD COLUMN sucursal text, ADD COLUMN codigo_fabricante text,
 ADD COLUMN cantidad numeric, ADD COLUMN marca_normalizada text;
UPDATE facturacion_lineas_importadas f SET factura=m.factura,moneda='USD',grupo_normalizado=m.concepto,total_venta=m.total_venta
 FROM movimientos m WHERE m.linea_id=f.id;
CREATE TABLE facturacion(id text,fecha date,cod_factura text,entidad_nombre text,sucursal text,grupo_fx text,grupo text,total_venta numeric,cantidad numeric,excluido_de_reportes boolean,moneda text);
CREATE FUNCTION extraer_chasis_venta_maquina(text,jsonb,text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
-- Old-style resolver must never be invoked for current-system dates again.
CREATE OR REPLACE FUNCTION ventas_servicios_movimientos_enriquecidos(date,date,text) RETURNS SETOF movimientos LANGUAGE plpgsql STABLE AS $$
 BEGIN
 IF $2>date '2026-06-30' THEN RAISE EXCEPTION 'Unnecessary current Sales rebuild'; END IF;
 RETURN QUERY SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2;
 END $$;
`);
const functionFrom = (file, name) => {
  const source = readFileSync(file,'utf8');
  const start = source.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start>=0, `Missing canonical function ${name}`);
  const end = source.indexOf('$$;',start);
  return source.slice(start,end+3);
};
const salesMigration='supabase/migrations/20260916180000_respect_historical_group_fx_and_commercial_others.sql';
await db.exec(functionFrom(salesMigration,'ventas_es_otro_comercial'));
await db.exec(functionFrom('supabase/migrations/20260923120000_reconcile_machine_credit_notes_and_resales.sql','valor_json_insensible'));
await db.exec(functionFrom(salesMigration,'ventas_area_movimientos_base'));
const optimized=readFileSync('supabase/migrations/20260925210000_optimize_service_order_billing.sql','utf8');
await db.exec(optimized); await db.exec(optimized);
assert.deepEqual(await call(['01-A','02-A','LEGACY','NO-RATE','EMPTY','CREDIT','COLLISION']),result);
assert.equal((await call(['01-A'],'2026-09-30'))[0].billedHours,4);
assert.deepEqual(await call([]),[]);
await db.exec(`
INSERT INTO ordenes_servicio_importadas VALUES ('CANONICAL',NULL);
INSERT INTO facturacion_lineas_importadas(id,fecha_factura,factura,raw_data,grupo_normalizado,subgrupo_original,mercaderia,cod_mercaderia,total_venta,valor_unitario,moneda)
SELECT 'C-'||i,'2026-09-01','00'||i,jsonb_build_object('linked_service_order',' canonical '),g,sg,d,c,100,50,'USD'
FROM (VALUES
 (1,'SERVICIOS',NULL,'Mano de obra','MA01'),(2,'MANO DE OBRA',NULL,NULL,NULL),
 (3,'REPUESTOS',NULL,'pieza',NULL),(4,'KILOMETRAJE',NULL,NULL,NULL),
 (5,'SERVICIOS',NULL,'TERCEROS',NULL),(6,'SERVICIOS',NULL,'COSTO DE ENVIO',NULL),
 (7,'SERVICIOS',NULL,'INTERESES',NULL),(8,'SERVICIOS',NULL,'MERCHANDISING',NULL),
 (9,'SERVICIOS',NULL,'Maquina','VEIC_TEST'),(10,'SERVICIOS',NULL,'TIPO: tractor MODELO: demo CHASIS: test',NULL),
 (11,NULL,'SERVICIOS',NULL,NULL),(12,'','SERVICIOS',NULL,NULL),
 (13,'MAQUINAS',NULL,NULL,NULL),(14,'SIN CLASIFICAR',NULL,NULL,NULL)
) fixtures(i,g,sg,d,c);
INSERT INTO facturacion_lineas_importadas(id,fecha_factura,factura,raw_data,grupo_normalizado,total_venta,valor_unitario,moneda) VALUES
 ('C-NC','2026-09-03','NC', '{"linked_service_order":"CANONICAL","Especie":"NCC"}','SERVICIOS',-50,-50,'USD'),
 ('C-GS','2026-09-03','GS', '{"linked_service_order":"CANONICAL"}','SERVICIOS',500000,50000,'GS'),
 ('C-OLD','2026-06-30','OLD', '{"linked_service_order":"CANONICAL"}','SERVICIOS',999,50,'USD'),
 ('C-LATER','2026-10-02','LATER', '{"linked_service_order":"CANONICAL"}','SERVICIOS',999,50,'USD'),
 ('C-ZERO','2026-09-30','ZERO', '{"linked_service_order":"CANONICAL","canonical_document_kind":"NotaCredito"}','SERVICIOS',0,50,'USD');
`);
const canonical=(await db.query(`SELECT concepto,sum(total_venta) AS amount FROM ventas_area_movimientos_base('2026-07-01','2026-10-01',NULL,NULL)
 WHERE upper(btrim(os_numero))='CANONICAL' AND area_calculada='servicios' AND concepto IN ('Servicio','Repuestos','Kilometraje','Terceros') GROUP BY concepto`)).rows;
const fast=(await call(['CANONICAL']))[0];
for(const [concept,field] of [['Servicio','labor'],['Repuestos','parts'],['Kilometraje','travel'],['Terceros','thirdParty']]) {
 assert.equal(fast[field],Number(canonical.find(r=>r.concepto===concept)?.amount??0),concept);
}
assert.equal(fast.total,canonical.reduce((sum,r)=>sum+Number(r.amount),0));
assert.equal(fast.billedHours,fast.labor/50);
assert.equal(fast.date,'2026-09-01'); // NCs (including zero) do not move the invoice date.
assert.equal(fast.documents.length,8);
// Unrelated ledger growth cannot require a full current-system Sales rebuild.
await db.exec(`INSERT INTO facturacion_lineas_importadas(id,fecha_factura,raw_data,total_venta,valor_unitario,moneda,grupo_normalizado)
 SELECT 'noise-'||i,'2026-09-01',jsonb_build_object('linked_service_order','OTHER-'||i),1,1,'USD','SERVICIOS' FROM generate_series(1,25000) i;
 ANALYZE facturacion_lineas_importadas;`);
assert.deepEqual((await call(['CANONICAL']))[0],fast);
const plan=(await db.query(`EXPLAIN SELECT id FROM facturacion_lineas_importadas WHERE upper(btrim(raw_data->>'linked_service_order'))=ANY(ARRAY['CANONICAL']) AND fecha_factura>='2026-07-01' AND fecha_factura<'2026-10-02'`)).rows.map(r=>r['QUERY PLAN']).join('\n');
assert.match(plan,/idx_billing_service_order_date/);
for (const section of ['servicios.ordenes','servicios.ventas']) {
 await db.query("SELECT set_config('fixture.denied_section',$1,false)",[section]);
 await assert.rejects(()=>call(['CANONICAL']),/Sin acceso/);
}
await db.close();
console.log('PASS: original and optimized billing SQL — canonical Sales equivalence, exact indexed OS lookup, no current Sales rebuild, rates/credits/cutoff, legacy links, ambiguity, idempotence and access. Synthetic ledger includes 25,000 unrelated lines.');
