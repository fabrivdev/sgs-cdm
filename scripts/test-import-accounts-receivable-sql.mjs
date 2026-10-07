import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const actor = "00000000-0000-4000-8000-000000000001";

await db.exec(`
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE SCHEMA auth;
  CREATE TYPE public.app_role AS ENUM ('admin','cabecilla','tecnico','gerencia');
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${actor}'::uuid $$;
  CREATE FUNCTION public.has_section_access(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
`);

const migration = await readFile(new URL("../supabase/migrations/20261007130000_import_totvs_accounts_receivable.sql", import.meta.url), "utf8");
await db.exec(migration);

const base = {
  fecha_corte: "2026-10-07",
  sucursal: "01",
  tipo_documento: "NF",
  serie: "FE1",
  cuota: "1",
  fecha_emision: "2026-10-07",
  fecha_vencimiento_original: "2026-10-06",
  valor_original: 100,
  moneda_codigo: "2",
  moneda: "USD",
  tasa_moneda: 1,
  modalidad: "001",
  cliente_codigo: "CLI-1",
  cliente_nombre: "Cliente de prueba",
  asesor: "Asesor de prueba",
  condicion: "Credito",
  archivo_origen: "cxc-fixture.xml",
  datos_fuente: {},
};

function row(documento, vencimiento, saldo, overrides = {}) {
  const current = { ...base, documento, fecha_vencimiento: vencimiento, saldo_pendiente: saldo, ...overrides };
  current.naturaleza_documento = current.tipo_documento === "NF" ? "INVOICE"
    : current.tipo_documento === "NCC" ? "CUSTOMER_CREDIT_NOTE"
      : current.tipo_documento === "RA" ? "CUSTOMER_ADVANCE" : "OTHER";
  current.elegible_kpi = current.moneda === "USD" && current.tipo_documento === "NF" && current.saldo_pendiente > 0;
  current.clave_origen = [current.fecha_corte,current.sucursal,current.tipo_documento,current.serie,current.documento,current.cuota ?? "",current.cliente_codigo].join("|");
  current.huella_origen = JSON.stringify([documento,vencimiento,saldo,current.tipo_documento,current.valor_original]);
  current.fila_origen = Number(documento) + 2;
  return current;
}

const rows = [
  row("100", "2026-10-06", 100),
  row("101", "2026-10-07", 50),
  row("102", "2026-10-08", 75),
  row("103", "2026-10-06", 0),
  row("104", "2026-10-06", -20, { tipo_documento: "NCC", serie: "CE1", valor_original: -20, modalidad: "DEVOL" }),
  row("105", "2026-10-06", 5, { tipo_documento: "RA", serie: "REC", valor_original: -5, fecha_vencimiento_original: null }),
];

const control = {
  documentos: 6, filas_saldo_positivo: 4, filas_saldo_cero: 1, filas_saldo_negativo: 1,
  valor_bruto: 375, saldo_neto_fuente: 210, saldo_positivo: 230, saldo_negativo: -20,
  facturas_elegibles: 3, saldo_pendiente_elegible_usd: 225,
  facturas_vencidas: 1, saldo_vencido_usd: 100,
  facturas_vence_hoy: 1, saldo_vence_hoy_usd: 50,
  facturas_futuras: 1, saldo_futuro_usd: 75,
  positivos_no_factura: 1, saldo_positivo_no_factura_usd: 5,
  anticipos_cliente: 1, saldo_anticipos_cliente_usd: 5,
  anticipos_cliente_saldo_positivo: 1, saldo_anticipos_positivo_usd: 5,
  anticipos_cliente_saldo_cero: 0,
  anticipos_cliente_saldo_negativo: 0, saldo_anticipos_negativo_usd: 0,
  anticipos_cliente_vinculados: 0,
  cobertura_aplicacion_anticipos: "SIN_VINCULO_EXPLICITO",
};

async function start(name, sha, cutoff = "2026-10-07") {
  const result = await db.query(`SELECT public.totvs_iniciar_cxc_carga_v1($1::jsonb) result`, [{
    archivo_nombre: name, archivo_sha256: sha.repeat(64), archivo_tamano: 1000,
    fecha_corte: cutoff, corte_evidencia: "USER_CONFIRMED",
  }]);
  return result.rows[0].result;
}

async function rpc(name, ...params) {
  const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
  const casts = name === "totvs_importar_cxc_lote_v1" ? ["::uuid","::text","::jsonb"]
    : name === "totvs_finalizar_cxc_carga_v1" ? ["::uuid","::jsonb"] : ["::uuid"];
  const args = params.map((_, index) => `$${index + 1}${casts[index]}`).join(",");
  return (await db.query(`SELECT public.${name}(${args}) result`, params)).rows[0]?.result;
}

