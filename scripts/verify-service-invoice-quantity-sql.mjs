// Isolated PostgreSQL fixture: never connects to production or changes imports.
import {PGlite} from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
 SELECT CASE WHEN current_setting('fixture.logged_out',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.denied',true),'')<>'on' $$;
CREATE FUNCTION ventas_tipo_tiempo_normalizado(text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($1,'No informado') $$;
CREATE TABLE ordenes_servicio_importadas(os_numero text PRIMARY KEY,servicios_cantidad numeric,km_cantidad numeric,raw_data jsonb);
INSERT INTO ordenes_servicio_importadas VALUES
 ('OS-A',8,76,'{"totales_por_tecnico":{"a":{"horas":8},"b":{"horas":8},"c":{"horas":8}}}'),
 ('OS-C',4,20,'{}'),(' os-c ',99,999,'{}'),('OS-ZERO',0,0,'{}'),('OS-NULL',NULL,NULL,'{}');
CREATE TABLE movimientos(linea_id text,fecha date,factura text,os_numero text,cliente text,sucursal text,
 tipo_tiempo text,concepto text,total_venta numeric,cantidad numeric,propietario text,marca_parque text,
 tipo_maquina text,propietario_os text,cliente_os text,nro_chasis text,descripcion text,texto_busqueda text,
 es_nota_credito boolean,vinculo_os text,codigo text);
CREATE FUNCTION ventas_servicios_movimientos_enriquecidos(date,date,text) RETURNS SETOF movimientos LANGUAGE sql STABLE AS $$
 SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2 AND ($3 IS NULL OR sucursal=$3) $$;
INSERT INTO movimientos(linea_id,fecha,factura,os_numero,cliente,sucursal,tipo_tiempo,concepto,total_venta,cantidad,
 propietario,marca_parque,tipo_maquina,propietario_os,cliente_os,nro_chasis,descripcion,texto_busqueda,es_nota_credito,vinculo_os)
 SELECT id,'2026-08-15',CASE WHEN id='nc' THEN 'NC-1' ELSE 'FACTURA-1' END,os,'Cliente','Santa Rita','Cliente',concepto,importe,cantidad,
 'Dueño','HORSCH','SEMBRADORAS','Dueño histórico','Cliente OS','CH1','Descripción','CLIENTE',id='nc','actual'
 FROM (VALUES
 ('mo','OS-A','Servicio',560,1),('repeat','OS-A','Servicio',140,1),('km','OS-A','Kilometraje',78,1),
 ('part','OS-A','Repuestos',300,3),('third','OS-A','Terceros',200,2),('legacy',NULL,'Servicio',70,2),
 ('nc','OS-A','Servicio',-100,-1),('collision','OS-C','Servicio',50,1),('zero','OS-ZERO','Servicio',0,1),
 ('unknown','OS-NULL','Servicio',10,1),('trim',' os-a ','Servicio',20,1)
 ) v(id,os,concepto,importe,cantidad);
`);
// Compare the exact previous RPC contract, not a separate inferred total.
const previous=readFileSync('supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql','utf8');
const start=previous.indexOf('create or replace function public.ventas_servicios_lineas_v2(');
const end=previous.indexOf('create or replace function public.ventas_servicios_indicadores_v1(',start);
assert.ok(start>=0&&end>start);
await db.exec(previous.slice(start,end));
const call=async(args="'2026-08-01','2026-08-31'")=>(await db.query(`SELECT ventas_servicios_lineas_v2(${args}) AS result`)).rows[0].result;
const before=await call();
const migration=readFileSync('supabase/migrations/20260917160000_service_invoice_line_operational_quantity.sql','utf8');
await db.exec(migration); await db.exec(migration);
const after=await call();
assert.equal(after.length,before.length);
for(const row of after){
 const {cantidad_os,unidad_cantidad,...unchanged}=row;
 assert.deepEqual(unchanged,before.find(r=>r.id===row.id));
}
const get=id=>after.find(r=>r.id===id);
assert.equal(get('mo').cantidad,1); assert.equal(get('mo').cantidad_os,8); assert.equal(get('mo').unidad_cantidad,'h');
assert.equal(get('repeat').cantidad_os,8); assert.equal(get('trim').cantidad_os,8);
assert.equal(get('km').cantidad_os,76); assert.equal(get('km').unidad_cantidad,'km');
assert.equal(get('part').cantidad,3); assert.equal(get('part').cantidad_os,null);
assert.equal(get('third').cantidad,2); assert.equal(get('third').cantidad_os,null);
assert.equal(get('legacy').cantidad_os,null); assert.equal(get('legacy').cantidad,2);
assert.equal(get('collision').cantidad_os,null); assert.equal(get('unknown').cantidad_os,null);
assert.equal(get('zero').cantidad_os,0);
assert.equal(get('nc').cantidad_os,8); assert.equal(get('nc').total_venta,-100); assert.equal(get('nc').cantidad,-1);
assert.deepEqual(await call("'2026-09-01','2026-09-30'"),[]);
assert.deepEqual(await call("'2026-08-01','2026-08-31','Katuete'"),[]);
assert.deepEqual(await call("'2026-08-01','2026-08-31',NULL,'Garantia'"),[]);
assert.deepEqual(await call("'2026-08-01','2026-08-31',NULL,NULL,'CLAAS'"),[]);
assert.equal((await call("'2026-08-01','2026-08-31',NULL,NULL,'HORSCH','SEMBRADORAS'")).length,11);
// Product-code metadata is additive: the full quantity/financial contract stays
// identical, including legitimate repeated financial lines and credit notes.
await db.exec(`UPDATE ordenes_servicio_importadas SET raw_data=raw_data ||
 '{"CODIGO":"-------","PRODUCTO":"REP-OTHER","productos_agregados":["MA01","MA01","KM01","SERVICIO TERCERIZADO"],"extra":"ignored"}'::jsonb WHERE os_numero='OS-A';
 UPDATE movimientos SET codigo=CASE linea_id WHEN 'part' THEN 'REPIN004178' WHEN 'third' THEN 'SE' ELSE '-------' END;
 UPDATE ordenes_servicio_importadas SET raw_data='{"PRODUCTO":"MA01"}' WHERE os_numero='OS-C';`);
const beforeCode=await call();
const codeMigration=readFileSync('supabase/migrations/20260917170000_service_invoice_line_product_code.sql','utf8');
await db.exec(codeMigration); await db.exec(codeMigration);
const withCodes=await call();
assert.equal(withCodes.length,beforeCode.length);
for(const row of withCodes){
 const {codigo,...unchanged}=row;
 assert.deepEqual(unchanged,beforeCode.find(r=>r.id===row.id));
}
const code=id=>withCodes.find(r=>r.id===id).codigo;
assert.equal(code('mo'),'MA01'); assert.equal(code('repeat'),'MA01'); assert.equal(code('nc'),'MA01');
assert.equal(code('trim'),'MA01'); assert.equal(code('km'),'KM01');
assert.equal(code('part'),'REPIN004178'); assert.equal(code('third'),'SE');
assert.equal(code('legacy'),null); assert.equal(code('collision'),null); assert.equal(code('unknown'),null);
await db.exec(`UPDATE ordenes_servicio_importadas SET raw_data=jsonb_set(raw_data,'{productos_agregados}','["MA01","MA02","KM01","SE01"]') WHERE os_numero='OS-A';
 UPDATE movimientos SET codigo='MA02' WHERE linea_id='repeat';`);
const mixed=await call();
assert.equal(mixed.find(r=>r.id==='mo').codigo,null); // ambiguous OS codes are not guessed
assert.equal(mixed.find(r=>r.id==='repeat').codigo,'MA02'); // exact invoice code wins
assert.equal(mixed.find(r=>r.id==='third').codigo,'SE');
assert.equal(mixed.find(r=>r.id==='km').codigo,'KM01'); // no borrowing another component
await db.exec(`UPDATE ordenes_servicio_importadas SET raw_data='{"PRODUCTO":"MA03","productos_agregados":{"bad":"MA01"}}' WHERE os_numero='OS-A';
 UPDATE movimientos SET codigo=CASE WHEN linea_id='legacy' THEN 'LEGACY-7' WHEN linea_id='part' THEN 'REPIN004178' ELSE '-------' END;`);
const malformed=await call();
assert.equal(malformed.find(r=>r.id==='mo').codigo,'MA03');
assert.equal(malformed.find(r=>r.id==='legacy').codigo,'LEGACY-7');
assert.equal(malformed.find(r=>r.id==='part').codigo,'REPIN004178');
assert.equal(malformed.find(r=>r.id==='km').codigo,null);
assert.deepEqual(await call("'2026-08-01','2026-08-31','Katuete'"),[]);
assert.deepEqual(await call("'2026-08-01','2026-08-31',NULL,'Garantia'"),[]);
assert.deepEqual(await call("'2026-08-01','2026-08-31',NULL,NULL,'CLAAS'"),[]);
await assert.rejects(call("'2026-08-31','2026-08-01'"),/Rango de fechas invalido/);
await db.exec("SET fixture.denied='on'");
await assert.rejects(call(),/No tenes acceso/);
await db.exec("SET fixture.denied='off'; SET fixture.logged_out='on'");
await assert.rejects(call(),/No tenes acceso/);
await db.close();
console.log('PASS: real invoice/OS product codes, operational quantities, unchanged financial contract, collisions, filters, authorization and idempotence.');
