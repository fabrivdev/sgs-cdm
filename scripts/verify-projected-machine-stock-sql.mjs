import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migration = fileURLToPath(new URL("../supabase/migrations/20260923190000_add_projected_machine_stock.sql", import.meta.url));
const sql = await readFile(migration, "utf8");
const values = sql.slice(sql.indexOf("VALUES\n", sql.indexOf("INSERT INTO public.parque_stock_proyectado_apertura")), sql.indexOf("ON CONFLICT", sql.indexOf("INSERT INTO public.parque_stock_proyectado_apertura")));
const rows = [...values.matchAll(/\('2026-08-31','([^']+)','([^']+)','([^']+)','([^']+)',(\d+),(\d+),(\d+),'[^']+'\)/g)]
  .map((match) => ({ program: match[1], stock: Number(match[5]), purchases: Number(match[6]), pending: Number(match[7]) }));

assert.equal(rows.length, 30, "La apertura debe contener las 30 filas del Excel");
const totals = (program) => rows.filter((row) => row.program === program).reduce((sum, row) => ({
  stock: sum.stock + row.stock,
  purchases: sum.purchases + row.purchases,
  pending: sum.pending + row.pending,
}), { stock: 0, purchases: 0, pending: 0 });
assert.deepEqual(totals("CLAAS"), { stock: 18, purchases: 21, pending: 8 });
assert.deepEqual(totals("HORSCH"), { stock: 18, purchases: 4, pending: 2 });
assert.match(sql, /p_corte < v_apertura/);
assert.match(sql, /l\.condicion='NUEVA'/);
assert.match(sql, /ventas_maquinas_fuente_v2/);
assert.match(sql, /p\.condicion,p\.np_fecha/);
assert.match(sql, /LIKE '%USAD%' THEN false/);
assert.match(sql, /LIKE '%NUEV%' THEN true/);
assert.match(sql, /stock\+pedidos_compra-ventas_pendientes AS stock_proyectado/);
assert.match(sql, /parque_stock_proyectado_ajustes/);

console.log("Stock proyectado SQL: apertura y reglas verificadas");
