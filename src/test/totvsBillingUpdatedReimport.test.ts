// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const original = readFileSync("supabase/migrations/20261002120000_transactional_totvs_billing_import.sql", "utf8");
const migration = readFileSync("supabase/migrations/20261016120000_reconcile_totvs_evidenced_enrichment.sql", "utf8");
const core = readFileSync("src/test/fixtures/totvsCoreConsolidacion20261016.sql", "utf8");
const db = new PGlite();
const functionSql = (source: string, name: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`Missing SQL function ${name}`);
  return source.slice(start, source.indexOf("\n$$;", start) + 4);
};

beforeAll(async () => {
  await db.exec("CREATE TABLE public.facturacion_totvs_importador_versiones(version text PRIMARY KEY, definicion_rpc text NOT NULL)");
  await db.exec(functionSql(original, "facturacion_totvs_sucursal_canonica"));
  await db.exec(functionSql(original, "facturacion_totvs_firma_comercial"));
  await db.exec(`${core};`);
  await db.exec(migration);
});
afterAll(async () => { await db.close(); });

const line = () => ({
  origen_sistema: "new_xml_facturacion_os", sucursal: "Katuete",
  codigo_interno_factura: "0020010003245", factura: "0020010003245",
  vendedor: "AR0005 - WILLIAM CHAVEZ", cantidad: 1, valor_unitario: 70.9,
  total_venta: 70.9, grupo_normalizado: "KILOMETRAJE",
  marca_normalizada: "OTROS", tipo_tiempo: null,
  raw_data: {
    ITEM: "01", canonical_document_kind: "Factura", linked_service_order: null,
    linked_service_order_evidence: "missing", linked_service_order_known_values: [],
    canonical_time_type: "Desconocido", canonical_time_type_evidence: "missing",
    canonical_time_type_known_values: [], product_brand: null,
    product_brand_evidence: "missing", product_brand_known_values: [],
    canonical_line_type: "KILOMETRAJE",
  },
});
const incoming = () => ({ ...line(), grupo_normalizado: "Kilometraje", marca_normalizada: "CLAAS",
  raw_data: { ...line().raw_data, canonical_line_type: "Kilometraje",
    product_brand: "CLAAS", product_brand_evidence: "product", product_brand_known_values: ["CLAAS"] },
});
type ReimportPlan = {
  completar_marca: boolean;
  normalizar_grupo: boolean;
  guardada_comparable: Record<string, unknown>;
  entrada: Record<string, unknown>;
};
const plan = async (stored: unknown, received: unknown) => (await db.query<{ result: ReimportPlan }>(
  "SELECT public.facturacion_totvs_preparar_reimportacion($1::jsonb,$2::jsonb) AS result",
  [JSON.stringify(stored), JSON.stringify(received)],
)).rows[0].result;

describe("reimportacion de facturacion TOTVS actualizada", () => {
  it("acepta marca acreditada sin OS y normaliza solo la capitalizacion del grupo", async () => {
    const result = await plan(line(), incoming());
    expect(result.completar_marca).toBe(true);
    expect(result.normalizar_grupo).toBe(true);
    expect(result.guardada_comparable.marca_normalizada).toBe("CLAAS");
    expect(result.guardada_comparable.grupo_normalizado).toBe("Kilometraje");
    const signatures = await db.query<{ same: boolean }>(
      "SELECT public.facturacion_totvs_firma_comercial($1::jsonb)=public.facturacion_totvs_firma_comercial($2::jsonb) AS same",
      [JSON.stringify(result.guardada_comparable), JSON.stringify(result.entrada)],
    );
    expect(signatures.rows[0].same).toBe(true);
  });

  it("rechaza marca contradictoria, evidencia ambigua y cambios de importe o rubro", async () => {
    const known = { ...line(), marca_normalizada: "HORSCH", raw_data: {
      ...line().raw_data, product_brand: "HORSCH", product_brand_evidence: "product", product_brand_known_values: ["HORSCH"],
    } };
    expect((await plan(known, incoming())).completar_marca).toBe(false);
    const ambiguous = incoming();
    ambiguous.raw_data.product_brand_known_values = ["CLAAS", "HORSCH"];
    expect((await plan(line(), ambiguous)).completar_marca).toBe(false);
    const price = { ...incoming(), total_venta: 71 };
    expect((await plan(line(), price)).guardada_comparable.total_venta).toBe(70.9);
    const group = { ...incoming(), grupo_normalizado: "Servicio" };
    expect((await plan(line(), group)).normalizar_grupo).toBe(false);
  });

  it("activa en el core el guardado y la auditoria de ambos enriquecimientos", async () => {
    const result = await db.query<{ definition: string }>(
      "SELECT pg_get_functiondef('public.facturacion_importar_totvs_lote_core_consolidacion_v1(jsonb,jsonb,jsonb,date,date,boolean)'::regprocedure) AS definition",
    );
    const definition = result.rows[0].definition;
    expect(definition).toContain("'grupo_anterior',f.grupo_normalizado");
    expect(definition).toContain("OR (r.plan->>'completar_marca')::boolean");
    expect(definition).toContain("OR (r.plan->>'normalizar_grupo')::boolean");
    expect(definition).toContain("grupo_normalizado = CASE WHEN (r.plan->>'normalizar_grupo')::boolean");
    expect(definition).toContain("'canonical_line_type',u.linea->'raw_data'->'canonical_line_type'");
    expect(definition).toContain("'product_brand_known_values',u.linea->'raw_data'->'product_brand_known_values'");
    expect(definition).toContain("facturacion_totvs_reimportacion_cambios");
  });
});
