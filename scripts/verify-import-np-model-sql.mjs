// Isolated PostgreSQL test; never connects to the application database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';

const oldSql = readFileSync(new URL('../supabase/migrations/20260907180000_match_import_stock_by_chassis.sql', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/migrations/20260916100000_use_linked_np_model_in_imports.sql', import.meta.url), 'utf8');
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE authenticated;
    CREATE FUNCTION public.normalizar_chasis_notificacion(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT nullif(btrim($1), '') $$;`);
  // Reproduce the old view's dependencies and column types needed by this test.
  for (const [alias, table] of Object.entries({
    i: 'maquinaria_importacion_lineas', u: 'maquinaria_importacion_unidades',
    o: 'maquinaria_operaciones', l: 'maquinaria_operacion_lineas',
    uo: 'maquinaria_unidades_operacion', c: 'clientes',
    st: 'maquinaria_stock_trazabilidad', p: 'parque_maquinas',
  })) {
    const columns = new Set([...(oldSql + sql).matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))].map(match => match[1]));
    if (alias === 'st') for (const name of ['sucursal', 'deposito', 'saldo_actual', 'disponibilidad_detalle']) columns.add(name);
    await db.exec(`CREATE TABLE public.${table} (${[...columns].map(name => `"${name}" ${['activa', 'vinculo_manual', 'detalle_manual'].includes(name) ? 'boolean' : 'text'}`).join(', ')});`);
  }
  await db.exec(oldSql);
  await db.exec(`
    INSERT INTO maquinaria_operacion_lineas (id, modelo, marca, subgrupo) VALUES
      ('np-line', 'MAESTRO CF 14.50', 'HORSCH', 'SEMBRADORAS'), ('blank-line', '  ', 'HORSCH', 'SEMBRADORAS');
    INSERT INTO maquinaria_importacion_lineas (id, modelo, cantidad, oc, po, producto, marca_importacion) VALUES
      ('import', 'MAESTRO 14 CF E50', '3', 'OC42', 'PO42', 'SEMBRADORAS', 'HORSCH');
    INSERT INTO maquinaria_importacion_unidades (id, importacion_linea_id, linea_id, activa, estado_fuente, eta, chasis) VALUES
      ('linked', 'import', 'np-line', true, 'COMPLETADO', '2026-08-01', '49300313'),
      ('unlinked', 'import', null, true, 'PLANIFICADO', null, null),
      ('blank', 'import', 'blank-line', true, 'EN_TRANSITO', '2026-09-01', null),
      ('inactive', 'import', 'np-line', false, 'CANCELADA', null, null);
  `);
  const before = (await db.query('SELECT * FROM maquinaria_importacion_unidades_operativas ORDER BY id')).rows;
  await db.exec(sql);
  await db.exec(sql); // Safe to paste again.
  const after = (await db.query('SELECT * FROM maquinaria_importacion_unidades_operativas ORDER BY id')).rows;
  assert.equal(after.length, 3);
  for (const [index, row] of after.entries()) {
    const { modelo, modelo_original, ...unchanged } = row;
    const { modelo: oldModel, ...oldUnchanged } = before[index];
    assert.deepEqual(unchanged, oldUnchanged, 'No business metadata, quantities or states changed');
    assert.equal(modelo_original, oldModel);
    assert.equal(modelo, row.id === 'linked' ? 'MAESTRO CF 14.50' : oldModel);
  }
  await db.exec("UPDATE maquinaria_operacion_lineas SET modelo = 'MAESTRO CF 14.45' WHERE id = 'np-line'");
  assert.equal((await db.query("SELECT modelo FROM maquinaria_importacion_unidades_operativas WHERE id = 'linked'")).rows[0].modelo, 'MAESTRO CF 14.45');
  assert.equal((await db.query('SELECT modelo FROM maquinaria_importacion_lineas')).rows[0].modelo, 'MAESTRO 14 CF E50');
  console.log('PASS: linked NP model, blank/unlinked fallback, inactive units, original preserved, live NP correction, unchanged business metadata, repeatable migration.');
} finally {
  await db.close();
}
