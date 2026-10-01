import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261001160000_preserve_machine_history_time_source.sql",
  "utf8",
);

describe("machine history source provenance", () => {
  it("publishes the persisted time type without invoice or amount inference", () => {
    expect(migration).toContain("fecha_cierre_os, tipo_tiempo,");
    expect(migration).toContain("ventas_historial_tipo_tiempo_procedencia(tipo_tiempo)");
    expect(migration).not.toContain("ventas_tipo_tiempo_historial_os(");
    expect(migration).not.toMatch(/factura[^\n]+THEN 'Cliente'/i);
    expect(migration).not.toMatch(/servicios_valor[^\n]+THEN 'Cliente'/i);
  });

  it("requires a single OS candidate and branch agreement for repeated numbers", () => {
    expect(migration).toContain("count(*) OVER (PARTITION BY f.id) AS coincidencias_numero");
    expect(migration).toContain("ventas_historial_vinculo_os_publicable(");
    expect(migration).toContain("HAVING count(*)=1");
    expect(migration).toContain("c.chasis_clave,p_chasis");
  });

  it("is idempotent and preserves the existing access boundary", () => {
    expect(migration).toMatch(/^BEGIN;/);
    expect(migration.trim()).toMatch(/COMMIT;$/);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(3);
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.ventas_servicios_historial(text,text) FROM PUBLIC,anon;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.ventas_servicios_historial(text,text) TO authenticated;");
    expect(migration).not.toMatch(/ALTER TABLE|CREATE POLICY|DROP POLICY|INSERT INTO|UPDATE public\.|DELETE FROM/i);
  });
});
