// Prueba aislada de la migración, nunca conecta con Supabase.
// node scripts/test-dashboard-reconciliation.mjs <módulo PGlite o URL file:///...>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.argv[2] ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS
      $$ SELECT coalesce(current_setting('test.access',true),'false')='true' AND $2='servicios.dashboard' $$;
    CREATE FUNCTION cliente_nombre_canonico(text) RETURNS text LANGUAGE sql AS $$ SELECT upper(btrim($1)) $$;
    CREATE TABLE facturacion(id text,cliente_id uuid,grupo text);
    CREATE TABLE facturacion_lineas_importadas(id text PRIMARY KEY,fecha_factura timestamptz,
      sucursal text,entidad_nombre text,total_venta numeric,cantidad numeric,moneda text,
      origen_sistema text,tipo_tiempo text,factura text,codigo_interno_factura text,
      cod_mercaderia text,codigo_fabricante text,subgrupo_original text,marca_normalizada text,raw_data jsonb);
    CREATE TABLE repuestos_ventas_duplicadas(linea_id text PRIMARY KEY,linea_canonica_id text);
    CREATE TABLE v_ventas_repuestos_historico_completo(linea_id text,fecha date,fecha_factura timestamptz,
      sucursal text,cliente text,importe numeric,cantidad numeric,es_nota_credito boolean,
      factura text,codigo text,codigo_fabricante text,descripcion text);
    CREATE TABLE base_prueba(linea_id text,fecha date,sucursal text,cliente text,total_venta numeric,
      cantidad numeric,concepto text,area_calculada text,metodologia text,factura text,
      codigo text,codigo_fabricante text,descripcion text,marca text);
    CREATE FUNCTION ventas_area_movimientos_base(date,date,text,text) RETURNS SETOF base_prueba
      LANGUAGE sql AS $$ SELECT * FROM base_prueba WHERE fecha BETWEEN $1 AND $2 $$;
    CREATE FUNCTION ventas_repuestos_movimientos_v1(date,date,text,text)
      RETURNS TABLE(id text,fecha date,importe numeric) LANGUAGE sql AS $$
      SELECT 'historico:'||linea_id,fecha,importe FROM v_ventas_repuestos_historico_completo
        WHERE fecha BETWEEN $1 AND least($2,date '2026-06-30')
      UNION ALL SELECT 'actual:'||linea_id,fecha,total_venta FROM base_prueba
        WHERE area_calculada='repuestos' AND fecha BETWEEN greatest($1,date '2026-07-01') AND $2 $$;
    INSERT INTO base_prueba VALUES
      ('MO','2026-06-30','Santa Rita','CLIENTE',100,2,'Servicio','servicios','historico','DOC',NULL,NULL,'MO',NULL),
      ('KM','2026-06-30','Santa Rita','CLIENTE',10,20,'Kilometraje','servicios','historico','DOC',NULL,NULL,'KM',NULL),
      ('RESUMEN','2026-06-30','Santa Rita','CLIENTE',999,1,'Repuestos','repuestos','historico','DOC',NULL,NULL,NULL,NULL),
      ('ACTUAL','2026-07-01','Santa Rita','CLIENTE',200,1,'Servicio','servicios','actual','F2',NULL,NULL,'MO','CLAAS'),
      ('TER','2026-08-31','Santa Rita','CLIENTE',30,1,'Terceros','servicios','actual','F3',NULL,NULL,'Terceros','HORSCH'),
      ('NCA','2026-08-31','Santa Rita','CLIENTE',-10,-1,'Repuestos','repuestos','actual','NC',NULL,NULL,'NC','CLAAS');
    INSERT INTO facturacion VALUES ('MO',NULL,'SERVICE - CLAAS'),('KM',NULL,'Kilometraje');
    INSERT INTO v_ventas_repuestos_historico_completo VALUES
      ('H1','2026-06-30','2026-06-30','Santa Rita','CLIENTE',20,1,false,'DOC','A','FAB','Pieza'),
      ('HNC','2026-06-30','2026-06-30','Santa Rita','CLIENTE',-5,1,true,'NC','B','FAB2','NC');
    INSERT INTO facturacion_lineas_importadas VALUES
      ('H1','2026-06-30','Santa Rita','CLIENTE',20,1,'USD','legacy_historico_detallado','Cliente','DOC','INT','A','FAB','REPUESTOS - CLAAS','CLAAS','{}'),
      ('HNC','2026-06-30','Santa Rita','CLIENTE',-5,1,NULL,'legacy_historico_detallado','Cliente','NC','NCINT','B','FAB2',NULL,'CLAAS','{}'),
      ('ACTUAL','2026-07-01','Santa Rita','CLIENTE',200,1,'USD','new_xml_facturacion_os','Garantia','F2','I2',NULL,NULL,NULL,'CLAAS','{"linked_service_order":"01-00000165"}'),
      ('TER','2026-08-31','Santa Rita','CLIENTE',30,1,'USD','new_xml_facturacion_os','Interno','F3','I3',NULL,NULL,NULL,'HORSCH','{}'),
      ('NCA','2026-08-31','Santa Rita','CLIENTE',-10,-1,'USD','new_xml_facturacion_directa','Cliente','NC','INC',NULL,NULL,NULL,'CLAAS','{}'),
      ('G1','2026-06-30','Santa Rita','CLIENTE',20,1,'USD','grid_campos','Garantia','DOC','INT','A','FAB',NULL,NULL,'{}'),
      ('HUERFANA','2026-06-30','Santa Rita','CLIENTE',500,1,'USD','grid_campos','Interno','OTRA','OTRA','X','X',NULL,NULL,'{}');
  `);
  const migration = readFileSync(new URL('../supabase/migrations/20260916160000_reconcile_dashboard_billing_with_sales.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const read = async () => (await db.query("SELECT * FROM dashboard_facturacion_fuente_v1('2026-01-01','2026-12-31')")).rows;
  let rows = await read();
  const money = (r) => r.reduce((a,b) => a+Number(b.total_venta),0);
  assert.equal(rows.length,7); assert.equal(money(rows),345);
  assert(!rows.some(r => r.id.includes('RESUMEN') || r.id.includes('HUERFANA') || r.id.includes('G1')));
  assert.equal(rows.find(r=>r.id==='historico:H1').tipo_tiempo,'Garantia');
  assert.equal(rows.find(r=>r.id==='historico:H1').raw_data.dashboard_time_type_source,'grid_inferido');
  assert.equal(rows.find(r=>r.id==='historico:MO').tipo_tiempo,null);
  assert.equal(rows.find(r=>r.id==='historico:HNC').cantidad,'-1');
  assert.equal(rows.find(r=>r.id==='actual:ACTUAL').raw_data.linked_service_order,'01-00000165');
  // Mismo importe no autoriza otro documento, cliente, fecha o sucursal.
  await db.exec("UPDATE facturacion_lineas_importadas SET factura='OTRO',codigo_interno_factura='OTRO' WHERE id='G1'");
  assert.equal((await read()).find(r=>r.id==='historico:H1').tipo_tiempo,'Cliente');
  await db.exec("UPDATE facturacion_lineas_importadas SET factura='DOC',codigo_interno_factura='INT' WHERE id='G1'");
  // Dos GRID reclamando una misma canónica: no asignar el pendiente.
  await db.exec("INSERT INTO facturacion_lineas_importadas SELECT 'G2',fecha_factura,sucursal,entidad_nombre,total_venta,cantidad,moneda,origen_sistema,'Interno',factura,codigo_interno_factura,cod_mercaderia,codigo_fabricante,subgrupo_original,marca_normalizada,raw_data FROM facturacion_lineas_importadas WHERE id='G1'");
  rows=await read(); assert.equal(rows.find(r=>r.id==='historico:H1').tipo_tiempo,'Cliente'); assert.equal(money(rows),345);
  // Relaciones archivadas con conflicto: visible como desconocido, sin expansión.
  await db.exec("INSERT INTO repuestos_ventas_duplicadas VALUES ('G1','H1'),('G2','H1')");
  rows=await read(); assert.equal(rows.length,7); assert.equal(money(rows),345);
  assert.equal(rows.find(r=>r.id==='historico:H1').tipo_tiempo,null);
  assert.equal(rows.find(r=>r.id==='historico:H1').raw_data.dashboard_time_type_source,'conflicto_grid');
  await assert.rejects(db.query("SELECT * FROM dashboard_facturacion_movimientos_v1('2026-01-01','2026-12-31')"),/No tenés acceso/);
  await db.exec("SET test.uid='00000000-0000-0000-0000-000000000001'; SET test.access='true'");
  await assert.rejects(db.query("SELECT * FROM dashboard_facturacion_movimientos_v1(NULL,'2026-12-31')"),/rango/);
  await assert.rejects(db.query("SELECT * FROM dashboard_facturacion_movimientos_v1('2026-09-01','2026-08-31')"),/rango/);
  const august=(await db.query("SELECT * FROM dashboard_facturacion_movimientos_v1('2026-08-01','2026-08-31')")).rows;
  assert.equal(august.length,2); assert.equal(money(august),20);
  await db.exec(migration); assert.equal(money(await read()),345);
  const loteMigration = readFileSync(new URL('../supabase/migrations/20260916170000_dashboard_billing_single_evaluation.sql', import.meta.url),'utf8');
  await db.exec(loteMigration);
  const lote = async (desde='2026-01-01',hasta='2026-12-31') =>
    (await db.query('SELECT dashboard_facturacion_lote_v1($1::date,$2::date) AS data',[desde,hasta])).rows[0].data;
  let batch = await lote();
  assert.equal(batch.count,7); assert.equal(money(batch.rows),345);
  assert.deepEqual(batch.rows,(await read()).map(r=>({ ...r,
    fecha:r.fecha.toISOString().slice(0,10),cantidad:Number(r.cantidad),total_venta:Number(r.total_venta) })));
  await assert.rejects(lote('2025-12-31','2026-01-01'),/rango/);
  await assert.rejects(lote(null,'2026-12-31'),/rango/);
  await db.exec("SET test.access='false'");
  await assert.rejects(lote(),/No tenés acceso/);
  await db.exec("SET test.access='true'");
  assert.deepEqual(await lote('2026-12-01','2026-12-31'),{ rows:[],count:0 });
  await db.exec(loteMigration);
  // El escalar conserva todas las filas, más allá del tope REST de 1.000.
  await db.exec(`INSERT INTO base_prueba SELECT 'EXTRA'||n,'2026-08-31','Santa Rita','CLIENTE',1,1,
    'Servicio','servicios','actual','E'||n,NULL,NULL,'MO',NULL FROM generate_series(1,1501) n`);
  batch=await lote(); assert.equal(batch.count,1508); assert.equal(batch.rows.length,1508);
  assert.equal(money(batch.rows),1846);
  await db.exec("DELETE FROM base_prueba WHERE linea_id LIKE 'EXTRA%'");
  assert.equal((await db.query('SELECT count(*) n FROM facturacion_lineas_importadas')).rows[0].n,8);
  const audit = readFileSync(new URL('../supabase/verificar_conciliacion_dashboard_2026.sql', import.meta.url),'utf8');
  const results=(await db.query(audit)).rows;
  assert.equal(results.length,66); assert(results.every(r=>r.resultado==='COINCIDE'));
  // Una diferencia compensada en dos líneas no debe pasar sólo por total cero.
  await db.exec(`CREATE OR REPLACE FUNCTION ventas_repuestos_movimientos_v1(date,date,text,text)
    RETURNS TABLE(id text,fecha date,importe numeric) LANGUAGE sql AS $$
    SELECT 'historico:'||linea_id,fecha,importe+CASE WHEN linea_id='H1' THEN 1 ELSE -1 END
      FROM v_ventas_repuestos_historico_completo WHERE fecha BETWEEN $1 AND least($2,date '2026-06-30')
    UNION ALL SELECT 'actual:'||linea_id,fecha,total_venta FROM base_prueba
      WHERE area_calculada='repuestos' AND fecha BETWEEN greatest($1,date '2026-07-01') AND $2 $$`);
  const mismatch=(await db.query(audit)).rows.find(r=>r.periodo==='2026-06' && r.modulo==='repuestos');
  assert.equal(mismatch.resultado,'REVISAR'); assert.equal(Number(mismatch.diferencia),0);
  assert.equal(Number(mismatch.registros_diferentes),2);
  console.log('OK: migraciones idempotentes, importes/NC, corte junio/julio, GRID no aditivo, pendientes ambiguos, conflictos, datos originales, permisos y JSON completo >1000 filas. Fixtures sintéticos, no producción.');
} finally { await db.close(); }