const first = await start("first.xml", "a");
const validation = await rpc("totvs_importar_cxc_lote_v1", first.carga_id, "validate", rows);
if (validation.insertadas !== 6 || validation.conflictos !== 0) throw new Error(`validación inicial inesperada: ${JSON.stringify(validation)}`);
await rpc("totvs_importar_cxc_lote_v1", first.carga_id, "import", rows);
await rpc("totvs_finalizar_cxc_carga_v1", first.carga_id, control);

const repeat = await start("first-retry.xml", "a");
if (!repeat.reutilizada || repeat.estado !== "COMPLETA" || repeat.carga_id !== first.carga_id || repeat.snapshot_version !== 1) {
  throw new Error(`retry del mismo archivo no fue idempotente: ${JSON.stringify(repeat)}`);
}
let changedCutRejected = false;
try {
  await start("same-bytes-other-cut.xml", "a", "2026-10-08");
} catch (error) {
  changedCutRejected = error?.code === "23514";
}
if (!changedCutRejected) throw new Error("el mismo SHA pudo reinterpretarse con otro corte");

const updatedRows = rows.map((item) => item.documento === "100"
  ? { ...item, saldo_pendiente: 80, huella_origen: JSON.stringify([item.documento,item.fecha_vencimiento,80,item.tipo_documento,item.valor_original]) }
  : item);
const updatedControl = { ...control,
  saldo_neto_fuente: 190, saldo_positivo: 210, saldo_pendiente_elegible_usd: 205,
  saldo_vencido_usd: 80,
};
const updated = await start("updated-same-cut.xml", "b");
if (updated.snapshot_version !== 2 || updated.reemplaza_carga_id !== first.carga_id) throw new Error(`versionado inesperado: ${JSON.stringify(updated)}`);
const updateValidation = await rpc("totvs_importar_cxc_lote_v1", updated.carga_id, "validate", updatedRows);
if (updateValidation.insertadas !== 6 || updateValidation.conflictos !== 0) throw new Error(`actualización de corte bloqueada: ${JSON.stringify(updateValidation)}`);
await rpc("totvs_importar_cxc_lote_v1", updated.carga_id, "import", updatedRows);
await rpc("totvs_finalizar_cxc_carga_v1", updated.carga_id, updatedControl);

const conflict = await start("conflict.xml", "c");
await rpc("totvs_importar_cxc_lote_v1", conflict.carga_id, "import", [rows[0]]);
const changed = [{ ...rows[0], saldo_pendiente: 99, huella_origen: "otra-huella" }];
const conflictValidation = await rpc("totvs_importar_cxc_lote_v1", conflict.carga_id, "validate", changed);
if (conflictValidation.conflictos !== 1) throw new Error(`conflicto no detectado: ${JSON.stringify(conflictValidation)}`);
await rpc("totvs_cancelar_cxc_carga_v1", conflict.carga_id);

const summary = await db.query(`SELECT public.totvs_consultar_cxc_resumen_v1('2026-10-07'::date) result`);
const result = summary.rows[0].result;
if (Number(result.snapshot_version) !== 2 || result.reemplaza_carga_id !== first.carga_id
  || Number(result.saldo_vencido_usd) !== 80
  || Number(result.porcentaje_saldo_vencido) !== 39.02) {
  throw new Error(`resumen inesperado: ${JSON.stringify(result)}`);
}
if (Number(result.saldo_pendiente_elegible_usd) !== 205) {
  throw new Error(`doble compensación detectada: el RA alteró el SALDO pendiente NF: ${JSON.stringify(result)}`);
}
if (Number(result.facturas_vence_hoy) !== 1 || Number(result.filas_saldo_cero) !== 1 || Number(result.filas_saldo_negativo) !== 1) {
  throw new Error(`casos límite inesperados: ${JSON.stringify(result)}`);
}

if (Number(result.anticipos_cliente) !== 1 || Number(result.saldo_anticipos_cliente_usd) !== 5
  || Number(result.anticipos_cliente_vinculados) !== 0
  || result.cobertura_aplicacion_anticipos !== "SIN_VINCULO_EXPLICITO") {
  throw new Error(`tratamiento RA inesperado: ${JSON.stringify(result)}`);
}

const counts = await db.query(`SELECT
  (SELECT count(*) FROM public.totvs_cxc_documentos) documentos,
  (SELECT count(*) FROM public.totvs_cxc_cargas WHERE estado='COMPLETA') completas,
  (SELECT count(*) FROM public.totvs_cxc_cargas WHERE estado='CANCELADA') canceladas`);
if (Number(counts.rows[0].documentos) !== 12 || Number(counts.rows[0].completas) !== 2 || Number(counts.rows[0].canceladas) !== 1) {
  throw new Error(`idempotencia inesperada: ${JSON.stringify(counts.rows[0])}`);
}

console.log(JSON.stringify({ first, repeat, changedCutRejected, updated, validation, updateValidation, conflictValidation, result, counts: counts.rows[0] }, null, 2));
await db.close();
