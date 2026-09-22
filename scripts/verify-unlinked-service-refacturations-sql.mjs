import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../output/sql-check/node_modules/@electric-sql/pglite/dist/index.js';

const sql = readFileSync(
  new URL('../supabase/migrations/20260922130000_include_unlinked_service_refacturations.sql', import.meta.url),
  'utf8',
);

assert.match(sql, /\^008\[\[:space:\]\]\*-.+SE\(R\)\?VICIOS/);
assert.match(sql, /ventas_es_otro_comercial/);
assert.match(sql, /m\.concepto,m\.codigo,m\.descripcion,m\.raw_data/);
assert.match(sql, /then 'servicios'[\s\S]+then 'revision'/);
assert.match(sql, /b\.metodologia='actual' AND NOT b\.vinculada_os/);
assert.match(sql, /ventas_tipo_tiempo_refacturacion_cliente/);
assert.match(sql, /s\.metodologia='actual' AND s\.area_calculada='servicios'/);
assert.match(sql, /cliente !~ '\^CAMPOS DEL MANANA\( \|\$\)'/);

for (const forbidden of ['0020010003245', 'CAMPOS DEL LAGO', 'SANCOR SEGUROS']) {
  assert.equal(sql.includes(forbidden), false, `La migracion no debe codificar el caso ${forbidden}`);
}

console.log('OK: refacturaciones 008 sin OS entran en Servicios sin abrir Otros ni codificar una factura puntual.');

