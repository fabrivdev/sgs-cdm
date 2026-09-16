// PostgreSQL aislado: ejecuta las funciones/vistas SQL reales, sin Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.argv[2] ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uuid(999)}'::uuid $$;
    CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION cliente_nombre_canonico(text) RETURNS text LANGUAGE sql AS $$ SELECT upper(btrim($1)) $$;
    CREATE FUNCTION valor_json_insensible(jsonb,text[]) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT value FROM jsonb_each_text($1) d WHERE lower(d.key) IN (SELECT lower(unnest($2))) LIMIT 1 $$;
    CREATE FUNCTION extraer_chasis_venta_maquina(text,jsonb,text) RETURNS text LANGUAGE sql AS $$ SELECT $2->>'CHASIS' $$;
    CREATE FUNCTION normalizar_codigo_repuesto_flexible(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT upper($1) $$;
    CREATE TABLE facturacion(id uuid PRIMARY KEY,fecha timestamptz,cod_factura text,entidad_nombre text,
      sucursal text,total_venta numeric,cantidad numeric,grupo text,grupo_fx text,tipo text,
      moneda text DEFAULT 'USD',excluido_de_reportes boolean DEFAULT false,cliente_id uuid);
    CREATE TABLE facturacion_lineas_importadas(id uuid PRIMARY KEY,fecha_factura timestamptz,
      factura text,codigo_interno_factura text,entidad_nombre text,sucursal text,total_venta numeric,
      cantidad numeric,subgrupo_original text,grupo_normalizado text,mercaderia text,observacion text,
      cod_mercaderia text,codigo_fabricante text,marca_normalizada text,moneda text,
      origen_sistema text,tipo_tiempo text,raw_data jsonb);
    CREATE TABLE repuestos_ventas_vinculacion(linea_id uuid PRIMARY KEY,estado_vinculo text,producto_codigo text);
    CREATE TABLE productos(codigo_interno text PRIMARY KEY,codigo_fabricante text,descripcion text);
    CREATE TABLE repuestos_conversiones_unidad_historica(id int,activa boolean,codigo_legacy_norm text,
      fecha_desde date,fecha_hasta_exclusiva date,precio_unitario_min numeric,precio_unitario_max numeric,factor_cantidad numeric);
    CREATE TABLE repuestos_ventas_duplicadas(linea_id uuid PRIMARY KEY,linea_canonica_id uuid);
  `);
  const machine = read('supabase/migrations/20260911200000_recognize_machine_lines_by_code_and_description.sql');
  await db.exec(machine.slice(machine.indexOf('create or replace function public.ventas_area_movimientos_base(')));
  const parts = read('supabase/migrations/20260915160000_use_complete_parts_history_and_credit_notes.sql');
  await db.exec(parts.slice(parts.indexOf('CREATE OR REPLACE VIEW public.v_ventas_repuestos_historico_completo'),
    parts.indexOf('CREATE OR REPLACE FUNCTION public.ventas_repuestos_panorama_v1')));
  await db.exec(read('supabase/migrations/20260916160000_reconcile_dashboard_billing_with_sales.sql'));
  const historic = [
    [1, 'SERVICIOS - OTROS', null, 1, 'Servicio', '181925'],
    [2, 'SERVICE - CLAAS', ' MANO DE OBRA ', 100, 'Servicio', 'MO'],
    [3, 'SERVICE - HORSCH', 'kilometraje', 10, 'Servicio', 'KM'],
    [4, 'SERVICIOS - OTROS', null, 20, 'Servicio', 'LICENCIA'],
    [5, 'SERVICIOS - OTROS', '', -5, 'Servicio', 'DESCUENTO'],
    [6, 'REPUESTOS - CLAAS', 'REPUESTOS', 71.23, 'Repuesto', '181925'],
    [7, 'ART. MERCHANDISE - ART. VARIOS', null, 22.18, 'Repuesto', 'MERCH'],
  ];
  for (const [id, group, fx, money, type, document] of historic) {
    await db.query(`INSERT INTO facturacion(id,fecha,cod_factura,entidad_nombre,sucursal,total_venta,cantidad,grupo,grupo_fx,tipo)
      VALUES($1,'2026-01-05',$2,'CLIENTE','Santa Rita',$3,1,$4,$5,$6)`, [uuid(id),document,money,group,fx,type]);
  }
  const lines = [
    [11,'2026-01-05','181925','TUBO',62.05,'REPUESTOS - CLAAS','Repuestos','legacy_historico_detallado',{}],
    [12,'2026-01-05','181925','ANILLO',9.18,'REPUESTOS - CLAAS','Repuestos','legacy_historico_detallado',{}],
    [13,'2026-06-18','MERCH','GAFAS DE SOL TERRA TRAC',22.18,'ART. MERCHANDISE - ART. VARIOS','Repuestos','legacy_historico_detallado',{}],
    [14,'2026-06-30','NC','REPUESTO DEVUELTO',-5,'REPUESTOS - CLAAS','Repuestos','legacy_historico_detallado',{movimiento:'E'}],
    [15,'2026-06-30','SINCAT','REPUESTO SIN CATALOGO',7.5,'REPUESTOS - OTROS','Repuestos','legacy_historico_detallado',{}],
    [16,'2026-06-18','MERCH','GAFAS',22.18,null,'Repuestos','grid_campos',{}],
    [17,'2026-06-30','GS','PRODUCTO',100000,'REPUESTOS','Repuestos','legacy_historico_detallado',{},'PYG'],
    [21,'2026-08-31','ACTMO','MANO DE OBRA',50,'SERVICE - CLAAS','Servicio','new_xml_facturacion_os',{linked_service_order:'01-165'}],
    [22,'2026-08-31','ACTTER','SERVICIOS DE TERCEROS',30,'SERVICE - CLAAS','Servicio','new_xml_facturacion_os',{linked_service_order:'01-165'}],
    [23,'2026-08-31','ACTREP','REPUESTO OS',10,'REPUESTOS - CLAAS','Repuestos','new_xml_facturacion_os',{linked_service_order:'01-165'}],
    [24,'2026-08-31','DIRECTA','REPUESTO DIRECTO',12,'REPUESTOS - CLAAS','Repuestos','new_xml_facturacion_directa',{}],
    [25,'2026-08-31','ENVIO','COSTO DE ENVÍO',4,'SERVICIOS - OTROS','Servicio','new_xml_facturacion_os',{linked_service_order:'01-165'}],
    [26,'2026-08-31','INT','INTERESES COBRADOS',6,'OTROS','Repuestos','new_xml_facturacion_directa',{}],
    [27,'2026-08-31','MAQ','MAQUINA',200,'OTROS','Otros','new_xml_facturacion_directa',{CHASIS:'123'}],
  ];
  for (const [id,date,document,description,money,group,normalized,origin,raw,currency='USD'] of lines) {
    await db.query(`INSERT INTO facturacion_lineas_importadas VALUES
      ($1,$2,$3,$3,'CLIENTE','Santa Rita',$4,1,$5,$6,$7,NULL,$8,NULL,'CLAAS',$9,$10,'Cliente',$11::jsonb)`,
      [uuid(id),date,document,money,group,normalized,description,id===27?'VEIC_1':String(id),currency,origin,
        JSON.stringify({sucursal_original:'CENTRAL',...raw})]);
  }
  const source = async () => (await db.query("SELECT * FROM dashboard_facturacion_fuente_v1('2026-01-01','2026-12-31')")).rows;
  const before = await source();
  assert.equal(before.find(r=>r.id===`historico:${uuid(1)}`).concepto,'Servicio'); // Reproduce el error de $1.
  const original = (await db.query('SELECT to_jsonb(f) AS dato FROM facturacion f ORDER BY id')).rows;
  const originalLines = (await db.query('SELECT to_jsonb(f) AS dato FROM facturacion_lineas_importadas f ORDER BY id')).rows;
  const migration = read('supabase/migrations/20260916180000_respect_historical_group_fx_and_commercial_others.sql');
  await db.exec(migration);
  let rows = await source();
  const row = (id, era='historico') => rows.find(r=>r.id===`${era}:${uuid(id)}`);
  assert.equal(row(1).concepto,'Otros'); assert.equal(row(1).area_calculada,'otros');
  assert.equal(row(1).total_venta,'1'); assert.equal(row(2).concepto,'Servicio'); assert.equal(row(3).concepto,'Kilometraje');
  assert.equal(row(4).concepto,'Otros'); assert.equal(row(5).concepto,'Otros'); assert.equal(row(5).total_venta,'-5');
  assert.equal(row(13).concepto,'Otros'); assert.equal(row(13).origen_sistema,'legacy_historico_detallado');
  assert(!row(6)); assert(!row(7)); assert(!row(16)); assert(!row(17)); // No resumen duplicado, GRID ni GS.
  assert.equal(row(14).cantidad,'-1'); assert.equal(row(15).concepto,'Repuestos');
  assert.equal(row(22,'actual').concepto,'Terceros'); assert.equal(row(22,'actual').area_calculada,'servicios');
  assert.equal(row(23,'actual').area_calculada,'servicios');
  assert.equal(row(25,'actual').concepto,'Otros'); assert.equal(row(25,'actual').area_calculada,'otros');
  assert.equal(row(25,'actual').raw_data.linked_service_order,'01-165'); // El vínculo original no se borra.
  assert.equal(row(26,'actual').area_calculada,'otros'); assert.equal(row(27,'actual').area_calculada,'maquinas');
  const sum = (rs) => Math.round(rs.reduce((s,r)=>s+Number(r.total_venta),0)*100)/100;
  assert.equal(sum(rows),533.91);
  assert.equal(sum(rows.filter(r=>r.area_calculada==='servicios')),200);
  assert.equal(sum(rows.filter(r=>r.area_calculada==='repuestos')),85.73);
  assert.equal(sum(rows.filter(r=>r.area_calculada==='otros')),48.18);
  const sales = (await db.query("SELECT * FROM ventas_repuestos_movimientos_v1('2026-01-01','2026-12-31',NULL,NULL)")).rows;
  assert.equal(Math.round(sales.reduce((s,r)=>s+Number(r.importe),0)*100)/100,85.73);
  assert(!sales.some(r=>r.id===`historico:${uuid(13)}`));
  assert.equal(sales.filter(r=>r.factura==='181925').length,2);
  const services = (await db.query("SELECT * FROM ventas_area_movimientos_base('2026-01-01','2026-12-31',NULL,NULL) WHERE area_calculada='servicios'")).rows;
  assert.equal(sum(services),200);
  // Conservación por ID e importe, no sólo suma: retirar el resumen duplicado
  // de Repuestos, mantener cada línea canónica, incluso los nuevos Otros.
  const fingerprint = (rs) => rs.map(r=>[r.id,r.total_venta,r.cantidad]).sort((a,b)=>a[0].localeCompare(b[0]));
  assert.deepEqual(fingerprint(rows),fingerprint(before.filter(r=>r.id!==`historico:${uuid(7)}`)));
  assert.deepEqual((await db.query('SELECT to_jsonb(f) AS dato FROM facturacion f ORDER BY id')).rows,original);
  assert.deepEqual((await db.query('SELECT to_jsonb(f) AS dato FROM facturacion_lineas_importadas f ORDER BY id')).rows,originalLines);
  assert.equal((await db.query("SELECT * FROM ventas_area_movimientos_base('2026-01-01','2026-06-30',NULL,'181925') WHERE concepto='Otros'")).rows.length,1);
  assert.equal((await db.query("SELECT * FROM ventas_repuestos_movimientos_v1('2026-01-01','2026-12-31','Katuete',NULL)")).rows.length,0);
  const fn = (await db.query("SELECT proconfig FROM pg_proc WHERE oid='ventas_area_movimientos_base(date,date,text,text)'::regprocedure")).rows[0];
  assert(fn.proconfig.includes('statement_timeout=120s')); assert(fn.proconfig.includes('plan_cache_mode=force_custom_plan'));
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','ventas_es_otro_comercial(text,text)','EXECUTE') AS permitido")).rows[0].permitido,false);
  const controls = (await db.query(read('supabase/verificar_conciliacion_dashboard_2026.sql'))).rows;
  assert.equal(controls.length,66);
  assert(controls.every(r=>r.resultado==='COINCIDE' && r.registros_diferentes==='0'));
  const invoiceCheck = (await db.query(read('supabase/verificar_clasificacion_comercial_2026.sql'))).rows;
  assert.equal(invoiceCheck.length,3);
  assert.equal(invoiceCheck.find(r=>r.area_calculada==='otros').total_venta,'1');
  assert.equal(invoiceCheck.filter(r=>r.area_calculada==='repuestos').length,2);
  const diagnostic = (await db.query(read('supabase/diagnosticar_otros_comerciales_2026.sql'))).rows;
  assert.equal(diagnostic.find(r=>r.linea_id===uuid(1)).area_dashboard,'otros');
  assert.equal(diagnostic.find(r=>r.linea_id===uuid(13)).concepto_dashboard,'Otros');
  assert(!diagnostic.some(r=>r.linea_id===uuid(16))); // GRID no se muestra como venta adicional.
  await db.exec(migration); rows = await source(); assert.deepEqual(fingerprint(rows),fingerprint(before.filter(r=>r.id!==`historico:${uuid(7)}`)));
  console.log('OK: $1 envío, GRUPO FX, merchandising, NC, sin catálogo, Terceros OS, conciliación por ID/importes, originales intactos, permisos e idempotencia.');
} finally {
  await db.close();
}
