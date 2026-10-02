import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261002120000_transactional_totvs_billing_import.sql",
  "utf8",
);
const importer = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const calendarDateMigration = readFileSync(
  "supabase/migrations/20261002210000_fix_totvs_calendar_dates_and_preflight.sql",
  "utf8",
);

describe("importacion transaccional de facturacion TOTVS", () => {
  it("mantiene el RPC en una transaccion y no borra lineas detalladas", () => {
    expect(migration).toMatch(/BEGIN;[\s\S]+COMMIT;/);
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.facturacion_lineas_importadas/i);
    expect(importer).not.toMatch(/\.from\("facturacion_lineas_importadas"[\s\S]{0,120}\.delete\(\)/);
  });

  it("preserva acceso, UUID y rechaza ambiguedades antes del INSERT de auditoria", () => {
    const conflictCheck = migration.indexOf("Identidad TOTVS ambigua sin par canonico valido");
    const importInsert = migration.indexOf("INSERT INTO public.importaciones");
    expect(conflictCheck).toBeGreaterThan(0);
    expect(importInsert).toBeGreaterThan(conflictCheck);
    expect(migration).toContain("has_section_access(auth.uid(), 'admin.importaciones')");
    expect(migration).toContain("UPDATE public.facturacion_lineas_importadas f");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.facturacion_importar_totvs_lote_v1");
    expect(migration).not.toMatch(/ON\s+DELETE\s+(SET NULL|CASCADE)/i);
  });

  it("bloquea lineas ausentes y cambios comerciales en vez de reemplazarlos", () => {
    expect(migration).toContain("Cambio comercial para la identidad TOTVS");
    expect(migration).toContain("El XML omite lineas TOTVS existentes en la ventana");
    expect(importer).toContain('"facturacion_importar_totvs_lote_v1"');
  });

  it("protege corte historico y valida cobertura antes de borrar resumen", () => {
    const coverage = migration.indexOf("El resumen TOTVS no coincide");
    const summaryDelete = migration.indexOf("DELETE FROM public.facturacion");
    expect(migration).toContain("p_desde < DATE '2026-07-01'");
    expect(migration).toContain("jsonb_array_length(p_resumen) = 0");
    expect(coverage).toBeGreaterThan(0);
    expect(summaryDelete).toBeGreaterThan(coverage);
  });

  it("canoniza el origen enriquecido y compara clasificaciones persistidas", () => {
    expect(migration).toContain("'NEW_XML_FACTURACION_DIRECTA', 'NEW_XML_FACTURACION_OS'");
    expect(migration).toContain("'vendedor'");
    expect(migration).toContain("'tipo_facturacion'");
    expect(migration).toContain("'tipo_tiempo'");
  });

  it("canoniza solo los alias confirmados de San Juan Bautista a Misiones", () => {
    expect(migration).toContain("facturacion_totvs_sucursal_canonica");
    expect(migration).toContain("'04 - SAN JUAN BAUTISTA'");
    expect(migration).toContain("THEN 'Misiones'");
    expect(migration).toContain(
      "public.facturacion_totvs_sucursal_canonica(u.linea->>'sucursal')::public.sucursal",
    );
  });

  it("resuelve solo pares auditados y nunca actualiza la descartada", () => {
    expect(migration).toContain("p.linea_descartada_id = otra.id");
    expect(migration).toContain("p.linea_canonica_id = c.id");
    expect(migration).toContain("WHERE f.id = d.destino_id");
  });

  it("exige evidencia explicita univoca y detecta omisiones de triggers en UPDATE", () => {
    expect(migration).toContain("linked_service_order_known_values') > 0");
    expect(migration).toContain("product_brand_known_values') > 0");
    expect(migration).toContain("canonical_time_type_known_values') > 0");
    expect(migration).toContain("tmp_facturacion_totvs_reparaciones_esperadas");
    expect(migration).toContain("tmp_facturacion_totvs_reparaciones_reales");
    expect(migration).toContain("Un trigger omitio reparaciones TOTVS durante UPDATE");
  });

  it("exige la tabla auditada y sus dos FK restrictivas sin crearla", () => {
    expect(migration).toContain("to_regclass('public.facturacion_dedupe_repair_pairs') IS NULL");
    expect(migration).toContain("linea_descartada_id'::text, 'uuid'::text");
    expect(migration).toContain("linea_canonica_id'::text, 'uuid'::text");
    expect(migration).toContain("c.confdeltype IN ('a', 'r')");
    expect(migration).not.toMatch(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.facturacion_dedupe_repair_pairs/i,
    );
  });

  it("fija UTC para todo el contrato calendario y valida huellas antes de cambiarlo", () => {
    const fingerprintPrecondition = calendarDateMigration.indexOf(
      "p.linea_fingerprint IS DISTINCT FROM",
    );
    const timezoneChange = calendarDateMigration.indexOf(
      "ALTER FUNCTION public.facturacion_importar_totvs_lote_v1",
    );

    expect(fingerprintPrecondition).toBeGreaterThan(0);
    expect(timezoneChange).toBeGreaterThan(fingerprintPrecondition);
    expect(calendarDateMigration).toContain("SET TimeZone TO 'UTC'");
    expect(calendarDateMigration).toContain("facturacion_validar_totvs_lote_v1");
    expect(calendarDateMigration).toContain("__TOTVS_VALIDACION_ROLLBACK__");
  });
});