const db = new PGlite();
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE FUNCTION public.valor_json_insensible(jsonb,text[]) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$
      SELECT value FROM jsonb_each_text($1) d
      WHERE lower(d.key) IN (SELECT lower(unnest($2))) LIMIT 1 $$;
    CREATE FUNCTION public.ventas_es_otro_comercial(text,text) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$
      SELECT lower(translate(concat_ws(' ',$1,$2),'áéíóúÁÉÍÓÚ','aeiouAEIOU')) ~
        '(costos?|gastos?|cargos?|tasas?)[[:space:]]+(de[[:space:]]+)?envios?|interes(es)?|merchand|merchad' $$;
    CREATE FUNCTION public.ventas_tipo_tiempo_normalizado(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT CASE
        WHEN upper(coalesce($1,'')) LIKE '%GARANT%' THEN 'Garantia'
        WHEN upper(coalesce($1,'')) LIKE '%INTERN%' THEN 'Interno'
        WHEN upper(coalesce($1,'')) LIKE '%CLIENT%' THEN 'Cliente'
        ELSE 'No informado' END $$;
    CREATE FUNCTION public.ventas_servicios_texto_normalizado(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT upper(translate(btrim(coalesce($1,'')),'ÑÁÉÍÓÚ','NAEIOU')) $$;
    CREATE FUNCTION public.cliente_nombre_canonico(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT upper(btrim($1)) $$;

    CREATE TABLE movimientos_prueba(
      concepto text,metodologia text,vinculada_os boolean,es_nota_credito boolean,
      codigo text,descripcion text,raw_data jsonb
    );
    CREATE FUNCTION public.ventas_area_movimientos_base(date,date,text,text)
    RETURNS TABLE(area_calculada text) LANGUAGE sql AS $$
      select case
        when m.metodologia = 'historico' then 'otros'
        when m.concepto = 'Maquinarias' then 'maquinas'
        when m.concepto = 'Otros' then 'otros'
        when m.vinculada_os then 'servicios'
        when m.concepto = 'Repuestos' then 'repuestos'
        when m.es_nota_credito and m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'servicios'
        when m.concepto in ('Servicio', 'Kilometraje', 'Terceros') then 'revision'
        else 'otros'
      end as area_calculada
      from movimientos_prueba m
    $$;

    CREATE TABLE enriquecidos_prueba(
      metodologia text,vinculada_os boolean,concepto text,cliente text,
      tipo_linea text,tipo_canonico text,tipo_os text
    );
    CREATE FUNCTION public.ventas_servicios_movimientos_enriquecidos(date,date,text)
    RETURNS TABLE(tipo_tiempo text,dummy text) LANGUAGE sql AS $$
      SELECT public.ventas_tipo_tiempo_normalizado(coalesce(nullif(fl.tipo_tiempo,''),
          nullif(fl.raw_data->>'canonical_time_type',''),os.tipo_tiempo)) AS tipo_tiempo,
        b.cliente AS dummy
      FROM enriquecidos_prueba b
      LEFT JOIN LATERAL (SELECT b.tipo_linea AS tipo_tiempo,
        jsonb_build_object('canonical_time_type',b.tipo_canonico) AS raw_data) fl ON true
      LEFT JOIN LATERAL (SELECT b.tipo_os AS tipo_tiempo) os ON true
    $$;

    CREATE TABLE dashboard_prueba(
      metodologia text,area_calculada text,cliente text,tipo_tiempo text,raw_data jsonb
    );
    CREATE FUNCTION public.dashboard_facturacion_fuente_v1(date,date)
    RETURNS TABLE(tipo_tiempo text,dummy text) LANGUAGE sql AS $$
      SELECT CASE WHEN false THEN NULL
    WHEN s.metodologia='actual' THEN nullif(btrim(f.tipo_tiempo::text),'')
    WHEN s.area_calculada='repuestos' THEN nullif(btrim(f.tipo_tiempo::text),'')
    ELSE NULL END AS tipo_tiempo,
        s.cliente AS dummy
      FROM dashboard_prueba s
      LEFT JOIN LATERAL (SELECT s.tipo_tiempo,s.raw_data) f ON true
    $$;
  `);

  await db.exec(sql);
  const eligible = async (concepto, grupo, codigo, descripcion) => (await db.query(
    'SELECT public.ventas_es_refacturacion_servicio_sin_os($1,$2,$3,jsonb_build_object(\'GRUPO\',$4::text)) AS ok',
    [concepto,codigo,descripcion,grupo],
  )).rows[0].ok;
  assert.equal(await eligible('Servicio','008 - SEVICIOS','SRV000006','SERVICIO DE MANO DE OBRA'),true);
  assert.equal(await eligible('Kilometraje','008 - SERVICIOS','SRV000001','KILOMETRAJE'),true);
  assert.equal(await eligible('Servicio','SERVICIOS - OTROS','ENVIO','COSTO DE ENVIO'),false);
  assert.equal(await eligible('Servicio','008 - SERVICIOS','INT','INTERESES COBRADOS'),false);
  assert.equal(await eligible('Servicio','SERVICE - CLAAS','MA01','MANO DE OBRA'),false);

  await db.exec(`
    INSERT INTO movimientos_prueba VALUES
      ('Servicio','actual',false,false,'SRV000006','SERVICIO DE MANO DE OBRA','{"GRUPO":"008 - SEVICIOS"}'),
      ('Kilometraje','actual',false,false,'SRV000001','KILOMETRAJE','{"GRUPO":"008 - SERVICIOS"}'),
      ('Servicio','actual',false,false,'MA01','MANO DE OBRA','{"GRUPO":"SERVICE - CLAAS"}');
    INSERT INTO enriquecidos_prueba VALUES
      ('actual',false,'Servicio','CLIENTE EXTERNO',null,null,null),
      ('actual',false,'Kilometraje','CAMPOS DEL MAÑANA S.A.',null,null,null),
      ('actual',false,'Servicio','CLIENTE EXTERNO','Garantia',null,null);
    INSERT INTO dashboard_prueba VALUES
      ('actual','servicios','CLIENTE EXTERNO','Desconocido','{}'),
      ('actual','servicios','CAMPOS DEL MAÑANA S.A.',null,'{}'),
      ('actual','servicios','CLIENTE EXTERNO','Garantia','{}');
  `);
  const areas = (await db.query("SELECT area_calculada FROM ventas_area_movimientos_base('2026-01-01','2026-12-31',null,null)")).rows;
  assert.deepEqual(areas.map((row) => row.area_calculada),['servicios','servicios','revision']);
  const tiempos = (await db.query("SELECT tipo_tiempo FROM ventas_servicios_movimientos_enriquecidos('2026-01-01','2026-12-31',null)")).rows;
  assert.deepEqual(tiempos.map((row) => row.tipo_tiempo),['Cliente','No informado','Garantia']);
  const dashboard = (await db.query("SELECT tipo_tiempo FROM dashboard_facturacion_fuente_v1('2026-01-01','2026-12-31')")).rows;
  assert.deepEqual(dashboard.map((row) => row.tipo_tiempo),['Cliente','No informado','Garantia']);

  await db.exec(sql);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM ventas_area_movimientos_base('2026-01-01','2026-12-31',null,null) WHERE area_calculada='servicios'")).rows[0].n,2);
  console.log('OK: migracion ejecutable e idempotente; MO/Km 008 sin OS entran, grupo generico queda en revision y tipos explicitos prevalecen.');
} finally {
  await db.close();
}
