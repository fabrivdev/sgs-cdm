import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid $$;
    CREATE FUNCTION public.has_module_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.maquinaria_puede_gestionar_flujo() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.maquinaria_importacion_unidades (id uuid PRIMARY KEY, importacion_linea_id uuid NOT NULL, numero_unidad integer NOT NULL, activa boolean NOT NULL);
    CREATE TABLE public.maquinaria_documentos (id uuid PRIMARY KEY, importacion_linea_id uuid, tipo text NOT NULL);
    CREATE UNIQUE INDEX maquinaria_documentos_importacion_unico_idx ON public.maquinaria_documentos(importacion_linea_id,tipo)
      WHERE importacion_linea_id IS NOT NULL AND tipo IN ('OC','FACTURA_IMPORTACION');
  `);
  const one = '11111111-1111-1111-1111-111111111111';
  const many = '22222222-2222-2222-2222-222222222222';
  const oldOne = '33333333-3333-3333-3333-333333333333';
  const oldMany = '44444444-4444-4444-4444-444444444444';
  const second = '55555555-5555-5555-5555-555555555555';
  const units = Array.from({length: 8}, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12,'0')}`);
  await db.query('INSERT INTO maquinaria_importacion_unidades VALUES ($1,$2,1,true)', [oldOne,one]);
  for (let index = 0; index < 8; index++) await db.query('INSERT INTO maquinaria_importacion_unidades VALUES ($1,$2,$3,true)', [units[index],many,index + 1]);
  await db.query("INSERT INTO maquinaria_documentos VALUES ($1,$2,'FACTURA_IMPORTACION'),($3,$4,'FACTURA_IMPORTACION')", [oldOne,one,oldMany,many]);
  const migration = await readFile(new URL('../supabase/migrations/20261014120000_link_supplier_invoice_documents_to_import_units.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  let result = await db.query('SELECT documento_id,importacion_unidad_id FROM maquinaria_documentos_factura_importacion_unidades');
  assert.deepEqual(result.rows, [{documento_id: oldOne, importacion_unidad_id: oldOne}]);
  await db.query("INSERT INTO maquinaria_documentos VALUES ($1,$2,'FACTURA_IMPORTACION')", [second,many]);
  result = await db.query('SELECT maquinaria_vincular_documento_factura_importacion($1,$2::uuid[]) AS count', [oldMany, units.slice(0,5)]);
  assert.equal(result.rows[0].count, 5);
  result = await db.query('SELECT importacion_unidad_id FROM maquinaria_documentos_factura_importacion_unidades WHERE documento_id=$1 ORDER BY importacion_unidad_id', [oldMany]);
  assert.deepEqual(result.rows.map(row => row.importacion_unidad_id), units.slice(0,5));
  await assert.rejects(db.query('SELECT maquinaria_vincular_documento_factura_importacion($1,$2::uuid[])', [second,[units[4]]]), /otro archivo/);
  result = await db.query('SELECT count(*)::int AS count FROM maquinaria_documentos');
  assert.equal(result.rows[0].count, 3);
  console.log('OK: una factura cubre 5 de 8; históricos múltiples quedan sin asignar y no se pierden archivos');
} finally {
  await db.close();
}
