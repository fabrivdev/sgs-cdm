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

 await db.exec(sql('20260930170000_import_totvs_dispatch_sales_orders.sql'));
 await db.exec(sql('20261015100000_parts_reconciled_import_purchase_age.sql'));
 let seq=100;
 async function addK(product, quantity=2, days=10, overrides={}) {
  const date=(await db.query(`SELECT (current_date-$1::int)::text d`,[days])).rows[0].d;
  await call([{...opening,tabla_origen:'SD1',recno_origen:String(++seq),producto_codigo:product,documento:'DOC',serie:'IMP',contraparte_codigo:'SUP',contraparte_tienda:'01',especie_documento:'NF',cantidad:quantity,fecha_movimiento:date,...overrides}]);
 }
 async function addD(product,quantity=2,days=10,generated='SI',supplier='SUP',entry='003 - EXENTO C/STOCK') {
  await db.query(`INSERT INTO totvs_importaciones_despacho
   (sucursal,proceso,fecha_proceso,fecha_finalizacion,item_proceso,proveedor_codigo,serie,fecha_documento,
    numero_documento,item_documento,producto_codigo,cantidad,precio_unitario,generada,tipo_entrada,archivo_origen,fila_origen,huella_origen,carga_id)
   VALUES ('01',$1,current_date-30,current_date-1,'1',$2,'IMP',current_date-$3::int,'DOC','1',$4,$5,5,$6,$7,'synthetic.xml',2,'v1','00000000-0000-0000-0000-000000000002')`,
   [String(++seq),supplier,days,product,quantity,generated,entry]);
 }
 const state=async product=>(await db.query('SELECT estado FROM v_repuestos_compras_importadas_conciliacion WHERE producto_codigo=$1',[product])).rows.map(r=>r.estado);
 await addK('REPTEST');await addD('REPTEST',2,10,'SI','SUP','115 - IMPORTACION');
 assert.deepEqual(await state('REPTEST'),['CONCILIADA']);
 // Same-date tie remains deterministic; newer imported purchase wins later.
 await db.query(`DELETE FROM totvs_facturas_compra_lineas WHERE producto_codigo='REPTEST'`);
 assert.deepEqual((await db.query(`SELECT current_date-ultima_compra days,fuente_compra FROM v_repuestos_ultima_compra WHERE producto_codigo='REPTEST'`)).rows,[{days:10,fuente_compra:'Importación TOTVS conciliada'}]);
 await addK('REPMULTI',2);await addK('REPMULTI',3);await addD('REPMULTI',2);await addD('REPMULTI',3);
 assert.deepEqual(await state('REPMULTI'),['CONCILIADA']);
 const multiple=(await db.query(`SELECT cantidad_kardex,cantidad_despacho,jsonb_array_length(referencias_kardex) refs FROM v_repuestos_compras_importadas_conciliacion WHERE producto_codigo='REPMULTI'`)).rows[0];
 assert.equal(Number(multiple.cantidad_kardex),5);assert.equal(Number(multiple.cantidad_despacho),5);assert.equal(multiple.refs,2);
 await addK('REPPENDING');assert.deepEqual(await state('REPPENDING'),['SIN_DESPACHO']);
 assert.equal((await db.query(`SELECT * FROM v_repuestos_ultima_compra WHERE producto_codigo='REPPENDING'`)).rows.length,0);
 // Later dispatch resolves pending status without a dated exception or manual flag.
 await addD('REPPENDING');assert.deepEqual(await state('REPPENDING'),['CONCILIADA']);
 await addK('REPQUANTITY');await addD('REPQUANTITY',3);assert.deepEqual(await state('REPQUANTITY'),['DIFERENCIA_CANTIDAD']);
 await addK('REPDATE');await addD('REPDATE',2,9);assert.deepEqual(await state('REPDATE'),['DIFERENCIA_FECHA']);
 await addK('REPNOGENERATED');await addD('REPNOGENERATED',2,10,'NO');assert.deepEqual(await state('REPNOGENERATED'),['DATOS_INVALIDOS']);
 await addK('REPFUTURE',2,-1);await addD('REPFUTURE',2,-1);assert.deepEqual(await state('REPFUTURE'),['DATOS_INVALIDOS']);
 await addK('REPMIXDATE');await addK('REPMIXDATE',2,9);await addD('REPMIXDATE',4);assert.deepEqual(await state('REPMIXDATE'),['DATOS_INVALIDOS']);
 await addK('REPSTORE');await addK('REPSTORE',2,10,{contraparte_tienda:'02'});await addD('REPSTORE',4);assert.deepEqual(await state('REPSTORE'),['DATOS_INVALIDOS']);
 await addK('REPSUPPLIER');await addD('REPSUPPLIER',2,10,'SI','OTHER');assert.deepEqual((await state('REPSUPPLIER')).sort(),['SIN_DESPACHO','SIN_KARDEX']);
 for (const kind of ['RTE','NCC']) {await addK('REP'+kind,2,10,{especie_documento:kind});await addD('REP'+kind);assert.deepEqual(await state('REP'+kind),['SIN_KARDEX']);}
 await addK('REPOPENING',2,10,{tabla_origen:'SB9'});await addD('REPOPENING');assert.deepEqual(await state('REPOPENING'),['SIN_KARDEX']);
 await addK('REPZERO',0);await addD('REPZERO');assert.deepEqual(await state('REPZERO'),['SIN_KARDEX']);
 await addK('REPBADLINE');await addD('REPBADLINE',2);await addD('REPBADLINE',0,10,'NO');assert.deepEqual(await state('REPBADLINE'),['DATOS_INVALIDOS']);
 // Malformed line may not disappear before reconciliation, even if its quantity is zero.
 assert.equal((await db.query(`SELECT count(*)::int n FROM v_repuestos_ultima_compra WHERE fuente_compra='Importación TOTVS conciliada'`)).rows[0].n,3);
 await addK('REPTEST',2,1,{documento:'PENDING-NEW'});
 assert.equal((await db.query(`SELECT current_date-ultima_compra days FROM v_repuestos_ultima_compra WHERE producto_codigo='REPTEST'`)).rows[0].days,10);
 await db.exec(`INSERT INTO totvs_facturas_compra_lineas VALUES ('REPTEST',current_date-5,'NF',1,50,'001 - C/STOCK')`);
 assert.deepEqual((await db.query(`SELECT current_date-ultima_compra days,fuente_compra FROM v_repuestos_ultima_compra WHERE producto_codigo='REPTEST'`)).rows,[{days:5,fuente_compra:'Factura de compra TOTVS'}]);
 await db.exec(`SET ROLE anon`);
 await assert.rejects(db.query('SELECT * FROM v_repuestos_compras_importadas_conciliacion'),/permission denied/);
 await db.exec('RESET ROLE');
 await db.exec(sql('20261015100000_parts_reconciled_import_purchase_age.sql'));
 assert.deepEqual(await state('REPMULTI'),['CONCILIADA']);
 console.log('PASS: conciliación agregada, TIPENT 115, fecha documental, fuente, pendientes y resolución automática, cantidades/fechas/proveedor/tiendas, no generados, futuro, SB9/RTE/NCC/cero, trazabilidad, acceso anónimo e idempotencia. Solo datos sintéticos locales.');
} finally { await db.close(); }
