// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const original = readFileSync("supabase/migrations/20261002120000_transactional_totvs_billing_import.sql", "utf8");
const migration = readFileSync("supabase/migrations/20261003001500_reconcile_totvs_reimport_evidence.sql", "utf8");
const db = new PGlite();
const functionSql = (source: string, name: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing SQL function ${name}`);
  return source.slice(start, source.indexOf("\n$$;", start) + 4);
};
beforeAll(async () => {
  await db.exec(functionSql(original, "facturacion_totvs_sucursal_canonica"));
  await db.exec(functionSql(original, "facturacion_totvs_firma_comercial"));
  await db.exec(functionSql(migration, "facturacion_totvs_preparar_reimportacion"));
});
afterAll(async () => { await db.close(); });
const source = () => ({
  origen_sistema: "new_xml_facturacion_os", sucursal: "Santa Rita",
  codigo_interno_factura: "SYN-DOC", factura: "SYN-DOC", vendedor: null,
  cantidad: 1, valor_unitario: 100, total_venta: 100,
  tipo_tiempo: null as string | null, marca_normalizada: "OTROS",
  raw_data: {
    ITEM: "01", canonical_document_kind: "Factura", linked_service_order: null as string | null,
    linked_service_order_evidence: "missing", linked_service_order_known_values: [] as string[],
    canonical_time_type: "Desconocido", canonical_time_type_evidence: "missing",
    canonical_time_type_known_values: [] as string[], canonical_time_type_has_unknown: false,
    product_brand: null as string | null, product_brand_evidence: "missing", product_brand_known_values: [] as string[],
  },
});
const oldDefault = () => ({ ...source(), tipo_tiempo: "Cliente", raw_data: {
  ...source().raw_data, canonical_time_type: "Cliente", linked_service_order_evidence: null,
  linked_service_order_known_values: null, canonical_time_type_evidence: null, canonical_time_type_known_values: null,
} });
const storedLinked = () => ({ ...source(), tipo_tiempo: "Garantia", marca_normalizada: "HORSCH", raw_data: {
  ...source().raw_data, linked_service_order: "01-SYN-OS", canonical_time_type: "Garantia",
} });
type ReimportPlan = {
  entrada: Record<string, unknown> & { raw_data: Record<string, unknown> };
  guardada_comparable: Record<string, unknown>;
  [flag: string]: unknown;
};
const plan = async (stored: unknown, incoming: unknown) => (await db.query<{ plan: ReimportPlan }>(
  "SELECT public.facturacion_totvs_preparar_reimportacion($1::jsonb,$2::jsonb) AS plan",
  [JSON.stringify(stored), JSON.stringify(incoming)],
)).rows[0].plan;

describe("reimportacion TOTVS con ausencia de evidencia", () => {
  it("limpia solo el default historico Cliente sin OS ni evidencia", async () => {
    const result = await plan(oldDefault(), source());
    expect(result.limpiar_tiempo).toBe(true);
    expect(result.guardada_comparable.tipo_tiempo).toBeNull();
    expect(migration).toContain("'canonical_time_type','Desconocido'");
    expect(migration).toContain("'canonical_time_type_known_values','[]'::jsonb");
  });
  it("no limpia un tipo con evidencia explicita aunque no tenga OS", async () => {
    const stored = oldDefault();
    const result = await plan({ ...stored, raw_data: { ...stored.raw_data, canonical_time_type_evidence: "complete" } }, source());
    expect(result.limpiar_tiempo).toBe(false);
  });
  it("retiene el vinculo y clasificacion existentes si el XML solo omite evidencia", async () => {
    const result = await plan(storedLinked(), source());
    expect(result.entrada.raw_data.linked_service_order).toBe("01-SYN-OS");
    expect(result.entrada.tipo_tiempo).toBe("Garantia");
    expect(result.entrada.marca_normalizada).toBe("HORSCH");
    expect(result.limpiar_tiempo).toBe(false);
  });
  it("no reemplaza OS, tiempo o marca explicitamente contradictorios", async () => {
    const incoming = source();
    incoming.raw_data.linked_service_order = "01-DIFFERENT";
    incoming.raw_data.linked_service_order_evidence = "complete";
    incoming.raw_data.linked_service_order_known_values = ["01-DIFFERENT"];
    incoming.tipo_tiempo = "Cliente";
    incoming.raw_data.canonical_time_type_evidence = "complete";
    incoming.raw_data.canonical_time_type_known_values = ["Cliente"];
    incoming.marca_normalizada = "CLAAS";
    incoming.raw_data.product_brand = "CLAAS";
    incoming.raw_data.product_brand_evidence = "product";
    incoming.raw_data.product_brand_known_values = ["CLAAS"];
    const result = await plan(storedLinked(), incoming);
    expect(result.entrada).toEqual(incoming);
    expect(result.guardada_comparable).toEqual(storedLinked());
  });
  it("una ausencia con valores conocidos no habilita limpieza", async () => {
    const incoming = source();
    incoming.raw_data.canonical_time_type_known_values = ["Cliente"];
    expect((await plan(oldDefault(), incoming)).limpiar_tiempo).toBe(false);
  });
  it("completa vendedor vacio pero nunca cambia un vendedor conocido", async () => {
    const incoming = { ...source(), vendedor: "SYN-SELLER" };
    expect((await plan(source(), incoming)).completar_vendedor).toBe(true);
    expect((await plan({ ...source(), vendedor: "OTHER" }, incoming)).completar_vendedor).toBe(false);
  });
  it("no normaliza cambios de precio o cantidad para eludir la firma", async () => {
    const incoming = { ...source(), total_venta: 101, cantidad: 2 };
    const result = await plan(source(), incoming);
    expect(result.guardada_comparable.total_venta).toBe(100);
    expect(result.guardada_comparable.cantidad).toBe(1);
    expect(result.entrada.total_venta).toBe(101);
    expect(result.entrada.cantidad).toBe(2);
  });
  it("incorpora OS, tiempo y marca nuevos solo con evidencia completa y uniforme", async () => {
    const incoming = source();
    incoming.raw_data.linked_service_order = "01-SYN-OS";
    incoming.raw_data.linked_service_order_evidence = "complete";
    incoming.raw_data.linked_service_order_known_values = ["01-SYN-OS"];
    incoming.tipo_tiempo = "Garantia";
    incoming.raw_data.canonical_time_type_evidence = "complete";
    incoming.raw_data.canonical_time_type_known_values = ["Garantia"];
    incoming.marca_normalizada = "HORSCH";
    incoming.raw_data.product_brand = "HORSCH";
    incoming.raw_data.product_brand_evidence = "service_order";
    incoming.raw_data.product_brand_known_values = ["HORSCH"];
    const result = await plan(oldDefault(), incoming);
    expect(result.completar_os).toBe(true);
    expect(result.completar_tiempo).toBe(true);
    expect(result.completar_marca).toBe(true);
    incoming.raw_data.canonical_time_type_evidence = "partial";
    expect((await plan(oldDefault(), incoming)).completar_tiempo).toBe(false);
    incoming.raw_data.linked_service_order_known_values.push("01-OTHER");
    expect((await plan(oldDefault(), incoming)).completar_os).toBe(false);
  });
  it("no sobrescribe contradicciones conocidas en raw_data aunque el campo tipado este vacio", async () => {
    const incoming = source();
    incoming.raw_data.linked_service_order = "01-SYN-OS";
    incoming.raw_data.linked_service_order_evidence = "complete";
    incoming.raw_data.linked_service_order_known_values = ["01-SYN-OS"];
    incoming.tipo_tiempo = "Garantia";
    incoming.raw_data.canonical_time_type_evidence = "complete";
    incoming.raw_data.canonical_time_type_known_values = ["Garantia"];
    incoming.marca_normalizada = "CLAAS";
    incoming.raw_data.product_brand = "CLAAS";
    incoming.raw_data.product_brand_evidence = "service_order";
    incoming.raw_data.product_brand_known_values = ["CLAAS"];
    const stored = { ...source(), raw_data: {
      ...source().raw_data, canonical_time_type: "Interno", product_brand: "HORSCH",
    } };
    const result = await plan(stored, incoming);
    expect(result.completar_tiempo).toBe(false);
    expect(result.completar_marca).toBe(false);
    expect(result.guardada_comparable.tipo_tiempo).toBeNull();
    expect(result.guardada_comparable.marca_normalizada).toBe("OTROS");
  });
  it("mantiene proteccion auditada, evidencia de duplicados y no borra UUID", () => {
    expect(migration).toContain("p.identidad=u.identidad OR p.linea_canonica_id=f.id");
    expect(migration).toContain("p.linea_canonica_id=f.id");
    expect(migration).toContain("p.linea_fingerprint = public.facturacion_totvs_fingerprint_auditado(to_jsonb(f))");
    expect(migration).toContain("'canonical_time_type_known_values',value->'raw_data'->'canonical_time_type_known_values'");
    expect(migration).toContain("FOR UPDATE OF f");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.facturacion_lineas_importadas/i);
    expect(migration).toContain("facturacion_totvs_reimportacion_cambios");
  });
});
