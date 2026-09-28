// PostgreSQL in memory, fictional data only. No network, imports or production writes.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE ?? 'output/sql-check/node_modules/@electric-sql/pglite/dist/index.js').href);
const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT CASE WHEN current_setting('fixture.logout',true)='on' THEN NULL::uuid ELSE '00000000-0000-0000-0000-000000000001'::uuid END $$;
    CREATE FUNCTION has_section_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $2='servicios.ventas' AND coalesce(current_setting('fixture.denied',true),'')<>'on' $$;
    CREATE FUNCTION ventas_tipo_tiempo_normalizado(text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce($1,'No informado') $$;
    CREATE FUNCTION ventas_servicios_texto_normalizado(text) RETURNS text LANGUAGE sql AS $$ SELECT upper(coalesce($1,'')) $$;
    CREATE TABLE ordenes_servicio_importadas(os_numero text,raw_data jsonb);
    CREATE TABLE comisiones_jornadas(os_numero text,tecnico_profile_id uuid,tecnico_nombre text,tipo_tiempo text,tipo_tiempo_importado text,horas_validas numeric,horas_calculadas numeric,horas_reportadas numeric,vigente boolean,estado_validacion text);
    INSERT INTO comisiones_jornadas VALUES
      ('OS-A',null,'Técnico A','Garantia','Cliente',35,null,null,true,'VALIDA'),
      ('OS-A',null,'Técnico B','Garantia',null,null,35,null,true,'VALIDA'),
      ('OS-A',null,'Técnico C','Garantia',null,null,null,35,true,'VALIDA'),
      ('OS-A',null,'Inválido','Garantia',null,200,null,null,true,'INVALIDA'),
      ('OS-A',null,'Viejo','Garantia',null,200,null,null,false,'VALIDA'),
      ('OS-A',null,'Otro tipo','Interno',null,8,null,null,true,'VALIDA'),
      ('OS-Z',null,'Técnico A','Cliente',null,4,null,null,true,'VALIDA'),
      ('OS-N',null,'Técnico A','Cliente',null,2,null,null,true,'VALIDA'),
      ('OS-U',null,'Sin horas','Cliente',null,0,null,null,true,'VALIDA');
    CREATE TABLE movimientos(fecha date,os_numero text,tipo_tiempo text,concepto text,total_venta numeric,sucursal text,marca_parque text,tipo_maquina text,texto_busqueda text,cliente text,factura text,es_nota_credito boolean,codigo text);
    CREATE FUNCTION ventas_servicios_movimientos_enriquecidos(date,date,text) RETURNS SETOF movimientos LANGUAGE sql STABLE AS $$ SELECT * FROM movimientos WHERE fecha BETWEEN $1 AND $2 AND ($3 IS NULL OR sucursal=$3) $$;
    INSERT INTO movimientos VALUES
      ('2026-09-18','OS-A','Garantia','Servicio',2100,'S1','Marca','Tipo','OS-A','Cliente A','00001',false,'MA01'),
      ('2026-09-25','OS-A','Garantia','Repuestos',500,'S1','Marca','Tipo','OS-A','Cliente A','00002',false,'REP1'),
      ('2026-09-25','OS-A','Garantia','Terceros',200,'S1','Marca','Tipo','OS-A','Cliente A','00002',false,'SE01'),
      ('2026-09-25','OS-Z','Cliente','Servicio',0,'S1','Marca','Tipo','OS-Z','Cliente Z','00003',false,'MA01'),
      ('2026-09-25','OS-N','Cliente','Servicio',100,'S1','Marca','Tipo','OS-N','Cliente N','00004',false,'MA01'),
      ('2026-09-25','OS-N','Cliente','Servicio',-100,'S1','Marca','Tipo','OS-N','Cliente N','00005',true,'MA01'),
      ('2026-09-25','OS-U','Cliente','Servicio',90,'S1','Marca','Tipo','OS-U','Cliente U','00006',false,'MA01'),
      ('2026-09-25',null,'Cliente','Servicio',50,'S1','Marca','Tipo','Sin OS','Cliente U','00007',false,'MA01');
  `);
  const load = async (file, name) => {
    const sql=readFileSync(file,'utf8');
    const start=sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
    assert.ok(start>=0,name);
    await db.exec(sql.slice(start,sql.indexOf('$$;',start)+3));
  };
  const migration=readFileSync('supabase/migrations/20260928150000_align_technician_hours_with_billed_labor.sql','utf8');
  await assert.rejects(db.exec(migration),/Aplicá primero/);
  await db.exec('ROLLBACK');
  const filters='supabase/migrations/20260917180000_service_sales_shared_filters.sql';
  for(const name of ['ventas_servicios_validar_filtros','ventas_servicios_codigo_filtro','ventas_servicios_cumple_filtros']) await load(filters,name);
  await load('supabase/migrations/20260915100000_unify_service_sales_identity_and_search.sql','ventas_servicios_tecnicos_v1');
  const call = async (desde='2026-09-01',filtros={},extra='') => (await db.query(`SELECT ventas_servicios_tecnicos_v2($1::date,'2026-09-30',p_filtros=>$2::jsonb${extra}) result`,[desde,JSON.stringify(filtros)])).rows[0].result;
  const old = async () => (await db.query("SELECT ventas_servicios_tecnicos_v1('2026-09-01','2026-09-30') result")).rows[0].result;
  const before=await old();
  const sourceBefore=await db.query('SELECT (SELECT jsonb_agg(j) FROM comisiones_jornadas j) jornadas,(SELECT jsonb_agg(m) FROM movimientos m) movimientos');
  await db.exec(migration); await db.exec(migration);
  const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row[key]??0),0);
  const full=await call();
  assert.equal(sum(full,'mo_total'),sum(before,'mo_total'));
  for(const name of ['Técnico A','Técnico B','Técnico C']) assert.equal(full.find(row=>row.tecnico===name).mo_garantia,700);
  assert.ok(!full.some(row=>['Inválido','Viejo'].includes(row.tecnico)));
  const later=await call('2026-09-21',{os:'OS-A'});
  assert.equal(later.length,4); // Includes a different time type as context, not discarded.
  for(const row of later) {
    assert.equal(row.total_horas,null);
    assert.equal(row.mo_total,0);
    assert.equal(row.detalle_os.length,1); // Two non-labor financial lines do not duplicate hours.
    assert.equal(row.detalle_os[0].mo_periodo,null);
    assert.equal(row.detalle_os[0].tiene_mo,false);
  }
  assert.equal(later.find(row=>row.tecnico==='Técnico A').detalle_os[0].horas_os,35);
  const zero=await call('2026-09-21',{os:'OS-Z'});
  assert.equal(zero[0].total_horas,4); assert.equal(zero[0].detalle_os[0].mo_periodo,0);
  const offset=await call('2026-09-21',{os:'OS-N'});
  assert.equal(offset[0].total_horas,2); assert.equal(offset[0].mo_total,0); assert.equal(offset[0].detalle_os[0].tiene_mo,true);
  const nc=await call('2026-09-01',{documento:'nc'});
  assert.equal(nc[0].mo_total,-100); assert.equal(nc[0].total_horas,2);
  const unassigned=full.find(row=>row.tecnico_clave==='SIN_TECNICO_ATRIBUIDO');
  assert.equal(unassigned.mo_total,140); assert.equal(unassigned.total_horas,null); assert.equal(unassigned.detalle_os.length,2);
  assert.ok(unassigned.detalle_os.some(row=>row.os_numero===null));
  assert.equal(full.find(row=>row.tecnico==='Sin horas').total_horas,0);
  assert.equal(full.find(row=>row.tecnico==='Otro tipo').total_horas,null);
  assert.equal((await call('2026-09-01',{},",p_tipo_tiempo=>'Garantia'")).length,3);
  for(const extra of [",p_sucursal=>'S2'",",p_marca=>'Otra'",",p_tipo_maquina=>'Otro'",",p_buscar=>'NADA'"]) assert.deepEqual(await call('2026-09-01',{},extra),[]);
  for(const filter of [{factura:'00002'},{codigo:'REP1'},{componente:'Repuestos'},{cliente:'Cliente A',documento:'factura'}]) {
    const rows=await call('2026-09-21',filter);
    assert.equal(sum(rows,'mo_total'),0); assert.equal(rows.find(row=>row.tecnico==='Técnico A').detalle_os[0].horas_os,35);
  }
  for(const bad of [{documento:'other'},{cliente:123},{bad:'x'},null]) await assert.rejects(call('2026-09-01',bad),/inválid/);
  await assert.rejects(call('2026-10-01'),/Rango/); await assert.rejects(call(null),/Rango/);
  for(const setting of ['fixture.denied','fixture.logout']) {
    await db.exec(`SET ${setting}='on'`); await assert.rejects(call(),/No tenes acceso/); await db.exec(`SET ${setting}='off'`);
  }
  const permission=(await db.query("SELECT NOT has_function_privilege('anon','ventas_servicios_tecnicos_v2(date,date,text,text,text,text,text,jsonb)','EXECUTE') AND has_function_privilege('authenticated','ventas_servicios_tecnicos_v2(date,date,text,text,text,text,text,jsonb)','EXECUTE') ok")).rows[0].ok;
  assert.equal(permission,true);
  assert.deepEqual(await old(),before);
  assert.deepEqual(await db.query('SELECT (SELECT jsonb_agg(j) FROM comisiones_jornadas j) jornadas,(SELECT jsonb_agg(m) FROM movimientos m) movimientos'),sourceBefore);
  console.log('PASS: period cohort, full hours retained, exact MO reconciliation, zero/NC, unassigned, manual types, filters, permissions, idempotence and sources unchanged.');
} finally { await db.close(); }
