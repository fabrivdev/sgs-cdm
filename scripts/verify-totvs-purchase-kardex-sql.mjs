import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const sql = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
 CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.allowed',true),'yes')='yes' $$;
 CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE repuestos_compras_historicas(codigo_legacy_norm text,ultima_compra date);
 CREATE TABLE repuestos_maestro_legacy(producto_codigo text,codigo_legacy_norm text,carga_id int,estado_vinculo text);
 CREATE TABLE repuestos_maestro_legacy_cargas(id int,activo boolean,estado text);
 CREATE TABLE totvs_facturas_compra_lineas(producto_codigo text,fecha_emision date,especie text,cantidad numeric,total_usd numeric,tipo_entrada text);`);
 await db.exec(sql('20260930160000_import_totvs_kardex.sql'));
 await db.exec(sql('20261015090000_totvs_purchase_stock_and_kardex_opening.sql'));
 const opening = {tabla_origen:'SB9',recno_origen:'1',fecha_movimiento:'2026-06-30',filial:'01',deposito:'01',producto_codigo:'REPTEST',cantidad:12,especie_documento:'',documento:'',secuencia:'0',moneda_codigo:'0',direccion:'E',archivo_origen:'synthetic.xml',fila_origen:2,huella_origen:'v1'};
 const call = rows => db.query(`SELECT public.totvs_importar_kardex_lote_v1('00000000-0000-0000-0000-000000000002',$1::jsonb) result`,[JSON.stringify(rows)]);
 assert.equal((await call([opening])).rows[0].result.insertadas,1);
 assert.equal((await call([opening])).rows[0].result.sin_cambios,1);
 for (const override of [{tabla_origen:'SD1'},{tabla_origen:'SD3'},{direccion:'S'},{direccion:null}]) {
  await assert.rejects(call([{...opening,recno_origen:'2',...override}]),/obligatorios/);
 }
 await assert.rejects(call([{...opening,huella_origen:'v2'}]),/otra huella/);
 await db.exec(`SET test.allowed='no'`);
 await assert.rejects(call([opening]),/Sin permiso/);
 await db.exec(`SET test.allowed='yes'`);
 await db.exec(`INSERT INTO repuestos_maestro_legacy_cargas VALUES(1,true,'COMPLETADO');
 INSERT INTO repuestos_maestro_legacy VALUES('REPTEST','OLD',1,'CONFIRMADA');
 INSERT INTO repuestos_compras_historicas VALUES('OLD',current_date-500);
 INSERT INTO totvs_facturas_compra_lineas VALUES
 ('REPTEST',current_date-10,'NF',1,50,'001 - IVA C/STOCK'),
 ('REPTEST',current_date-2,'NF',1,60,'004 - IVA S/STOCK'),
 ('REPTEST',current_date-1,'NCP',-1,-60,'501 - IVA C/STOCK'),
 ('REPTEST',current_date+1,'NF',1,70,'001 - IVA C/STOCK'),
 ('REPTEST',current_date,'NF',1,70,NULL),
 ('REPOTHER',current_date-1,'NF',1,10,'003 - EXENTO C/ STOCK');`);
 const result=await db.query(`SELECT producto_codigo,current_date-ultima_compra days FROM v_repuestos_ultima_compra ORDER BY producto_codigo`);
 assert.deepEqual(result.rows,[{producto_codigo:'REPOTHER',days:1},{producto_codigo:'REPTEST',days:10}]);
 assert.equal((await db.query('SELECT count(*)::int n FROM totvs_kardex_movimientos')).rows[0].n,1);
 console.log('PASS: SB9 sin documento, idempotencia, rechazos SD1/SD3/S/null, conflictos, permisos y última compra C/STOCK con respaldo GRID. Datos exclusivamente sintéticos; sin conexión remota.');
} finally { await db.close(); }
