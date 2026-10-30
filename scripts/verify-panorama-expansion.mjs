import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const file=n=>readFileSync(new URL('../supabase/review/panorama-v2/'+n,import.meta.url),'utf8');
const localGuard=(sql,hash)=>sql.replace(/<> '[0-9a-f]{32}'/,"<> '"+hash+"'");
const value=async sql=>(await db.query(sql)).rows[0]?.data;
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
try {
await db.exec([
"CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;",
"CREATE TYPE app_role AS ENUM('superadmin','admin','gerencia','tecnico');",
"CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('test.auth',true)='false' THEN NULL ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;",
"CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT $2::text=coalesce(current_setting('test.role',true),'admin') $$;",
"CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.module',true),'true')='true' $$;",
"CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.section',true),'true')='true' $$;",
"CREATE FUNCTION parque_normalizar_clave(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim(coalesce($1,''))) $$;",
"CREATE TABLE facturacion(cliente_id uuid,fecha date,sucursal text,total_venta numeric,moneda text,grupo_fx text,cod_factura text,excluido_de_reportes boolean);",
"CREATE TABLE facturacion_lineas_importadas(cliente_id uuid,fecha_factura timestamptz,sucursal text,total_venta numeric,moneda text,raw_data jsonb,grupo_normalizado text,subgrupo_original text,factura text,codigo_interno_factura text);",
"CREATE TABLE parque_maquinas(cliente_id uuid,activo boolean,sucursal text);",
"CREATE TABLE v_repuestos_semaforo_historico(codigo_interno text,color text,familia text,fecha_analisis date);",
"CREATE TABLE v_repuestos_ultima_compra(producto_codigo text,ultima_compra date);",
"CREATE TABLE v_repuestos_analisis_ubicaciones(producto_codigo text,sucursal text,stock numeric,saldo_kardex numeric,valor_kardex_usd numeric,kardex_cargado_en timestamptz);",
"CREATE TABLE maquinaria_pedidos_lineas_estado_actual(id uuid,operacion_id uuid,np_numero text,unidad_id uuid,cantidad numeric,estado_operacion text,estado_fuente text);",
"CREATE TABLE maquinaria_unidades_operacion(id uuid,estado text); CREATE TABLE maquinaria_importacion_unidades(unidad_id uuid,activa boolean,ata date); CREATE TABLE parque_stock_maquinas(unidad_operacion_id uuid,saldo_actual numeric);",
"CREATE FUNCTION campi_pedidos_con_stock_v1() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.ready',true),''),'{\"pedidos\":[]}')::jsonb $$;"
].join('\n'));
await db.exec(file('gerencial_clientes_movimientos_posventa_v1.reference.sql'));
await db.exec(file('gerencial_clientes_resumen_v1.reference.sql'));
await db.exec('REVOKE ALL ON FUNCTION gerencial_clientes_movimientos_posventa_v1(date,date) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION gerencial_clientes_movimientos_posventa_v1(date,date) TO service_role;');
for(const name of ['repuestos','pedidos'])await db.exec(file(name+'.before.sql'));
const parts=()=>value('SELECT campi_repuestos_exposicion_v1() AS data');
const orders=()=>value('SELECT campi_pedidos_abastecimiento_v1() AS data');
await db.exec("INSERT INTO v_repuestos_semaforo_historico VALUES('a','GRIS','x',current_date),('b','LILA','x',current_date),('c','ROJO','x',current_date),('d','SIN_DATOS','x',current_date); INSERT INTO v_repuestos_ultima_compra VALUES('a',current_date-1000),('b',current_date-365),('c',current_date-1001); INSERT INTO v_repuestos_analisis_ubicaciones VALUES('a','1',1,1,100,now()),('a','2',1,1,50,now()),('b','1',1,1,20,now()),('c','1',1,1,70,now()),('d','1',1,NULL,NULL,now());");
await db.query("INSERT INTO maquinaria_pedidos_lineas_estado_actual VALUES($1,$2,'NP',NULL,2,'ABASTECIMIENTO','')",[uid(2),uid(3)]);
const beforeParts=await parts(),beforeOrders=await orders();
for(const [name,fn] of [['repuestos','campi_repuestos_exposicion_v1'],['pedidos','campi_pedidos_abastecimiento_v1']]){
 const hash=(await db.query("SELECT md5(pg_get_functiondef('public."+fn+"()'::regprocedure)) AS hash")).rows[0].hash;
 // PostgreSQL builds can render definitions differently. Guard remains active with fixture hash.
 const sql=localGuard(file(name+'.apply.sql'),hash);
 await db.exec(sql);await assert.rejects(db.exec(sql),e=>e.message.includes('definición vigente cambió'));checks++;await db.exec('ROLLBACK');
}
const {tramos_compra,transiciones,...unchangedParts}=await parts();eq(unchangedParts,beforeParts);
const {pedidos_completos,...unchangedOrders}=await orders();eq(unchangedOrders,beforeOrders);
eq(tramos_compra.reduce((s,r)=>s+Number(r.valor_usd),0),220);eq(transiciones.length,2);eq(transiciones.find(r=>r.codigo==='a').valor_usd,150);eq(transiciones.every(r=>r.dias_hasta===1),true);eq(pedidos_completos[0].categoria,'No clasificables');eq(pedidos_completos[0].clasificable,false);
for(const [n,units,state] of [[10,1,'DISPONIBLE'],[20,2,'DISPONIBLE'],[30,1,'ABASTECIMIENTO'],[40,1,'DESCONOCIDO']])for(let j=0;j<units;j++)await db.query("INSERT INTO maquinaria_pedidos_lineas_estado_actual VALUES($1,$2,'NP',$3,1,$4,'')",[uid(n+j),uid(n+100),uid(n+200+j),state]);
await db.query("SELECT set_config('test.ready',$1,false)",[JSON.stringify({pedidos:[{operacion_id:uid(110),unidades_con_stock:1,unidades_activas:1},{operacion_id:uid(120),unidades_con_stock:1,unidades_activas:2}]})]);
const cats=(await orders()).pedidos_completos;
for(const [n,category] of [[110,'Cobertura completa'],[120,'Cobertura parcial'],[130,'Sin cobertura'],[140,'No clasificables']])eq(cats.find(r=>r.id===uid(n)).categoria,category);
await db.query("SELECT set_config('test.ready',$1,false)",[JSON.stringify({pedidos:[{operacion_id:uid(110),unidades_con_stock:1,unidades_activas:2}]})]);eq((await orders()).pedidos_completos.find(r=>r.id===uid(110)).categoria,'No clasificables');
await db.exec(file('clientes.apply.sql'));
const call="campi_clientes_cohortes_v1('2026-10-01','2026-10-21','2026-09-01','2026-09-21','TODAS')";
const customers=()=>value('SELECT '+call+' AS data');
const line=async(n,date,amount,currency='USD',document='D'+n+date+amount,branch='A')=>db.query("INSERT INTO facturacion_lineas_importadas VALUES($1,$2,$3,$4,$5,'{}','repuestos',NULL,$6,NULL)",[uid(n),date,branch,amount,currency,document]);
await db.query("INSERT INTO parque_maquinas VALUES($1,NULL,'A'),($2,true,'A'),($3,false,'A'),($4,true,'B')",[uid(1),uid(2),uid(3),uid(4)]);
await line(1,'2026-09-02',100);await line(1,'2026-10-02',100);await line(1,'2026-10-03',-100);await line(2,'2026-09-02',100);await line(2,'2026-10-02',50);await line(3,'2026-10-02',20,'PYG');await line(4,'2026-10-02',40,'PYG');
const c=await customers();eq(c.cohorte_base,[uid(1),uid(2)]);eq(c.retenidos,[uid(2)]);eq(c.cohorte_actual,[uid(2)]);eq(c.propietarios,[uid(1),uid(2),uid(4)]);eq(c.propietarios_con_compra,[uid(2),uid(4)]);eq(c.desglose_lineas,null);
await db.query("INSERT INTO facturacion VALUES($1,'2026-10-02','A',999,'USD','repuestos','DUP',false),($2,'2026-10-02','B',25,'USD','repuestos','DUP',false)",[uid(5),uid(6)]);await line(2,'2026-10-02',10,'USD','DUP','A');
const d=await customers();eq(d.cohorte_actual.includes(uid(5)),false);eq(d.cohorte_actual.includes(uid(6)),true);
for(const branch of ['TODAS','A','B']){
 const args="'2026-10-01','2026-10-21','2026-09-01','2026-09-21','"+branch+"'";
 const actual=await value('SELECT campi_clientes_cohortes_v1('+args+') AS data'),ref=(await db.query('SELECT * FROM gerencial_clientes_resumen_v1('+args+')')).rows[0];
 eq([actual.cohorte_base.length,actual.retenidos.length,actual.propietarios.length,actual.propietarios_con_compra.length],[Number(ref.compradores_base),Number(ref.compradores_retenidos),Number(ref.propietarios_elegibles),Number(ref.propietarios_con_compra_actual)]);
}
for(const role of ['tecnico','admin','gerencia','superadmin']){await db.query("SELECT set_config('test.role',$1,false)",[role]);eq((await customers())!==null,role!=='tecnico');}
await db.exec("SET test.module='false'");eq((await customers())!==null,true);await db.exec("SET test.role='admin'");eq(await customers(),null);await db.exec("SET test.role='superadmin'; SET test.section='false'");eq(await customers(),null);
for(const fn of [parts,orders]){await assert.rejects(fn(),e=>e.code==='42501');checks++;}
await db.exec("SET test.section='true'; SET test.module='true'; SET test.auth='false'");eq(await customers(),null);
await db.exec("SET test.auth='true'; SET test.role='admin'; SET ROLE authenticated");await assert.rejects(db.query("SELECT * FROM gerencial_clientes_movimientos_posventa_v1('2026-10-01','2026-10-21')"),e=>e.code==='42501');checks++;eq((await customers()).retenidos,[uid(2)]);
await db.exec('RESET ROLE; SET ROLE anon');await assert.rejects(customers(),e=>e.code==='42501');checks++;await db.exec('RESET ROLE');
for(const [name,signature] of [['clientes','campi_clientes_cohortes_v1(date,date,date,date,text)'],['pedidos','campi_pedidos_abastecimiento_v1()'],['repuestos','campi_repuestos_exposicion_v1()']]){
 const hash=(await db.query("SELECT md5(pg_get_functiondef('public."+signature+"'::regprocedure)) AS hash")).rows[0].hash;
 await db.exec(localGuard(file(name+'.rollback.sql'),hash));
}
eq(await value("SELECT to_regprocedure('public.campi_clientes_cohortes_v1(date,date,date,date,text)') AS data"),null);eq((await parts()).tramos_compra,undefined);eq((await orders()).pedidos_completos,undefined);
console.log('PASS: '+checks+' local PostgreSQL assertions; source semantics, NC, currency, deduplication, identities, null-active, authorization, payload parity, categories, transitions, drift guards and rollback. No remote SQL.');
}finally{await db.close();}
