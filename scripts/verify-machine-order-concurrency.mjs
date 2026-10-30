// Prepared, NOT executed: requires an existing disposable local PostgreSQL DB.
// No production URL, no role creation, no server installation, no real data.
import postgres from 'postgres';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const target = process.env.CANCEL_TEST_DATABASE_URL;
if (!target || process.env.CANCEL_TEST_DISPOSABLE !== 'yes') {
  throw new Error('Requires CANCEL_TEST_DATABASE_URL and CANCEL_TEST_DISPOSABLE=yes for an EMPTY disposable local database.');
}
const url = new URL(target);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || !/^\/campi_cancel_test_[a-z0-9_]+$/.test(url.pathname)) {
  throw new Error('Only local databases named campi_cancel_test_* are accepted.');
}
const clients = Array.from({length:3},()=>postgres(target,{max:1,connect_timeout:3,onnotice:()=>{}}));
const [a,b,observer] = clients;
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const call=`select public.maquinaria_anular_pedido('${id(1)}') r`;
const fixture = readFileSync(new URL('./verify-machine-order-cancellation.mjs',import.meta.url),'utf8');
const schema = fixture.match(/await db\.exec\(`([\s\S]*?)`\);/)?.[1];
const seed = fixture.match(/async function seed\(\)\{await db\.exec\(`([\s\S]*?)`\);\}/)?.[1];
assert.ok(schema && seed,'Fixture extraction must fail closed if source changes');
const seedSql=seed.replace(/\$\{id\((\d+)\)\}/g,(_,n)=>id(Number(n))).replaceAll('SET LOCAL','SET');
const tables=['maquinaria_operaciones','maquinaria_operacion_lineas','maquinaria_unidades_operacion','maquinaria_documentos','maquinaria_facturas_venta_unidades','maquinaria_importacion_lineas','maquinaria_importacion_unidades','parque_stock_maquinas','parque_maquinas','facturacion_lineas_importadas'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function reset(){
  await a.unsafe(`TRUNCATE ${tables.map(t=>'public.'+t).join(',')} CASCADE`);
  await a.unsafe(seedSql);
}
async function rollback(){await Promise.all(clients.map(c=>c.unsafe('ROLLBACK').catch(()=>{})));}
async function run(name,fn){await rollback();await reset();try{await fn();console.log('PASS',name);}finally{await rollback();}}
async function row(c,sql){return (await c.unsafe(sql))[0];}
async function awaitLock(pid){
  for(let i=0;i<100;i++){
    if((await row(observer,`select wait_event_type from pg_stat_activity where pid=${pid}`))?.wait_event_type==='Lock')return;
    await sleep(20);
  }
  throw new Error('Expected lock wait was not observed');
}
try {
  const empty=await row(a,"select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p','v','m','f','S')) objects, exists(select 1 from pg_namespace where nspname='auth') auth_exists");
  assert.equal(Number(empty.objects),0,'Database must be empty');assert.equal(empty.auth_exists,false);
  const roles=await a.unsafe("select rolname from pg_roles where rolname in ('anon','authenticated','service_role')");
  assert.equal(roles.length,3,'Existing fixture roles required; this script does not create cluster roles');
  const functions=await row(a,"select count(*) n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'");
  assert.equal(Number(functions.n),0,'No existing public functions allowed');
  for(const c of clients)await c.unsafe("SET statement_timeout='8s'; SET lock_timeout='5s'");
  await a.unsafe(schema.replace(/CREATE ROLE (anon|authenticated|service_role);/g,''));
  // Synthetic attribution, not a test of the production chassis parser.
  await a.unsafe(`ALTER TABLE facturacion_lineas_importadas ADD COLUMN unidad_test uuid;
    CREATE OR REPLACE FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM facturacion_lineas_importadas WHERE unidad_test=$1) $$;`);
  await a.unsafe(readFileSync(new URL('../supabase/migrations/20261027140000_cancel_machine_orders_preserving_history.sql',import.meta.url),'utf8'));
  const pidB=(await row(b,'select pg_backend_pid() pid')).pid;
  await run('double cancellation rejects contention; later call is idempotent',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(call);
    const second=b.unsafe(call).then(x=>({x}),error=>({error}));
    assert.equal((await second).error?.code,'55P03');await a.unsafe('COMMIT');
    assert.equal((await row(b,call)).r.ya_anulado,true);
  });
  await run('unrelated stock writer is blocked by current broad locks (known defect)',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(call);
    const writer=b.unsafe(`UPDATE parque_stock_maquinas SET saldo_actual=saldo_actual WHERE id='${id(42)}'`).then(()=>true,error=>({error}));
    await awaitLock(pidB);await a.unsafe('ROLLBACK');assert.equal(await writer,true);
  });
  await run('sale committed first blocks cancellation and preserves reservations',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(`INSERT INTO facturacion_lineas_importadas VALUES('${id(81)}','${id(21)}')`);
    const cancel=b.unsafe(call).then(()=>({unexpected:true}),error=>({error}));
    assert.equal((await cancel).error?.code,'55P03');await a.unsafe('COMMIT');
    await assert.rejects(()=>b.unsafe(call),/factura|entrega/);
    assert.equal((await row(observer,`select unidad_operacion_id from parque_stock_maquinas where id='${id(41)}'`)).unidad_operacion_id,id(21));
  });
  await run('assignment into canceled order is rejected after waiting',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(call);
    const assignment=b.unsafe(`UPDATE parque_stock_maquinas SET unidad_operacion_id='${id(21)}' WHERE id='${id(41)}'`).then(()=>({unexpected:true}),error=>({error}));
    await awaitLock(pidB);await a.unsafe('COMMIT');
    assert.match((await assignment).error?.message||'',/anulado/);
  });
  await run('rollback releases waiters and preserves original reservation',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(call);
    const writer=b.unsafe(`UPDATE parque_stock_maquinas SET saldo_actual=saldo_actual WHERE id='${id(41)}'`).then(()=>true,error=>({error}));
    await awaitLock(pidB);await a.unsafe('ROLLBACK');assert.equal(await writer,true);
    assert.equal((await row(observer,`select unidad_operacion_id from parque_stock_maquinas where id='${id(41)}'`)).unidad_operacion_id,id(21));
  });
  await run('existing unit-first assignment causes immediate safe rejection',async()=>{
    await a.unsafe('BEGIN');await a.unsafe(`SELECT id FROM maquinaria_unidades_operacion WHERE id='${id(21)}' FOR UPDATE`);
    await b.unsafe('BEGIN');
    await assert.rejects(()=>b.unsafe(call),error=>error.code==='55P03');
    await b.unsafe('ROLLBACK');
    await a.unsafe(`UPDATE parque_stock_maquinas SET unidad_operacion_id='${id(21)}' WHERE id='${id(41)}'`);
    await a.unsafe('ROLLBACK');
    assert.equal((await row(observer,`select estado from maquinaria_operaciones where id='${id(1)}'`)).estado,'DISPONIBLE');
    assert.equal((await row(observer,`select unidad_operacion_id from parque_stock_maquinas where id='${id(41)}'`)).unidad_operacion_id,id(21));
  });
  console.log('Completed local lock probes only. Full import routes, real RLS, chassis parser and deadlock recovery still require separate tests. Synthetic fixtures retained in disposable DB.');
} finally {await rollback();await Promise.all(clients.map(c=>c.end({timeout:2})));}
