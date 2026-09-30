// Isolated PostgreSQL regression test. It never connects to the application DB.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migrationUrl = new URL("../supabase/migrations/20260930120000_optimize_machine_order_confirmed_billing.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");
const ids = Array.from({ length: 8 }, (_, index) => `00000000-0000-0000-0000-00000000010${index + 1}`);

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('app.test_user_id', true), '')::uuid
    $$;
    CREATE FUNCTION public.has_module_access(uuid, text) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT $1 IS NOT NULL AND $2 = 'parque' $$;
    CREATE FUNCTION public.normalizar_chasis_notificacion(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$
      SELECT nullif(regexp_replace(upper(coalesce($1, '')), '[^A-Z0-9]', '', 'g'), '')
      $$;
    CREATE FUNCTION public.extraer_chasis_venta_maquina(text, jsonb, text DEFAULT NULL)
      RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce($2 ->> 'CHASIS', substring($1 from '(?i)CHASIS[[:space:]]*:[[:space:]]*([A-Z0-9-]+)'))
      $$;

    CREATE TABLE public.maquinaria_operaciones(id uuid PRIMARY KEY, np_fecha date);
    CREATE TABLE public.maquinaria_operacion_lineas(
      id uuid PRIMARY KEY, operacion_id uuid REFERENCES public.maquinaria_operaciones
    );
    CREATE TABLE public.maquinaria_unidades_operacion(
      id uuid PRIMARY KEY, linea_id uuid REFERENCES public.maquinaria_operacion_lineas, chasis text
    );
    CREATE TABLE public.parque_stock_maquinas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unidad_operacion_id uuid, chasis text, importado_en timestamptz
    );
    CREATE TABLE public.maquinaria_importacion_unidades(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unidad_id uuid, chasis text, activa boolean, actualizado_en timestamptz
    );
    CREATE TABLE public.facturacion_lineas_importadas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mercaderia text, observacion text,
      subgrupo_original text, raw_data jsonb DEFAULT '{}'::jsonb, cantidad numeric,
      total_venta numeric, grupo_normalizado text, cod_mercaderia text, fecha_factura timestamptz
    );

    INSERT INTO public.maquinaria_operaciones VALUES
      ('10000000-0000-0000-0000-000000000001', '2026-09-10'),
      ('10000000-0000-0000-0000-000000000002', NULL);
    INSERT INTO public.maquinaria_operacion_lineas VALUES
      ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
      ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002');
    INSERT INTO public.maquinaria_unidades_operacion(id, linea_id, chasis) VALUES
      ('${ids[0]}', '20000000-0000-0000-0000-000000000001', 'DIRECT-1'),
      ('${ids[1]}', '20000000-0000-0000-0000-000000000001', 'TOO-EARLY'),
      ('${ids[2]}', '20000000-0000-0000-0000-000000000001', NULL),
      ('${ids[3]}', '20000000-0000-0000-0000-000000000001', NULL),
      ('${ids[4]}', '20000000-0000-0000-0000-000000000001', 'CREDIT-ONLY'),
      ('${ids[5]}', '20000000-0000-0000-0000-000000000001', 'NOT-MACHINE'),
      ('${ids[6]}', '20000000-0000-0000-0000-000000000001', 'ZERO-SALE'),
      ('${ids[7]}', '20000000-0000-0000-0000-000000000002', NULL);
    INSERT INTO public.parque_stock_maquinas(unidad_operacion_id, chasis, importado_en) VALUES
      ('${ids[2]}', 'OLD-STOCK', '2026-08-01'), ('${ids[2]}', 'STOCK-3', '2026-09-20');
    INSERT INTO public.maquinaria_importacion_unidades(unidad_id, chasis, activa, actualizado_en) VALUES
      ('${ids[3]}', 'INACTIVE', false, '2026-09-25'), ('${ids[3]}', 'IMPORT-4', true, '2026-09-20');

    INSERT INTO public.facturacion_lineas_importadas(
      mercaderia, observacion, subgrupo_original, raw_data, cantidad,
      total_venta, grupo_normalizado, cod_mercaderia, fecha_factura
    ) VALUES
      ('Maquina', NULL, NULL, '{"CHASIS":"DIRECT-1"}', 1, 100, 'MAQUINARIAS', NULL, '2026-09-10'),
      ('Maquina', NULL, NULL, '{"CHASIS":"TOO-EARLY"}', 1, 100, 'MAQUINARIAS', NULL, '2026-09-09'),
      ('Maquina', NULL, NULL, '{"CHASIS":"STOCK-3"}', 1, 100, 'MAQUINARIAS', NULL, '2026-09-11'),
      ('Maquina', NULL, NULL, '{"CHASIS":"IMPORT-4"}', 1, 100, 'MAQUINARIAS', NULL, '2026-09-12'),
      ('Maquina', NULL, NULL, '{"CHASIS":"CREDIT-ONLY","canonical_document_kind":"NOTA_CREDITO"}', 1, 100, 'MAQUINARIAS', NULL, '2026-09-12'),
      ('Servicio', NULL, NULL, '{"CHASIS":"NOT-MACHINE"}', 1, 100, 'SERVICIOS', NULL, '2026-09-12'),
      ('Maquina', NULL, NULL, '{"CHASIS":"ZERO-SALE"}', 0, 0, 'MAQUINARIAS', NULL, '2026-09-12');

    CREATE FUNCTION public.maquinaria_unidad_tiene_venta_confirmada(p_unidad_id uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $$
      WITH unidad_objetivo AS (
        SELECT public.normalizar_chasis_notificacion(coalesce(
          nullif(btrim(unidad.chasis), ''), nullif(btrim(stock.chasis), ''), nullif(btrim(importacion.chasis), '')
        )) AS chasis_normalizado, operacion.np_fecha
        FROM public.maquinaria_unidades_operacion unidad
        JOIN public.maquinaria_operacion_lineas linea ON linea.id = unidad.linea_id
        JOIN public.maquinaria_operaciones operacion ON operacion.id = linea.operacion_id
        LEFT JOIN LATERAL (SELECT s.chasis FROM public.parque_stock_maquinas s WHERE s.unidad_operacion_id=unidad.id ORDER BY s.importado_en DESC NULLS LAST LIMIT 1) stock ON true
        LEFT JOIN LATERAL (SELECT i.chasis FROM public.maquinaria_importacion_unidades i WHERE i.unidad_id=unidad.id AND i.activa ORDER BY i.actualizado_en DESC NULLS LAST LIMIT 1) importacion ON true
        WHERE unidad.id=p_unidad_id
      )
      SELECT EXISTS (
        SELECT 1 FROM unidad_objetivo objetivo
        JOIN public.facturacion_lineas_importadas venta
          ON public.normalizar_chasis_notificacion(public.extraer_chasis_venta_maquina(
            concat_ws(' | ', venta.mercaderia, venta.observacion, venta.subgrupo_original), venta.raw_data,
            nullif(venta.raw_data ->> 'linked_service_order', '')
          ))=objetivo.chasis_normalizado
        WHERE objetivo.chasis_normalizado IS NOT NULL
          AND coalesce(venta.cantidad,0)>0 AND coalesce(venta.total_venta,0)>0
          AND upper(regexp_replace(coalesce(venta.raw_data->>'canonical_document_kind','FACTURA'),'[^A-Z0-9]','','g'))<>'NOTACREDITO'
          AND (upper(coalesce(venta.grupo_normalizado,''))='MAQUINARIAS'
            OR upper(coalesce(venta.raw_data->>'canonical_line_type',''))='MAQUINARIAS'
            OR left(upper(coalesce(venta.cod_mercaderia,'')),5)='VEIC_'
            OR concat_ws(' | ',venta.mercaderia,venta.observacion,venta.subgrupo_original) ~* '(TIPO|MODELO)[[:space:]]*:.*(CHASIS|CASIS|SERIE)[[:space:]]*:')
          AND venta.fecha_factura IS NOT NULL
          AND (objetivo.np_fecha IS NULL OR venta.fecha_factura::date>=objetivo.np_fecha)
      )
    $$;
    CREATE FUNCTION public.legacy_confirmadas(p_unidad_ids uuid[])
    RETURNS TABLE(unidad_id uuid) LANGUAGE sql STABLE AS $$
      SELECT solicitada.unidad_id
      FROM unnest(coalesce(p_unidad_ids, ARRAY[]::uuid[])) solicitada(unidad_id)
      WHERE public.maquinaria_unidad_tiene_venta_confirmada(solicitada.unidad_id)
    $$;
  `);

  await db.exec("SELECT set_config('app.test_user_id', '99999999-0000-0000-0000-000000000001', false)");
  const requested = [ids[0], ids[0], ...ids.slice(1)];
  const beforeCounts = (await db.query(`SELECT
    (SELECT count(*) FROM maquinaria_unidades_operacion) AS unidades,
    (SELECT count(*) FROM facturacion_lineas_importadas) AS ventas,
    (SELECT count(*) FROM parque_stock_maquinas) AS stock,
    (SELECT count(*) FROM maquinaria_importacion_unidades) AS importaciones`)).rows[0];
  const legacy = (await db.query("SELECT unidad_id::text FROM public.legacy_confirmadas($1::uuid[])", [requested])).rows.map(row => row.unidad_id);

  await db.exec(migration);
  const optimized = (await db.query("SELECT unidad_id::text FROM public.maquinaria_unidades_facturadas_confirmadas($1::uuid[])", [requested])).rows.map(row => row.unidad_id);
  assert.deepEqual(optimized, legacy, "The set-based RPC must preserve legacy results and duplicate input order");
  assert.deepEqual(optimized, [ids[0], ids[0], ids[2], ids[3]]);
  assert.deepEqual((await db.query(`SELECT
    (SELECT count(*) FROM maquinaria_unidades_operacion) AS unidades,
    (SELECT count(*) FROM facturacion_lineas_importadas) AS ventas,
    (SELECT count(*) FROM parque_stock_maquinas) AS stock,
    (SELECT count(*) FROM maquinaria_importacion_unidades) AS importaciones`)).rows[0], beforeCounts, "Migration must not mutate business rows");
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i, "Migration must contain no data writes");
  assert.doesNotMatch(migration.split("AS $$")[1], /maquinaria_unidad_tiene_venta_confirmada/, "Batch RPC must not call the scalar full-scan helper");

  await db.exec("SELECT set_config('app.test_user_id', '', false)");
  await assert.rejects(
    db.query("SELECT * FROM public.maquinaria_unidades_facturadas_confirmadas($1::uuid[])", [requested]),
    /Sin permiso para consultar operaciones de maquinas/,
  );
  await db.exec("SELECT set_config('app.test_user_id', '99999999-0000-0000-0000-000000000001', false)");

  const started = performance.now();
  for (let i = 0; i < 25; i += 1) {
    await db.query("SELECT * FROM public.maquinaria_unidades_facturadas_confirmadas($1::uuid[])", [requested]);
  }
  const elapsed = performance.now() - started;
  console.log(`PASS: semantic equivalence, authorization clause, duplicate order, stock/import fallback, no DML. Isolated 25-call smoke: ${elapsed.toFixed(1)} ms.`);
} finally {
  await db.close();
}
