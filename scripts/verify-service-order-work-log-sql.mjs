// Isolated PostgreSQL fixtures. No credentials, network, business records or remote SQL.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.logout',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.deny',true),'')<>'on' AND $2='servicios.ordenes' $$;
CREATE TABLE ordenes_servicio_importadas (
  os_numero text PRIMARY KEY, trabajo_id uuid, cliente_nombre text, nro_chasis text, marca text,
  problema text, factura text, situacion_os text, tipo_tiempo text, servicios_cantidad numeric,
  servicios_valor numeric, repuesto_valor numeric, km_cantidad numeric, kilometro_valor numeric,
  fecha_abierta_os timestamptz, fecha_cierre_os timestamptz, raw_data jsonb DEFAULT '{}'
);
CREATE TABLE comisiones_jornadas (
  id uuid DEFAULT gen_random_uuid(), os_numero text, fecha_inicio date, hora_inicio time,
  fecha_fin date, hora_fin time, tecnico_nombre text DEFAULT 'DEMO', tecnico_profile_id uuid,
  sucursal text DEFAULT 'Santa Rita', tipo_tiempo text DEFAULT 'Cliente',
  estado_validacion text DEFAULT 'VALIDA', raw_data jsonb DEFAULT '{}', vigente boolean DEFAULT true
);
INSERT INTO ordenes_servicio_importadas(os_numero,fecha_abierta_os,fecha_cierre_os,servicios_cantidad) VALUES
 ('01-00000001','2025-01-01','2026-10-01',20),('02-00000001','2026-09-01',NULL,3),
 ('MISSING','2026-09-01',NULL,9),('OLD','2026-01-01','2026-08-31',10),
 ('UNKNOWN','2026-01-01',NULL,1),('MIDNIGHT','2026-01-01',NULL,4),('INACTIVE','2026-01-01',NULL,4);
INSERT INTO comisiones_jornadas(os_numero,fecha_inicio,hora_inicio,fecha_fin,hora_fin) VALUES
 ('01-00000001','2026-08-10','08:00','2026-08-10','18:00'),
 ('01-00000001','2026-09-10','08:00','2026-09-10','18:00'),
 ('02-00000001','2026-09-10','08:00','2026-09-10','11:00'),
 ('OLD','2026-08-10','08:00','2026-08-10','18:00'),
 ('UNKNOWN',NULL,'08:00',NULL,'09:00'),
 ('MIDNIGHT','2026-08-31','22:00','2026-08-31','02:00'),
 ('INACTIVE','2026-09-10','08:00','2026-09-10','12:00');
UPDATE comisiones_jornadas SET vigente=false WHERE os_numero='INACTIVE';
`);
const migration = readFileSync('supabase/migrations/20260925230000_service_order_work_log.sql','utf8');
await db.exec(migration); await db.exec(migration);
const call = async (os = null, from = '2026-09-01', to = '2026-09-30') => (await db.query('SELECT * FROM service_orders_work_log_v1($1::date,$2::date,$3::text)', [from, to, os])).rows;
const rows = await call();
assert.deepEqual(rows.map(row=>row.os), ['01-00000001','02-00000001','MIDNIGHT','MISSING','UNKNOWN']);
assert.equal(rows[0].entries.length,2); // full OS history retained for dated clipping, not date-of-closure hours
assert.equal(rows.find(row=>row.os==='MISSING').entries.length,0);
assert.equal((await call('OLD'))[0].entries[0].fecha_inicio,'2026-08-10'); // drawer independent of page range
assert.deepEqual(await call('DOES-NOT-EXIST'),[]);
assert.equal(rows[0].order_data.os_numero,'01-00000001');
assert.equal(rows[1].order_data.os_numero,'02-00000001');
assert.equal(Object.hasOwn(rows[0].entries[0],'horas_pagadas'),false);
await assert.rejects(()=>call(null,'2026-10-01','2026-09-30'),/invalido/);
await assert.rejects(()=>call(' '),/invalido/);
await db.exec("SELECT set_config('fixture.deny','on',false)");
await assert.rejects(()=>call(),/Sin acceso/);
await db.exec("SELECT set_config('fixture.deny','off',false); SELECT set_config('fixture.logout','on',false)");
await assert.rejects(()=>call(),/Sin acceso/);
assert.equal((await db.query("SELECT has_function_privilege('anon','service_orders_work_log_v1(date,date,text)','EXECUTE') AS allowed")).rows[0].allowed,false);
assert.equal((await db.query("SELECT has_function_privilege('authenticated','service_orders_work_log_v1(date,date,text)','EXECUTE') AS allowed")).rows[0].allowed,true);
await db.exec("SELECT set_config('fixture.logout','off',false); SET ROLE authenticated");
assert.equal((await call()).length,5);
await db.exec('RESET ROLE');
assert.equal((await db.query('SELECT count(*)::int AS n FROM comisiones_jornadas')).rows[0].n,7);
console.log('PASS: work dates, outside-lifecycle orders, midnight, missing detail, full drawer, identity, idempotency, permissions and no writes.');
await db.close();
