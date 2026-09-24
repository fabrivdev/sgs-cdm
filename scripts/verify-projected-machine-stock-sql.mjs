import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const migration = fileURLToPath(new URL("../supabase/migrations/20260923190000_add_projected_machine_stock.sql", import.meta.url));
const sql = await readFile(migration, "utf8");
const correctionMigration = fileURLToPath(new URL("../supabase/migrations/20260923200000_fix_projected_stock_pending_sales.sql", import.meta.url));
const correction = await readFile(correctionMigration, "utf8");
const nbCorrectionMigration = fileURLToPath(new URL("../supabase/migrations/20260924110000_correct_nb_projected_pending_sale.sql", import.meta.url));
const nbCorrection = await readFile(nbCorrectionMigration, "utf8");
const pagePath = fileURLToPath(new URL("../src/pages/StockProyectado.tsx", import.meta.url));
const page = await readFile(pagePath, "utf8");
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
assert.match(correction, /ventas_por_chasis AS MATERIALIZED/);
assert.match(correction, /venta\.unidades_netas>0/);
assert.match(nbCorrection, /SET ventas_pendientes_inicial=1[\s\S]*marca='NB'[\s\S]*NB MAICERO 20L X 45CM/);
assert.match(nbCorrection, /IF v_filas<>1 THEN[\s\S]*RAISE EXCEPTION/);
assert.equal(totals("CLAAS").pending + 1, 9, "La corrección NB lleva las ventas pendientes de apertura a 9");
assert.match(correction, /greatest\(coalesce\(a\.ventas_pendientes_inicial,0\)-coalesce\(v\.ventas_netas,0\),0\)/);
assert.match(correction, /coalesce\(a\.pedidos_compra_inicial,0\)\+coalesce\(im\.pedidos_nuevos,0\)[\s\S]*-coalesce\(im\.arribos,0\)\+coalesce\(aj\.pedidos_compra_delta,0\),[\s\S]*0[\s\S]*\) AS pedidos_compra/);
assert.match(correction, /maquinaria_normalizar_marca\(coalesce\(p_marca,''\)\)='OTROS'/);
assert.match(correction, /count\(DISTINCT public\.maquinaria_normalizar_marca\(x\.marca\)\)/);
assert.match(correction, /'parque\.stock_proyectado','parque','Stock proyectado',35,true/);
assert.match(correction, /acceso\.seccion_id='parque\.stock'/);
assert.match(correction, /has_section_access\(auth\.uid\(\),'parque\.stock_proyectado'\)/);
assert.doesNotMatch(correction, /coalesce\(a\.marca,im\.marca,p\.marca,v\.marca,aj\.marca,'OTROS'\) AS marca/);
assert.doesNotMatch(correction, /ventas_pedido_netas/);
assert.doesNotMatch(page, /label: "Programa"/);
assert.doesNotMatch(page, /label="Programa"/);
assert.match(page, /<FilterDate label="Fecha de corte"/);
assert.doesNotMatch(page, /<Filter(?:Date|Select)[^>]+width=/);

console.log("Stock proyectado SQL: apertura y reglas verificadas");
