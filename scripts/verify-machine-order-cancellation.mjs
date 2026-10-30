import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000099'::uuid $$;
CREATE FUNCTION public.maquinaria_puede_gestionar_flujo() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allow',true),'yes')='yes' $$;
CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.section',true),'yes')='yes' $$;
CREATE FUNCTION public.normalizar_chasis_notificacion(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(upper(btrim($1)),'') $$;
CREATE TABLE maquinaria_operaciones(id uuid PRIMARY KEY,np_numero text,estado text,actualizado_en timestamptz);
CREATE TABLE maquinaria_operacion_lineas(id uuid PRIMARY KEY,operacion_id uuid REFERENCES maquinaria_operaciones,datos_extraidos jsonb default '{}');
CREATE TABLE maquinaria_unidades_operacion(id uuid PRIMARY KEY,linea_id uuid REFERENCES maquinaria_operacion_lineas,chasis text,estado text,parque_maquina_id uuid,actualizado_en timestamptz);
CREATE TABLE maquinaria_documentos(id uuid PRIMARY KEY,operacion_id uuid REFERENCES maquinaria_operaciones,tipo text,storage_path text);
CREATE TABLE maquinaria_facturas_venta_unidades(unidad_operacion_id uuid);
CREATE TABLE maquinaria_importacion_lineas(id uuid PRIMARY KEY,operacion_id uuid,linea_id uuid,unidad_id uuid,situacion_vinculo text,factura_venta text,venta_facturada text,actualizado_en timestamptz);
CREATE TABLE maquinaria_importacion_unidades(id uuid PRIMARY KEY,operacion_id uuid,linea_id uuid,unidad_id uuid,situacion_vinculo text,vinculo_manual boolean,actualizado_en timestamptz);
CREATE TABLE parque_stock_maquinas(id uuid PRIMARY KEY,unidad_operacion_id uuid,saldo_actual numeric,chasis text);
CREATE TABLE parque_maquinas(id uuid PRIMARY KEY);
CREATE TABLE facturacion_lineas_importadas(id uuid PRIMARY KEY);
CREATE FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.sale',true),'no')='yes' $$;`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261027140000_cancel_machine_orders_preserving_history.sql',import.meta.url),'utf8'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const call=()=>db.query('select maquinaria_anular_pedido($1) r',[id(1)]);
let checks=0;
async function scenario(name,run){await db.exec('BEGIN');try{await seed();await run();checks++;console.log('PASS',name);}finally{await db.exec('ROLLBACK');}}
async function seed(){await db.exec(`SET LOCAL test.allow='yes';SET LOCAL test.section='yes';SET LOCAL test.sale='no';
INSERT INTO maquinaria_operaciones VALUES('${id(1)}','TEST-NP','DISPONIBLE',now(),NULL),('${id(2)}','OTHER-NP','DISPONIBLE',now(),NULL);
INSERT INTO maquinaria_operacion_lineas VALUES('${id(11)}','${id(1)}','{}'),('${id(12)}','${id(2)}','{}');
INSERT INTO maquinaria_unidades_operacion VALUES('${id(21)}','${id(11)}','CHASIS-A','DISPONIBLE',NULL,now()),('${id(22)}','${id(12)}','CHASIS-B','DISPONIBLE',NULL,now());
INSERT INTO maquinaria_documentos VALUES('${id(31)}','${id(1)}','NP','files/np.pdf');
INSERT INTO parque_stock_maquinas VALUES('${id(41)}','${id(21)}',1,'CHASIS-A'),('${id(42)}','${id(22)}',1,'CHASIS-B');
INSERT INTO maquinaria_importacion_lineas VALUES('${id(51)}','${id(1)}','${id(11)}','${id(21)}','PEDIDO VINCULADO',NULL,NULL,now());
INSERT INTO maquinaria_importacion_unidades VALUES('${id(61)}','${id(1)}','${id(11)}','${id(21)}','PEDIDO VINCULADO',true,now()),('${id(62)}','${id(2)}','${id(12)}','${id(22)}','PEDIDO VINCULADO',true,now());`);}
async function rejection(action,pattern){await db.exec('SAVEPOINT rejected');await assert.rejects(action,pattern);await db.exec('ROLLBACK TO SAVEPOINT rejected');}
await scenario('pending: preserves records/files, releases only own reservations, audit and idempotency',async()=>{
 assert.equal((await call()).rows[0].r.anulado,true);
 const row=(await db.query('select * from maquinaria_operaciones where id=$1',[id(1)])).rows[0];
 assert.equal(row.estado,'CANCELADA');assert.equal(row.anulacion.por,id(99));assert.ok(row.anulacion.en);assert.equal(row.anulacion.unidades[0].chasis,'CHASIS-A');
 assert.equal((await db.query('select storage_path from maquinaria_documentos')).rows[0].storage_path,'files/np.pdf');
 const stock=(await db.query('select * from parque_stock_maquinas order by id')).rows;assert.equal(stock[0].unidad_operacion_id,null);assert.equal(Number(stock[0].saldo_actual),1);assert.equal(stock[1].unidad_operacion_id,id(22));
 assert.equal((await db.query('select count(*)::int n from maquinaria_unidades_operacion')).rows[0].n,2);
 assert.equal((await db.query('select unidad_id from maquinaria_importacion_unidades where id=$1',[id(62)])).rows[0].unidad_id,id(22));
 assert.equal((await call()).rows[0].r.ya_anulado,true);
 assert.deepEqual((await db.query('select anulacion from maquinaria_operaciones where id=$1',[id(1)])).rows[0].anulacion,row.anulacion);
 await rejection(()=>db.exec(`UPDATE maquinaria_operaciones SET estado='DISPONIBLE' WHERE id='${id(1)}'`),/anulado/);
 await rejection(()=>db.exec(`INSERT INTO maquinaria_operaciones(id,np_numero,estado) VALUES('${id(3)}','TEST-NP','DISPONIBLE')`),/anulada/);
 await rejection(()=>db.exec(`UPDATE parque_stock_maquinas SET unidad_operacion_id='${id(21)}' WHERE id='${id(41)}'`),/anulado/);
 await rejection(()=>db.exec(`DELETE FROM maquinaria_documentos WHERE id='${id(31)}'`),/anulado/);
 await rejection(()=>db.exec(`UPDATE maquinaria_documentos SET operacion_id='${id(2)}' WHERE id='${id(31)}'`),/anulado/);
 await rejection(()=>db.exec(`UPDATE maquinaria_operacion_lineas SET operacion_id='${id(2)}' WHERE id='${id(11)}'`),/anulado/);
 await rejection(()=>db.exec(`UPDATE maquinaria_unidades_operacion SET linea_id='${id(12)}' WHERE id='${id(21)}'`),/anulado/);
 await rejection(()=>db.exec(`UPDATE maquinaria_importacion_unidades SET operacion_id='${id(1)}',unidad_id='${id(22)}' WHERE id='${id(62)}'`),/anulado/);
 await rejection(()=>db.exec(`INSERT INTO maquinaria_facturas_venta_unidades VALUES('${id(21)}')`),/anulado/);
 await rejection(()=>db.exec(`DELETE FROM maquinaria_operaciones WHERE id='${id(1)}'`),/anulado/);
 assert.equal((await db.query("select count(*)::int n from maquinaria_operaciones where estado<>'CANCELADA'")).rows[0].n,1);
});
await scenario('already canceled remains untouched, without invented audit',async()=>{await db.exec(`UPDATE maquinaria_operaciones SET estado='CANCELADA' WHERE id='${id(1)}'`);assert.equal((await call()).rows[0].r.ya_anulado,true);assert.equal((await db.query('select anulacion from maquinaria_operaciones where id=$1',[id(1)])).rows[0].anulacion,null);});
for(const setting of ['allow','section'])await scenario(`reject permission ${setting}`,async()=>{await db.exec(`SET LOCAL test.${setting}='no'`);await rejection(call,/administración/);});
for(const [name,sql] of [
 ['invoice',`UPDATE maquinaria_documentos SET tipo='FACTURA_VENTA'`],
 ['delivery',`UPDATE maquinaria_unidades_operacion SET estado='EN_PARQUE' WHERE id='${id(21)}'`],
 ['confirmed sale',`SET LOCAL test.sale='yes'`],
 ['invoice link',`INSERT INTO maquinaria_facturas_venta_unidades VALUES('${id(21)}')`],
 ['historical invoice',`UPDATE maquinaria_operacion_lineas SET datos_extraidos='{"historico_pedido":{"factura_numero":"F1"}}' WHERE id='${id(11)}'`],
 ['import invoice',`UPDATE maquinaria_importacion_lineas SET factura_venta='F1'`],
])await scenario(`blocks ${name}`,async()=>{await db.exec(sql);await rejection(call,/factura|entrega/);assert.equal((await db.query('select unidad_operacion_id from parque_stock_maquinas where id=$1',[id(41)])).rows[0].unidad_operacion_id,id(21));});
await scenario('contradictory shared reservation blocks atomically',async()=>{await db.exec(`UPDATE maquinaria_importacion_unidades SET operacion_id='${id(2)}' WHERE id='${id(61)}'`);await rejection(call,/contradictorias/);});
await scenario('late failure rolls back all releases',async()=>{
 await db.exec(`CREATE FUNCTION pg_temp.fail_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced rollback'; END $$; CREATE TRIGGER test_late_failure BEFORE UPDATE ON maquinaria_operaciones FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_cancel();`);
 await rejection(call,/forced rollback/);assert.equal((await db.query('select unidad_operacion_id from parque_stock_maquinas where id=$1',[id(41)])).rows[0].unidad_operacion_id,id(21));
});
for(const code of ['55P03','40P01'])await scenario(`contention ${code}: friendly rejection and full rollback`,async()=>{
 await db.exec(`CREATE FUNCTION pg_temp.fail_contention() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic contention' USING ERRCODE='${code}'; END $$; CREATE TRIGGER test_contention BEFORE UPDATE ON maquinaria_operaciones FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_contention();`);
 await rejection(call,/Esta solicitud no realiz/);
 assert.equal((await db.query('select unidad_operacion_id from parque_stock_maquinas where id=$1',[id(41)])).rows[0].unidad_operacion_id,id(21));
 assert.equal((await db.query('select estado from maquinaria_operaciones where id=$1',[id(1)])).rows[0].estado,'DISPONIBLE');
});
console.log(JSON.stringify({passed:checks,engine:'PGlite local',scope:'real migration; verified minimal schema; permission/sales helpers controlled fixtures; contention errors injected, not concurrent sessions'}));
await db.close();
