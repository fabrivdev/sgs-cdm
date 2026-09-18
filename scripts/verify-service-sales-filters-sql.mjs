// Local PostgreSQL fixture only. No production connection or commercial exports.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.logged_out',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('fixture.denied',true),'')<>'on' $$;
CREATE FUNCTION ventas_tipo_tiempo_normalizado(text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($1,'No informado') $$;
CREATE FUNCTION ventas_servicios_texto_normalizado(text) RETURNS text LANGUAGE sql AS $$ SELECT upper(regexp_replace(translate(coalesce($1,''),'áéíóúÁÉÍÓÚñÑ','aeiouAEIOUnN'),'[^a-zA-Z0-9]+',' ','g')) $$;
CREATE TABLE ordenes_servicio_importadas(os_numero text PRIMARY KEY,tipo_tiempo text,servicios_cantidad numeric,km_cantidad numeric,raw_data jsonb);
INSERT INTO ordenes_servicio_importadas VALUES
 ('OS1','Garantia',4,76,'{"PRODUCTO":"MA01","productos_agregados":["KM01"]}'),
 ('OS2','Cliente',5,0,'{}');
CREATE TABLE comisiones_jornadas(os_numero text,tecnico_profile_id uuid,tecnico_nombre text,tipo_tiempo text,tipo_tiempo_importado text,horas_validas numeric,horas_calculadas numeric,horas_reportadas numeric,vigente boolean,estado_validacion text);
INSERT INTO comisiones_jornadas VALUES
 ('OS1',null,'Técnico A','Garantia','Cliente',3,null,null,true,'VALIDA'),
 ('OS1',null,'Técnico B','Garantia','Cliente',1,null,null,true,'VALIDA'),
 ('OS1',null,'Inválido','Garantia','Cliente',9,null,null,true,'INVALIDA'),
 ('OS2',null,'Técnico A','Cliente','Cliente',5,null,null,true,'VALIDA');
CREATE TABLE movimientos(linea_id text,fecha date,factura text,os_numero text,cliente text,sucursal text,tipo_tiempo text,concepto text,total_venta numeric,cantidad numeric,propietario text,marca_parque text,tipo_maquina text,propietario_os text,cliente_os text,nro_chasis text,descripcion text,texto_busqueda text,es_nota_credito boolean,vinculo_os text,codigo text,metodologia text);
CREATE FUNCTION ventas_servicios_movimientos_enriquecidos(date,date,text) RETURNS SETOF movimientos LANGUAGE sql STABLE AS $$ SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2 AND ($3 IS NULL OR sucursal=$3) $$;
INSERT INTO movimientos(linea_id,fecha,factura,os_numero,cliente,sucursal,tipo_tiempo,concepto,total_venta,cantidad,propietario,marca_parque,tipo_maquina,propietario_os,cliente_os,nro_chasis,descripcion,texto_busqueda,es_nota_credito,vinculo_os,codigo,metodologia)
 SELECT id,'2026-08-15',factura,os,cliente,'Santa Rita',tipo,concepto,importe,1,dueno,'HORSCH','SEMBRADORAS','Dueño histórico',cliente,chasis,descripcion,upper(cliente||' '||descripcion),nc,'actual',codigo,origen
 FROM (VALUES
 ('mo','00001','OS1','Pagador A','Dueño distinto','Garantia','Servicio',100,'CH-1','Trabajo A',false,'MA01','actual'),
 ('km','00001','OS1','Pagador A','Dueño distinto','Garantia','Kilometraje',20,'CH-1','Kilometraje A',false,'KM01','actual'),
 ('rep','00001','OS1','Pagador A','Dueño distinto','Garantia','Repuestos',50,'CH-1','Pieza A',false,'REPIN01','actual'),
 ('nc','00002','OS1','Pagador A','Dueño distinto','Garantia','Servicio',-10,'CH-1','Trabajo A devolución',true,'MA01','actual'),
 ('otro','00003','OS2','Pagador B','Campos','Cliente','Servicio',200,'CH-2','Trabajo B',false,'MA02','actual'),
 ('legacy','00004',null,'Cliente histórico',null,'Cliente','Servicio',80,null,'Trabajo histórico',false,null,'historico')
 ) v(id,factura,os,cliente,dueno,tipo,concepto,importe,chasis,descripcion,nc,codigo,origen);
`);
const loadFunction = async (file, name) => {
  const sql=readFileSync(file,'utf8');
  const start=sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.ok(start>=0,name);
  const end=sql.indexOf('$$;',start)+3;
  assert.ok(end>start,name);
  await db.exec(sql.slice(start,end));
};
const identity='supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql';
await loadFunction(identity,'ventas_servicios_panorama_v2');
await loadFunction(identity,'ventas_servicios_tecnicos_v1');
await loadFunction('supabase/migrations/20260915110000_restore_service_summary_brand_breakdown.sql','ventas_servicios_indicadores_v1');
await db.exec(readFileSync('supabase/migrations/20260917170000_service_invoice_line_product_code.sql','utf8'));
const names=['ventas_servicios_panorama_v2','ventas_servicios_indicadores_v1','ventas_servicios_tecnicos_v1','ventas_servicios_lineas_v2'];
const call=async(name, filters, extra='') => (await db.query(`SELECT ${name}('2026-08-01','2026-08-31'${filters === undefined ? '' : `,p_filtros=>'${JSON.stringify(filters).replaceAll("'","''")}'::jsonb`}${extra}) AS result`)).rows[0].result;
const originals=await Promise.all(names.map(name=>call(name)));
const migration=readFileSync('supabase/migrations/20260917180000_service_sales_shared_filters.sql','utf8');
await db.exec(migration); await db.exec(migration);
for(const [index,name] of names.entries()) {
  assert.deepEqual(await call(name),originals[index]);
  assert.deepEqual(await call(`${name}_filtrado`,{}),originals[index]);
}
const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row[key]??0),0);
const filters=[
 [{cliente:'pagador a'},160], [{propietario:'dueño distinto'},160], [{cliente:'Dueño distinto'},0],
 [{factura:'00001'},170], [{os:'os1'},160], [{chasis:'ch-1'},160], [{descripcion:'pieza a'},50],
 [{codigo:'REPIN01'},50], [{codigo:'MA01'},90], [{codigo:'KM01'},20],
 [{componente:'Servicio'},370], [{origen:'historico'},80], [{documento:'nc'},-10],
 [{vinculo:'sin_os'},80], [{vinculo:'con_os'},360], [{cliente:'Pagador A',documento:'factura',componente:'Servicio'},100],
 [{cliente:'no existe'},0], [{cliente:"' OR 1=1 --"},0],
];
for(const [filter,total] of filters) {
  const lines=await call('ventas_servicios_lineas_v2_filtrado',filter);
  const panorama=await call('ventas_servicios_panorama_v2_filtrado',filter);
  const indicators=await call('ventas_servicios_indicadores_v1_filtrado',filter);
  const technicians=await call('ventas_servicios_tecnicos_v1_filtrado',filter);
  assert.equal(sum(lines,'total_venta'),total,JSON.stringify(filter));
  assert.equal(panorama.resumen.total,total);
  assert.equal(indicators.totales.neto,total);
  for(const group of ['por_tipo','por_marca_tipo','por_maquina']) assert.equal(sum(indicators[group],'neto'),total);
  assert.equal(sum(technicians,'mo_total'),sum(lines.filter(row=>row.componente==='Mano de obra'),'total_venta'));
}
await db.exec("UPDATE movimientos SET codigo='GENERICO' WHERE linea_id='mo'");
assert.equal(sum(await call('ventas_servicios_lineas_v2_filtrado',{codigo:'MA01'}),'total_venta'),90);
await db.exec(`UPDATE ordenes_servicio_importadas SET raw_data='{"PRODUCTO":"MA01","productos_agregados":["MA02","KM01"]}' WHERE os_numero='OS1'`);
assert.equal(sum(await call('ventas_servicios_lineas_v2_filtrado',{codigo:'MA01'}),'total_venta'),-10); // Specific NC wins; ambiguous OS is not guessed.
assert.equal(sum(await call('ventas_servicios_lineas_v2_filtrado',{codigo:'GENERICO'}),'total_venta'),100);
assert.equal(sum(await call('ventas_servicios_lineas_v2_filtrado',{codigo:'REPIN01'}),'total_venta'),50); // No OS REP fallback.
await db.exec(`UPDATE movimientos SET codigo='MA01' WHERE linea_id='mo'; UPDATE ordenes_servicio_importadas SET raw_data='{"PRODUCTO":"MA01","productos_agregados":["KM01"]}' WHERE os_numero='OS1'`);
const techs=await call('ventas_servicios_tecnicos_v1_filtrado',{os:'OS1',componente:'Servicio'});
assert.equal(techs.find(t=>t.tecnico==='Técnico A').mo_garantia,67.5);
assert.equal(techs.find(t=>t.tecnico==='Técnico B').mo_garantia,22.5);
assert.equal(techs.find(t=>t.tecnico==='Técnico A').mo_cliente,0); // Manual type, not imported fallback.
assert.ok(!techs.find(t=>t.tecnico==='Inválido'));
const lines=await call('ventas_servicios_lineas_v2_filtrado',{os:'OS1'});
assert.equal(lines.find(row=>row.id==='mo').cantidad_os,4);
assert.equal(lines.find(row=>row.id==='mo').codigo,'MA01');
assert.equal(lines.find(row=>row.id==='km').cantidad_os,76);
assert.equal(lines.find(row=>row.id==='rep').codigo,'REPIN01');
assert.deepEqual(await call('ventas_servicios_lineas_v2_filtrado',{},",p_sucursal=>'Katuete'"),[]);
assert.deepEqual(await call('ventas_servicios_lineas_v2_filtrado',{},",p_tipo_tiempo=>'Interno'"),[]);
for(const bad of [{random:'x'},{cliente:123},{documento:'invalid'}]) await assert.rejects(call('ventas_servicios_lineas_v2_filtrado',bad),/inválid/);
for(const name of names) {
  await db.exec("SET fixture.denied='on'"); await assert.rejects(call(`${name}_filtrado`,{}),/No tenes acceso/);
  await db.exec("SET fixture.denied='off'; SET fixture.logged_out='on'"); await assert.rejects(call(`${name}_filtrado`,{}),/No tenes acceso/);
  await db.exec("SET fixture.logged_out='off'");
}
const grants=await db.query(`SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND has_function_privilege('authenticated',p.oid,'EXECUTE')) AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ventas_servicios_%_filtrado'`);
assert.equal(grants.rows[0].ok,true);
// Unknown installed body fails rather than guessing an injection or altering originals.
await db.exec(`CREATE OR REPLACE FUNCTION ventas_servicios_lineas_v2(p_desde date,p_hasta date,p_sucursal text DEFAULT NULL,p_tipo_tiempo text DEFAULT NULL,p_marca text DEFAULT NULL,p_tipo_maquina text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$ SELECT '[]'::jsonb $$`);
await assert.rejects(db.exec(migration),/Definición sin autorización/);
await db.close();
console.log('PASS: filters reconcile across all reports, original contracts unchanged, quantities/codes, manual time, weighted MO, NC, authorization, invalid inputs and idempotence.');
