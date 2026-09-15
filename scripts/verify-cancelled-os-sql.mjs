// Only isolated PostgreSQL fixtures. Never connects to production.
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const migration=readFileSync('supabase/migrations/20260915130000_archive_confirmed_cancelled_service_order.sql','utf8');
const fixture=async () => {
  const db=new PGlite();
  await db.exec(`
    create table trabajos(id uuid primary key,os_numero text);
    create table ordenes_servicio_importadas(os_numero text primary key,cliente_nombre text,
      factura text,nro_chasis text,trabajo_id uuid,raw_data jsonb);
    create table ordenes_servicio_importadas_archivo(id uuid default gen_random_uuid(),
      os_numero text,registro jsonb,motivo text,archivado_por uuid);
    create table facturacion_lineas_importadas(id uuid primary key,factura text,codigo_interno_factura text,
      entidad_nombre text,fecha_factura timestamptz,raw_data jsonb,total_venta numeric);
    create table facturacion(id uuid primary key,cod_factura text,entidad_nombre text,fecha date,
      excluido_de_reportes boolean default false,total_venta numeric);
    create table comisiones_jornadas(id uuid primary key,os_numero text,vigente boolean default true,
      estado_validacion text default 'VALIDA',motivos_validacion text[] default '{}',actualizado_en timestamptz,
      horas_validas numeric);
    create table comisiones_liquidacion_detalle(id uuid primary key,jornada_id uuid);
    insert into ordenes_servicio_importadas values
      ('05-00000002','BUEN FUTURO S.A','0050010001425','000085',null,'{"import_era":"new"}'),
      ('OTHER','BUEN FUTURO S.A','0050010001426','000085',null,'{"import_era":"new"}');
    insert into comisiones_jornadas(id,os_numero,horas_validas) values
      ('00000000-0000-0000-0000-000000000001','05-00000002',8),
      ('00000000-0000-0000-0000-000000000002','OTHER',3);
  `);
  return db;
};
const count=async(db,table,where='true')=>(await db.query('select count(*)::int as n from '+table+' where '+where)).rows[0].n;
// Exact reported case: cancelled OS has only an old invoice number, not sales lines.
{
  const db=await fixture();
  await db.exec(migration);
  assert.equal(await count(db,'ordenes_servicio_importadas',"os_numero='05-00000002'"),0);
  assert.equal(await count(db,'ordenes_servicio_importadas',"os_numero='OTHER'"),1);
  const archive=(await db.query('select registro from ordenes_servicio_importadas_archivo')).rows[0].registro;
  assert.equal(archive.factura,'0050010001425'); assert.equal(archive.nro_chasis,'000085');
  assert.equal(archive.anulacion_confirmada.jornadas_originales[0].vigente,true);
  const j=(await db.query("select * from comisiones_jornadas where os_numero='05-00000002'")).rows[0];
  assert.equal(j.vigente,false); assert.equal(j.estado_validacion,'INVALIDA'); assert.equal(j.horas_validas,'8');
  assert.equal(await count(db,'comisiones_jornadas',"os_numero='OTHER' and vigente"),1);
  await db.exec(migration); assert.equal(await count(db,'ordenes_servicio_importadas_archivo'),1);
  await db.close();
}
// Any stale sales rows are archived first, then removed/excluded without touching other invoices.
{
  const db=await fixture();
  await db.exec(`
    insert into facturacion_lineas_importadas values
      ('00000000-0000-0000-0000-000000000010','005-001-0001425',null,'BUEN FUTURO S.A.','2026-08-01','{"linked_service_order":"05-00000002"}',100),
      ('00000000-0000-0000-0000-000000000011',null,'0050010001425','BUEN FUTURO S.A.','2026-08-01','{}',50),
      ('00000000-0000-0000-0000-000000000012','0050010001426',null,'BUEN FUTURO S.A.','2026-08-01','{"linked_service_order":"OTHER"}',200);
    insert into facturacion values
      ('00000000-0000-0000-0000-000000000020','0050010001425','BUEN FUTURO S.A.','2026-08-01',false,150),
      ('00000000-0000-0000-0000-000000000021','0050010001426','BUEN FUTURO S.A.','2026-08-01',false,200);
  `);
  await db.exec(migration);
  assert.equal(await count(db,'facturacion_lineas_importadas'),1);
  assert.equal(await count(db,'facturacion',"cod_factura='0050010001425' and excluido_de_reportes"),1);
  assert.equal(await count(db,'facturacion',"cod_factura='0050010001426' and not excluido_de_reportes"),1);
  const a=(await db.query('select registro from ordenes_servicio_importadas_archivo')).rows[0].registro.anulacion_confirmada;
  assert.equal(a.facturacion_lineas_originales.length,2); assert.equal(a.facturacion_resumen_original.length,1);
  assert.equal(a.facturacion_resumen_original[0].excluido_de_reportes,false);
  await db.close();
}
for (const [change,message] of [
  ["insert into ordenes_servicio_importadas select ' 05-00000002 ',cliente_nombre,factura,nro_chasis,trabajo_id,raw_data from ordenes_servicio_importadas where os_numero='05-00000002'",/más de un registro/],
  ["update ordenes_servicio_importadas set nro_chasis='85' where os_numero='05-00000002'",/Cambió la identidad/],
  ["update ordenes_servicio_importadas set cliente_nombre='Otro cliente' where os_numero='05-00000002'",/Cambió la identidad/],
  ["update ordenes_servicio_importadas set factura='0050010009999' where os_numero='05-00000002'",/Cambió la identidad/],
  ["insert into trabajos values('00000000-0000-0000-0000-000000000030','05-00000002')",/trabajo vinculado/],
  ["insert into comisiones_liquidacion_detalle values('00000000-0000-0000-0000-000000000040','00000000-0000-0000-0000-000000000001')",/comisión liquidada/],
  ["insert into facturacion_lineas_importadas values('00000000-0000-0000-0000-000000000050','0050010001425',null,'Otro cliente','2026-08-01','{}',100)",/otra identidad/],
  ["insert into facturacion_lineas_importadas values('00000000-0000-0000-0000-000000000050','0050010001425',null,'BUEN FUTURO S.A','2026-08-01','{\"linked_service_order\":\"OTHER\"}',100)",/otra identidad/],
]) {
  const db=await fixture(); await db.exec(change);
  await assert.rejects(()=>db.exec(migration),message);
  await db.exec('ROLLBACK');
  assert.equal(await count(db,'ordenes_servicio_importadas',"os_numero='05-00000002'"),1);
  assert.equal(await count(db,'ordenes_servicio_importadas_archivo'),0);
  assert.equal(await count(db,'comisiones_jornadas',"os_numero='05-00000002' and vigente"),1);
  await db.close();
}
console.log('Passed: exact cancellation with no sales rows, audited stale invoices, commissions deactivated, unrelated records preserved, idempotence, and rollback on changed identity/work/payment/conflicting invoices.');
