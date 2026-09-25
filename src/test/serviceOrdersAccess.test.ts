import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(path, "utf8");
describe("service orders integration contract", () => {
  it("copies existing grants once without automatic regrant or expanded write policies", () => {
    const sql = read("supabase/migrations/20260925150000_service_orders_section.sql");
    expect(sql).toContain("IF nueva THEN");
    expect(sql).toContain("WHERE seccion_id = 'servicios.dashboard'");
    expect(sql).toContain("ON CONFLICT (user_id, seccion_id) DO NOTHING");
    expect(sql).toContain("to_regclass('public.app_configuracion') IS NOT NULL");
    expect(sql).toContain("clave = 'meta_horas_mensual_tecnico'");
    expect(sql).toContain("public.has_section_access(auth.uid(), 'admin.parametros')");
    expect(sql).not.toMatch(/USING\s*\(\s*true|FOR ALL|DELETE FROM|TRUNCATE|DROP TABLE/i);
    expect(sql).toMatch(/BEGIN;[\s\S]+COMMIT;/);
  });
  it("protects new and redirected routes with both section and legacy role boundary", () => {
    const app = read("src/App.tsx");
    expect(app).not.toContain('import("./pages/Dashboard")');
    expect(app.match(/requireRoles=\{\["admin", "gerencia"\]\} requireModulo="servicios" requireSection="servicios.ordenes"/g)).toHaveLength(2);
    expect(app).toContain('<Navigate to="/servicios/ordenes" replace />');
  });
  it("keeps reusable financial chart modules and maps source ID for details", () => {
    expect(read("src/components/dashboard/DashboardCharts.tsx")).toContain("export function WeeklyBars");
    expect(read("src/features/service-orders/useOperationsModel.ts")).toContain("key: row.id");
    expect(read("src/pages/Trabajos.tsx")).toContain('trabajos.some(trabajo => trabajo.id === requested)');
  });
});
