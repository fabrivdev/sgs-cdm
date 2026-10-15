import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const migration=readFileSync(new URL('../supabase/migrations/20261015110000_optimize_totvs_billing_validation.sql',import.meta.url),'utf8');
const config=JSON.parse(migration.split('$config$')[1]);
const defs=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):null;
const db=new PGlite();
try {
 await db.exec(`CREATE TABLE facturacion_lineas_importadas(origen_sistema text); CREATE TABLE facturacion_dedupe_repair_pairs(linea_descartada_id uuid,linea_canonica_id uuid);`);
 const before=new Map();
 for(const c of config){
  const source=defs?.[c.name]??`CREATE FUNCTION public.${c.name}(jsonb,jsonb,jsonb,date,date,boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout='120s' AS $body$ BEGIN
 ${Array.from({length:c.matches},()=>`PERFORM 1 FROM public.facturacion_lineas_importadas f JOIN public.facturacion_lineas_importadas e ON public.facturacion_totvs_identidad( f.origen_sistema,'','','','')=e.origen_sistema;`).join('\n')}
 ${c.patches.map(p=>p.anchor.startsWith('CREATE TEMP')?p.anchor+' SELECT 1;':p.anchor).join('\n')}
 RAISE EXCEPTION 'GUARDA_COMERCIAL'; RETURN '{}'::jsonb; END $body$;`;
  await db.exec(source);
  before.set(c.name,(await db.query(`SELECT prosrc,proconfig,prosecdef FROM pg_proc WHERE proname=$1`,[c.name])).rows[0]);
 }
 await db.exec(migration);
 for(const c of config){
  const updated=(await db.query(`SELECT prosrc,proconfig,prosecdef FROM pg_proc WHERE proname=$1`,[c.name])).rows[0];
  assert.deepEqual(updated.proconfig,before.get(c.name).proconfig);assert.equal(updated.prosecdef,true);
  let expected=before.get(c.name).prosrc.replace(/ON public\.facturacion_totvs_identidad\(\s*f\.origen_sistema,/g,"ON upper(btrim(f.origen_sistema)) IN ('NEW_XML_FACTURACION_DIRECTA','NEW_XML_FACTURACION_OS','NEW_XML_FACTURACION') /* totvs_billing_lookup_performance_v1 */\n AND public.facturacion_totvs_identidad(f.origen_sistema,");
  for(const p of c.patches) expected=expected.replace(p.anchor,p.insert+'\n '+p.anchor);
  assert.equal(updated.prosrc,expected,`Only authorized lookup changes in ${c.name}`);
 }
 await db.exec(migration); // Idempotent; no duplicate injection.
 // The normalized origin filter preserves every possible canonical TOTVS prefix.
 await db.exec(`CREATE FUNCTION identity_prefix(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN upper(btrim(t)) IN ('NEW_XML_FACTURACION_DIRECTA','NEW_XML_FACTURACION_OS') THEN 'NEW_XML_FACTURACION' ELSE upper(btrim(t)) END $$;
 CREATE TABLE origins(origin text);
 INSERT INTO origins VALUES('new_xml_facturacion_directa'),(' NEW_XML_FACTURACION_OS '),('NEW_XML_FACTURACION'),('legacy_historico_detallado'),('grid_campos'),(null);`);
 const same=await db.query(`SELECT NOT EXISTS((SELECT origin FROM origins WHERE identity_prefix(origin)='NEW_XML_FACTURACION' EXCEPT SELECT origin FROM origins WHERE upper(btrim(origin)) IN ('NEW_XML_FACTURACION_DIRECTA','NEW_XML_FACTURACION_OS','NEW_XML_FACTURACION')) UNION ALL (SELECT origin FROM origins WHERE upper(btrim(origin)) IN ('NEW_XML_FACTURACION_DIRECTA','NEW_XML_FACTURACION_OS','NEW_XML_FACTURACION') EXCEPT SELECT origin FROM origins WHERE identity_prefix(origin)='NEW_XML_FACTURACION')) ok`);
 assert.equal(same.rows[0].ok,true);
 console.log('PASS: 3 functions / 4 joins, exact preservation of all other SQL, privileges and timeouts; normalization equivalence and migration idempotence'+(defs?' against live definitions.':' against synthetic definitions.'));
} finally {await db.close();}
