// Static contract check only: no database connection and no production records.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = "supabase/migrations/20261006120000_add_parts_sales_advanced_filters.sql";
const sql = readFileSync(file, "utf8");

for (const name of [
  "ventas_repuestos_movimientos_filtrados_v1",
  "ventas_repuestos_panorama_filtros_v1",
  "ventas_repuestos_listado_filtros_v1",
]) {
  assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`));
}

assert.match(sql, /m\.marca=upper\(btrim\(p_marca\)\)/);
assert.match(sql, /coalesce\(m\.vendedor,'Sin vendedor'\)=btrim\(p_vendedor\)/);
assert.equal((sql.match(/ventas_repuestos_movimientos_filtrados_v1\(/g) ?? []).length >= 3, true);
assert.match(sql, /GROUP BY GROUPING SETS\(\(\),\(periodo\),\(sucursal\),\(marca\)\)/);
assert.match(sql, /count\(DISTINCT cliente\) clientes,count\(DISTINCT documento\) documentos/);
assert.match(sql, /LIMIT CASE WHEN p_exportar THEN NULL ELSE v_size END/);
assert.match(sql, /total_periodo',coalesce\(\(SELECT sum\(importe\) FROM actual\),0\)/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.ventas_repuestos_listado_filtros_v1/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ventas_repuestos_panorama_filtros_v1[\s\S]*TO authenticated/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ventas_repuestos_listado_filtros_v1[\s\S]*TO authenticated/);
assert.doesNotMatch(sql, /INSERT INTO|UPDATE public\.|DELETE FROM/);

console.log("PASS: advanced parts filters are applied before aggregates, pagination and export; grants and read-only scope are explicit.");
