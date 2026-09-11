// Run from repo root after:
// npm install --prefix output/sql-check @electric-sql/pglite --no-save --package-lock=false
// Uses only an isolated in-memory PostgreSQL fixture.
import { PGlite } from "../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create type public.app_role as enum ('admin', 'superadmin', 'cabecilla');
  create function auth.uid() returns uuid language sql as
    $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
  create function public.has_role(uuid, public.app_role) returns boolean language sql as
    $$ select true $$;

  create table public.profiles (id uuid primary key);
  insert into public.profiles values ('00000000-0000-0000-0000-000000000001');

  create table public.importaciones (
    id uuid primary key,
    origen_sistema text,
    metadata jsonb not null default '{}'::jsonb
  );
  insert into public.importaciones (id, origen_sistema) values
    ('00000000-0000-0000-0000-000000000010', 'new_xml_ordenes_servicio');

  create table public.trabajos (id uuid primary key);
  insert into public.trabajos values ('00000000-0000-0000-0000-000000000020');

  create table public.ordenes_servicio_importadas (
    os_numero text primary key,
    trabajo_id uuid references public.trabajos(id),
    factura text,
    situacion_facturacion text,
    nro_chasis text,
    fecha_abierta_os timestamptz,
    fecha_cierre_os timestamptz,
    fecha_emision_factura timestamptz,
    raw_data jsonb not null default '{}'::jsonb
  );

  create table public.comisiones_jornadas (
    id uuid primary key,
    os_numero text not null,
    vigente boolean not null default true,
    actualizado_en timestamptz not null default now()
  );
  create table public.comisiones_liquidacion_detalle (
    id uuid primary key,
    jornada_id uuid not null references public.comisiones_jornadas(id)
  );

  insert into public.ordenes_servicio_importadas values
    ('01-00000110', null, null, null, '49300313', '2026-08-13', null, null, '{"import_era":"new"}'),
    ('01-00000165', null, '0010010004993', 'Facturada', '49300313', '2026-08-16', null, '2026-08-28', '{"import_era":"new"}');
  insert into public.comisiones_jornadas (id, os_numero) values
    ('00000000-0000-0000-0000-000000000110', '01-00000110');
`);

await db.exec(readFileSync(
  "supabase/migrations/20260911190000_reconcile_service_order_snapshot.sql",
  "utf8",
));

assert.equal(
  (await db.query("select count(*)::int as n from ordenes_servicio_importadas where os_numero='01-00000110'")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int as n from ordenes_servicio_importadas_archivo where os_numero='01-00000110'")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select vigente from comisiones_jornadas where os_numero='01-00000110'")).rows[0].vigente,
  false,
);

await db.exec(`
  insert into public.ordenes_servicio_importadas values
    ('01-00000120', null, null, null, 'SAFE', '2026-08-10', null, null, '{"import_era":"new"}'),
    ('01-00000121', null, 'FAC-121', null, 'INVOICE', '2026-08-10', null, null, '{"import_era":"new"}'),
    ('01-00000122', '00000000-0000-0000-0000-000000000020', null, null, 'WORK', '2026-08-10', null, null, '{"import_era":"new"}'),
    ('01-00000123', null, null, null, 'PAID', '2026-08-10', null, null, '{"import_era":"new"}'),
    ('01-00000124', null, null, null, 'PRESENT', '2026-08-10', null, null, '{"import_era":"new"}'),
    ('LEGACY-1', null, null, null, 'LEGACY', '2026-08-10', null, null, '{}'),
    ('01-OUTSIDE', null, null, null, 'OUTSIDE', '2026-06-30', null, null, '{"import_era":"new"}');

  insert into public.comisiones_jornadas (id, os_numero) values
    ('00000000-0000-0000-0000-000000000120', '01-00000120'),
    ('00000000-0000-0000-0000-000000000123', '01-00000123');
  insert into public.comisiones_liquidacion_detalle values
    ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000123');
`);

const result = (await db.query(`
  select public.ordenes_servicio_reconciliar_snapshot(
    '00000000-0000-0000-0000-000000000010',
    '2026-07-01',
    '2026-09-30',
    array['01-00000165', '01-00000124']
  ) as value
`)).rows[0].value;

assert.equal(result.ausentes, 4);
assert.equal(result.archivadas, 1);
assert.equal(result.bloqueadas, 3);
assert.equal(result.jornadas_desactivadas, 1);
assert.equal(
  (await db.query("select vigente from comisiones_jornadas where os_numero='01-00000120'")).rows[0].vigente,
  false,
);
assert.equal(
  (await db.query("select count(*)::int as n from ordenes_servicio_importadas where os_numero in ('01-00000121','01-00000122','01-00000123','01-00000124','LEGACY-1','01-OUTSIDE')")).rows[0].n,
  6,
);
await assert.rejects(
  () => db.query(`select public.ordenes_servicio_reconciliar_snapshot(
    '00000000-0000-0000-0000-000000000010', '2026-07-01', '2026-09-30', '{}'
  )`),
  /foto de OS vacia/,
);

await db.close();
console.log("SQL passed: exact correction, archive, safe snapshot reconciliation and commission guards.");
