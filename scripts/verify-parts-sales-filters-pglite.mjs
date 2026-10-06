import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = process.argv[2] || process.env.PGLITE_PACKAGE_DIR;
const moduleSpecifier = packageDir
  ? pathToFileURL(path.join(packageDir, "dist", "index.js")).href
  : "@electric-sql/pglite";
const { PGlite } = await import(moduleSpecifier);
const db = new PGlite();

const migration = await readFile(
  path.join(scriptDir, "..", "supabase", "migrations", "20261006120000_add_parts_sales_advanced_filters.sql"),
  "utf8",
);

const value = async (sql, params = []) => {
  const result = await db.query(sql, params);
  const raw = result.rows[0]?.value;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
};

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE FUNCTION public.has_section_access(uuid, text) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE FUNCTION public.ventas_orden_natural(text) RETURNS text
      LANGUAGE sql IMMUTABLE AS $$ SELECT lower($1) $$;

    CREATE TABLE public.parts_fixture(
      id text PRIMARY KEY, fecha date NOT NULL, factura text, cliente text,
      sucursal text, metodologia text, codigo text, codigo_fabricante text,
      descripcion text, cantidad numeric, importe numeric NOT NULL,
      es_nota_credito boolean NOT NULL, documento text NOT NULL,
      marca text NOT NULL, vendedor text
    );

    CREATE FUNCTION public.ventas_repuestos_movimientos_v2(date,date,text,text)
    RETURNS TABLE(id text,fecha date,factura text,cliente text,sucursal text,
      metodologia text,codigo text,codigo_fabricante text,descripcion text,
      cantidad numeric,importe numeric,es_nota_credito boolean,documento text,
      marca text,vendedor text)
    LANGUAGE sql STABLE AS $$
      SELECT f.* FROM public.parts_fixture f
      WHERE f.fecha BETWEEN $1 AND $2
        AND (nullif(btrim($3),'') IS NULL OR f.sucursal=$3)
        AND (nullif(btrim($4),'') IS NULL OR concat_ws(' ',f.factura,f.cliente,
          f.codigo,f.codigo_fabricante,f.descripcion,f.vendedor) ILIKE '%'||btrim($4)||'%')
    $$;

    INSERT INTO public.parts_fixture
    SELECT 'CLAAS-ALICE-'||g, date '2026-09-01'+(g-1), 'F-'||g, 'CLIENTE-'||g,
      'ASUNCION', 'codigo', 'P-'||g, 'FAB-'||g, 'REPUESTO '||g,
      g::numeric, (g*10)::numeric, false, 'FACTURA:F-'||g, 'CLAAS', 'ALICE'
    FROM generate_series(1,12) g;
    INSERT INTO public.parts_fixture VALUES
      ('CLAAS-BOB','2026-09-15','F-BOB','CLIENTE BOB','ASUNCION','codigo','PB','FABB','BOB',1,900,false,'FACTURA:F-BOB','CLAAS','BOB'),
      ('HORSCH-ALICE','2026-09-16','F-H','CLIENTE H','SANTA RITA','codigo','PH','FABH','HORSCH',1,800,false,'FACTURA:F-H','HORSCH','ALICE'),
      ('OTHER-NONE','2026-09-17','F-O','CLIENTE O','ASUNCION','codigo','PO','FABO','OTRO',1,700,false,'FACTURA:F-O','OTROS',NULL),
      ('CLAAS-ALICE-LM','2026-08-10','F-LM','CLIENTE LM','ASUNCION','codigo','PLM','FABLM','ANTERIOR',1,55,false,'FACTURA:F-LM','CLAAS','ALICE'),
      ('CLAAS-ALICE-LY','2025-09-10','F-LY','CLIENTE LY','ASUNCION','codigo','PLY','FABLY','AÑO ANTERIOR',1,65,false,'FACTURA:F-LY','CLAAS','ALICE');
  `);

  await db.exec(migration);

  const overview = await value(
    `SELECT public.ventas_repuestos_panorama_filtros_v1(
      '2026-09-01','2026-09-30',NULL,NULL,'CLAAS','ALICE','mes') AS value`,
  );
  assert.equal(Number(overview.resumen.facturado), 780);
  assert.equal(Number(overview.resumen.documentos), 12);
  assert.equal(Number(overview.resumen.lineas), 12);
  assert.deepEqual(overview.por_marca.map((row) => row.marca), ["CLAAS"]);
  assert.deepEqual(overview.por_sucursal.map((row) => row.sucursal), ["ASUNCION"]);
  assert.equal(Number(overview.comparacion.facturado), 55);
  assert.equal(Number(overview.comparacion_ly.facturado), 65);

  const args = `'2026-09-01','2026-09-30',NULL,NULL,'CLAAS','ALICE','detalle'`;
  const page1 = await value(`SELECT public.ventas_repuestos_listado_filtros_v1(
    ${args},1,10,'facturado','desc',false) AS value`);
  const page2 = await value(`SELECT public.ventas_repuestos_listado_filtros_v1(
    ${args},2,10,'facturado','desc',false) AS value`);
  const exported = await value(`SELECT public.ventas_repuestos_listado_filtros_v1(
    ${args},1,10,'facturado','desc',true) AS value`);

  assert.equal(Number(page1.total), 12);
  assert.equal(Number(page1.paginas), 2);
  assert.equal(page1.filas.length, 10);
  assert.equal(page2.filas.length, 2);
  assert.equal(Number(page1.total_periodo), 780);
  assert.equal(exported.filas.length, 12);
  assert.equal(Number(exported.total), 12);
  assert.equal(Number(exported.paginas), 1);
  assert.deepEqual(
    exported.filas.map((row) => row.id),
    [...page1.filas, ...page2.filas].map((row) => row.id),
  );
  assert.ok(exported.filas.every((row) => row.marca === "CLAAS" && row.vendedor === "ALICE"));

  const withoutSeller = await value(`SELECT public.ventas_repuestos_listado_filtros_v1(
    '2026-09-01','2026-09-30',NULL,NULL,NULL,'Sin vendedor','detalle',1,10,'fecha','asc',true) AS value`);
  assert.equal(Number(withoutSeller.total), 1);
  assert.equal(withoutSeller.filas[0].id, "OTHER-NONE");

  console.log("PASS: PostgreSQL executed the migration; Marca/Vendedor constrain aggregates, comparisons, pagination and full export.");
} finally {
  await db.close();
}
