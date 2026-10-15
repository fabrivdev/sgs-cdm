import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT null::uuid$$;
 CREATE FUNCTION has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
 CREATE TABLE repuestos_compras_historicas(codigo_legacy_norm text,ultima_compra date);
 CREATE TABLE repuestos_maestro_legacy(producto_codigo text,codigo_legacy_norm text,carga_id int,estado_vinculo text);
 CREATE TABLE repuestos_maestro_legacy_cargas(id int,activo boolean,estado text);
 CREATE TABLE totvs_facturas_compra_lineas(producto_codigo text,fecha_emision date,especie text,cantidad numeric,total_usd numeric,tipo_entrada text);
 CREATE TABLE v_repuestos_compras_importadas_conciliacion(producto_codigo text,fecha_documento date,estado text);`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261015130000_grid_purchase_history.sql',import.meta.url),'utf8'));
 const sha='a'.repeat(64);
 await db.exec(`INSERT INTO repuestos_maestro_legacy_cargas VALUES(1,true,'COMPLETADO');
 INSERT INTO repuestos_maestro_legacy VALUES('REP1','1',1,'CONFIRMADA'),('REP2','2',1,'CONFIRMADA'),('REP3','3',1,'PENDIENTE');
 INSERT INTO repuestos_compras_historicas VALUES('1','2026-06-01'),('2','2026-06-02');
 INSERT INTO repuestos_ficha_grid_cargas VALUES('${sha}','synthetic.csv','2026-06-30',5,3,2,md5(E'1|2020-01-01\n2|\n3|2021-01-01'),false,now());`);
 const dates=async()=> (await db.query('SELECT producto_codigo,ultima_compra::text d FROM v_repuestos_ultima_compra ORDER BY 1')).rows;
 assert.equal((await dates()).length,2);
 await assert.rejects(db.exec(`UPDATE repuestos_ficha_grid_cargas SET activo=true`),/incompleta/);
 await db.exec(`INSERT INTO repuestos_ficha_grid_compras VALUES
 ('${sha}','1','2020-01-01','ENTRADA POR COMPRA',1,'M1',2),
 ('${sha}','2',null,null,null,null,null),
 ('${sha}','3','2021-01-01','ENTRADA POR IMPORTACAO',1,'M3',3);`);
 assert.equal((await dates())[0].d,'2026-06-01'); // inactive staging cannot affect the dashboard
 await assert.rejects(db.exec(`INSERT INTO repuestos_ficha_grid_compras VALUES('${sha}','4','2020-01-01','ENTRADA POR DEVOLUCAO DE VENDA',1,'M4',4)`),/check constraint/);
 await db.exec('UPDATE repuestos_ficha_grid_cargas SET activo=true');
 assert.deepEqual(await dates(),[{producto_codigo:'REP1',d:'2020-01-01'}]); // no resurrection of return dates; ambiguous mapping excluded
 await db.exec(`INSERT INTO totvs_facturas_compra_lineas VALUES('REP1','2026-07-01','NF',1,10,'001 - C/STOCK'),('REP1','2026-08-01','NF',1,10,'004 - S/STOCK');
 INSERT INTO v_repuestos_compras_importadas_conciliacion VALUES('REP1','2026-09-01','CONCILIADA'),('REP1','2026-10-01','SIN_DESPACHO');`);
 assert.deepEqual(await dates(),[{producto_codigo:'REP1',d:'2026-09-01'}]);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM repuestos_ficha_grid_compras'),/permission denied/);
 await db.exec('RESET ROLE;SET ROLE authenticated');await assert.rejects(db.exec('UPDATE repuestos_ficha_grid_cargas SET activo=false'),/permission denied/);
 console.log('PASS: activation guards, staged visibility, return exclusion, ambiguous mapping, TOTVS precedence and permissions');
} finally {await db.close();}
