// No UI entry point. Preparation is local; --apply explicitly writes to the configured target.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import {
  parseInitialVehicles,
  parseInitialHistory,
} from "../src/features/fleet/workbookImports.mjs";
const [kind, file, out, ...args] = process.argv.slice(2);
if (!["vehicles", "history"].includes(kind) || !file || !out)
  throw Error(
    'Uso: node scripts/fleet-initial-load.mjs vehicles|history archivo.xlsx salida.json "--sheets=Base General" [--apply] [--accept-source-gaps (solo historial)]',
  );
const bytes = await fs.readFile(file);
const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
const workbook = XLSX.read(bytes, {
  type: "buffer",
  cellNF: true,
  cellFormula: true,
});
const sheets = args
  .find((a) => a.startsWith("--sheets="))
  ?.slice(9)
  .split("|");
const parsed =
  kind === "vehicles"
    ? parseInitialVehicles(workbook, sheets)
    : parseInitialHistory(workbook);
await fs.writeFile(out, JSON.stringify({ kind, checksum, ...parsed }, null, 2));
console.log(
  `${parsed.rows.length} registros preparados; ${parsed.issues.length} observaciones. Archivo privado: ${out}`,
);
if (args.includes("--apply")) {
  if (
    parsed.issues.length &&
    !(kind === "history" && args.includes("--accept-source-gaps"))
  )
    throw Error(
      "Revisá las observaciones antes de aplicar. No se ha escrito en la base.",
    );
  const { FLEET_SUPABASE_URL, FLEET_ANON_KEY, FLEET_ACCESS_TOKEN } =
    process.env;
  if (!FLEET_SUPABASE_URL || !FLEET_ANON_KEY || !FLEET_ACCESS_TOKEN)
    throw Error("Faltan URL, clave pública o sesión de Jefatura.");
  const client = createClient(FLEET_SUPABASE_URL, FLEET_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${FLEET_ACCESS_TOKEN}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.rpc("fleet_load_initial", {
    p_kind: kind,
    p_source: file.split(/[\\/]/).at(-1),
    p_checksum: checksum,
    p_rows: parsed.rows,
  });
  if (error) throw error;
  console.log(`Registros incorporados: ${data}`);
}
