const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
const {PGlite}=require(repo+'/node_modules/@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(repo,'supabase/migrations',p),'utf8');
const uid='11111111-1111-4111-8111-111111111111';
function row(i=1,extra={}) {return {clave_origen:`01|2026-07-01T00:00:00|1|1|${i}|1`,huella_origen:JSON.stringify(['original',i]),sucursal:'01',anio_mes:'202607',fecha_fuente:'2026-07-01T00:00:00',fecha_movimiento:'2026-07-01',lote:'1',sublote:'1',documento:String(i),linea:'1',importe_pyg:100,importe_usd:2.5,historial:'MOV',cuenta_codigo:'11111001',cuenta_descripcion:'Cuenta',centro_costo:'10',centro_costo_descripcion:'Centro',origen:'ORI',tipo_movimiento:'1',tipo_saldo:'9',es_apertura:false,archivo_origen:'synthetic.xml',fila_origen:i+1,datos_fuente:{},...extra};}
async function scenario(optimized){
 const db=new PGlite();let checks=0;
 await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM('gerencia'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${uid}'::uuid $$; CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$; CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;`);
 for(const f of ['20261006130000_import_totvs_mayor_staging.sql','20261014120000_version_totvs_mayor_snapshots.sql'])await db.exec(fs.readFileSync(repo+'/supabase/migrations/'+f,'utf8').replace(/\r\n/g,'\n'));
 const meta=async()=> (await db.query("SELECT oid,proowner,proacl,proconfig,prosecdef,provolatile,md5(prosrc) hash FROM pg_proc WHERE oid='public.totvs_importar_mayor_lote_v1(uuid,text,jsonb)'::regprocedure")).rows[0];
 const before=await meta();
 const beforeDefinition=(await db.query("SELECT pg_get_functiondef('public.totvs_importar_mayor_lote_v1(uuid,text,jsonb)'::regprocedure) definition")).rows[0].definition;
 assert.equal(before.hash,'d03ed4b29f9c5304d3e91b7ec1703ee5');
 if(optimized){await db.exec(read('20261023130000_optimize_totvs_mayor_batch_lookups.sql')); await db.exec(read('20261023130000_optimize_totvs_mayor_batch_lookups.sql'));const after=await meta();assert.equal(after.hash,'48bf0443eccd2a37f1c71104292f45f3');assert.deepEqual({...after,hash:before.hash},before); await db.exec(beforeDefinition);assert.deepEqual(await meta(),before);await db.exec(read('20261023130000_optimize_totvs_mayor_batch_lookups.sql'));checks+=3;}
 const start=async(n)=>(await db.query('SELECT public.totvs_iniciar_mayor_carga_v1($1::jsonb) id',[JSON.stringify({archivo_nombre:'synthetic.xml',archivo_sha256:String(n).repeat(64),archivo_tamano:1000})])).rows[0].id;
 const batch=async(id,rows,mode='validate')=>(await db.query('SELECT public.totvs_importar_mayor_lote_v1($1::uuid,$2,$3::jsonb) r',[id,mode,JSON.stringify(rows)])).rows[0].r;
 const state=async()=> (await db.query("SELECT (SELECT count(*) FROM totvs_mayor_movimientos) movements,(SELECT count(*) FROM totvs_mayor_carga_movimientos) links,(SELECT count(*) FROM totvs_mayor_cuarentena) quarantine")).rows[0];
 const results=[];const a=await start(1); const original=Array.from({length:500},(_,i)=>row(i+1));
 const empty=await state();results.push(await batch(a,original));assert.deepEqual(await state(),empty);checks++;
 results.push(await batch(a,original,'import'));results.push(await batch(a,original,'import'));assert.equal((await state()).links,500);checks++;
 // Synthetic fixture finalization: only in this disposable in-memory database.
 await db.query("UPDATE totvs_mayor_cargas SET estado='COMPLETA',completado_en=now() WHERE id=$1",[a]);
 const b=await start(2);let changes=[row(1,{huella_origen:'descriptive',cuenta_descripcion:'Nueva'}),row(2,{huella_origen:'accounting',importe_pyg:200}),row(3),row(501)];
 results.push(await batch(b,changes));results.push(await batch(b,changes,'import'));results.push(await batch(b,[row(1,{huella_origen:'conflict'})]));
 for(const [rows,mode] of [[[], 'validate'],[Array.from({length:501},(_,i)=>row(i+1)),'validate'],[[row(),row()],'validate'],[[row(5,{clave_origen:'invalid'})],'validate'],[[row()],'bad']]) {try{await batch(b,rows,mode);throw Error('Expected rejection')}catch(e){assert.ok(['22023','23505'].includes(e.code));results.push(e.code);checks++;}}
 try{await batch(a,[row()]);throw Error('Expected closed rejection')}catch(e){assert.equal(e.code,'22023');checks++;}
 // Conflict import must reject atomically, quarantine behavior must remain identical.
 const preConflict=await state();try{await batch(b,[row(1,{huella_origen:'conflict'})],'import');throw Error('Expected conflict')}catch(e){assert.equal(e.code,'23505');}assert.deepEqual(await state(),preConflict);checks++;
 results.push(await batch(b,[row(600,{cuenta_codigo:''})],'import'));assert.equal((await state()).quarantine,1);checks++;
 await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '22222222-2222-4222-8222-222222222222'::uuid $$;`);
 try{await batch(b,[row()]);throw Error('Expected owner rejection')}catch(e){assert.equal(e.code,'22023');checks++;}
 await db.exec(`CREATE OR REPLACE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;`);
 try{await batch(b,[row()]);throw Error('Expected permission rejection')}catch(e){assert.equal(e.code,'42501');checks++;}
 await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${uid}'::uuid $$; CREATE OR REPLACE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;`);
 // Model a hash collision in a rolled-back fixture; do not rely on a real MD5 pair.
 const beforeCollision=await state();await db.exec('BEGIN; ALTER TABLE totvs_mayor_movimientos ALTER COLUMN huella_md5 DROP EXPRESSION');
 await db.query('UPDATE totvs_mayor_movimientos SET huella_md5=md5($1) WHERE clave_origen=$2',['synthetic-collision',row(3).clave_origen]);
 const collisionLoad=await start(4);const collisionRow=row(3,{huella_origen:'synthetic-collision'});const collisionResult=await batch(collisionLoad,[collisionRow]);assert.equal(collisionResult.conflictos,1);results.push(collisionResult);
 try{await batch(collisionLoad,[collisionRow],'import');throw Error('Expected collision rejection')}catch(e){assert.equal(e.code,'23505');}await db.exec('ROLLBACK');assert.deepEqual(await state(),beforeCollision);checks++;
 const final=await state();
 // Optional production-order volume, synthetic rows only. No real data copied.
 if(process.argv.includes('--scale40k')) {
 const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='totvs_mayor_movimientos' AND is_generated='NEVER' ORDER BY ordinal_position")).rows.map(r=>r.column_name);
 await db.query(`INSERT INTO totvs_mayor_movimientos(${columns.join(',')}) SELECT ${columns.map(c=>'r.'+c).join(',')} FROM (SELECT to_jsonb(m) j FROM totvs_mayor_movimientos m LIMIT 1) template CROSS JOIN generate_series(1000,40999) g CROSS JOIN LATERAL jsonb_populate_record(NULL::totvs_mayor_movimientos,template.j || jsonb_build_object('id',gen_random_uuid(),'clave_origen','synthetic-'||g,'huella_origen','synthetic-'||g)) r`);
 await db.query('INSERT INTO totvs_mayor_carga_movimientos SELECT $1::uuid,id FROM totvs_mayor_movimientos ON CONFLICT DO NOTHING',[a]);
 }
 // Historical fan-out fixture: 15 superseded snapshots sharing the original rows.
 await db.query(`INSERT INTO totvs_mayor_cargas(id,archivo_nombre,archivo_sha256,archivo_tamano,creado_por,estado) SELECT gen_random_uuid(),'history.xml',repeat('a',64),1000,$1::uuid,'SUPERADA' FROM generate_series(1,15)`,[uid]);
 await db.query(`INSERT INTO totvs_mayor_carga_movimientos(carga_id,movimiento_id) SELECT c.id,cm.movimiento_id FROM totvs_mayor_cargas c CROSS JOIN totvs_mayor_carga_movimientos cm WHERE c.estado='SUPERADA' AND cm.carga_id=$1`,[a]);
 await db.exec('ANALYZE');const perf=await start(3);const t=performance.now();const perfResult=await batch(perf,original);const syntheticValidateMs=Math.round(performance.now()-t);results.push(perfResult);
 if(optimized){const def=(await db.query("SELECT pg_get_functiondef('public.totvs_importar_mayor_lote_v1(uuid,text,jsonb)'::regprocedure) definition")).rows[0].definition;await db.exec(def.replace('mayor_lookup_performance_v1','unexpected_version'));try{await db.exec(read('20261023130000_optimize_totvs_mayor_batch_lookups.sql'));throw Error('Expected drift rejection')}catch(e){assert.equal(e.code,'P0001');await db.exec('ROLLBACK');checks++;}}
 await db.close();return {results,final,checks,syntheticValidateMs};
}
(async()=>{const a=await scenario(false),b=await scenario(true);assert.deepEqual(b.results,a.results);assert.deepEqual(b.final,a.final);const output={status:'PASS',differentialCalls:a.results.length,baselineChecks:a.checks,optimizedChecks:b.checks,final:a.final,syntheticValidateMs:{baseline:a.syntheticValidateMs,optimized:b.syntheticValidateMs},scope:'Two disposable in-memory PGlite databases; no network or production RPC. Single-run timings are exploratory, not production guarantees.'};console.log(JSON.stringify(output,null,2));})().catch(e=>{console.error({message:e.message,code:e.code});process.exitCode=1});
