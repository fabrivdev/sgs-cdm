import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260924130000_harden_remaining_authenticated_rls.sql",
  "utf8",
);
const trabajosFollowup = readFileSync(
  "supabase/migrations/20260924143000_restore_scoped_trabajos_rls.sql",
  "utf8",
);

describe("remaining authenticated RLS hardening", () => {
  it("replaces every scanner finding with an explicit business permission", () => {
    const expectedTables = [
      "app_configuracion",
      "app_secciones",
      "dias_no_laborales",
      "maquinaria_marcas_catalogo",
      "modulos",
      "ordenes_servicio_importadas",
      "parque_modelos_alias",
      "parque_modelos_catalogo",
      "profiles",
      "trabajo_historial",
      "parque_factura_os_cliente",
    ];

    for (const table of expectedTables) {
      expect(migration).toContain(`ON public.${table}`);
    }

    expect(migration).toContain("clave = 'meta_horas_mensual_tecnico'");
    expect(migration).toContain("public.has_section_access(auth.uid(), 'servicios.dashboard')");
    expect(migration).toContain("public.has_section_access(auth.uid(), 'servicios.calendario')");
    expect(migration).toContain("public.has_section_access(auth.uid(), 'admin.importaciones')");
    expect(migration).toContain("public.has_module_access(auth.uid(), 'parque')");
    expect(migration).toContain("public.is_active_app_user(auth.uid())");
  });

  it("does not recreate unconditional or merely logged-in policies", () => {
    const policyDefinitions = migration
      .slice(migration.indexOf('DROP POLICY IF EXISTS "Authenticated users read app settings"'))
      .replace(/--.*$/gm, "");

    expect(policyDefinitions).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(policyDefinitions).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    expect(policyDefinitions).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
  });

  it("removes console-created unconditional aliases before rebuilding policies", () => {
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("DROP POLICY IF EXISTS profiles_read_authenticated");
    expect(migration).toContain("regexp_replace(coalesce(qual, '')");
    expect(migration).toContain("regexp_replace(coalesce(with_check, '')");
    expect(migration).toContain("'clientes'");
    expect(migration).toContain("'trabajos'");
  });

  it("keeps scoped Clientes and Trabajos policies before dropping their open aliases", () => {
    expect(trabajosFollowup).toContain("DO $trabajos_policies$");
    expect(trabajosFollowup).toContain("CREATE POLICY trabajos_select_scoped");
    expect(trabajosFollowup).toContain("CREATE POLICY trabajos_insert_scoped");
    expect(trabajosFollowup).toContain("CREATE POLICY trabajos_update_scoped");
    expect(trabajosFollowup).toContain("CREATE POLICY trabajos_delete_scoped");
    expect(trabajosFollowup).toContain("public.has_module_access(auth.uid(), 'servicios')");
    expect(trabajosFollowup).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(trabajosFollowup).not.toMatch(/WITH\s+CHECK\s*\(\s*true\s*\)/i);
    expect(migration).toContain("DO $preflight$");
    expect(migration).toContain("tablename = 'clientes'");
    expect(migration).toContain("tablename = 'trabajos'");
    expect(migration).toContain("ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']");
    expect(migration).toContain("falta una policy % restringida para authenticated");
  });

  it("skips optional tables that do not exist instead of rolling back the transaction", () => {
    expect(migration).toContain("IF to_regclass('public.app_configuracion') IS NOT NULL THEN");
    expect(migration).toContain("IF to_regclass('public.profiles') IS NOT NULL THEN");
    expect(migration).toContain("IF to_regclass('public.parque_factura_os_cliente') IS NOT NULL THEN");
    expect(migration).toContain("information_schema.columns");
  });
});
