// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { persistedBillingTimeType } from "@/lib/imports/billingTimeType";

const persist = readFileSync("src/lib/imports/newSystemPersist.ts", "utf8");
const schema = readFileSync(
  "supabase/migrations/20261002113000_allow_null_billing_line_time_type.sql",
  "utf8",
);

describe("tipo de tiempo sin evidencia", () => {
  it("persiste null y conserva la incertidumbre solo en metadata", () => {
    expect(persistedBillingTimeType("Desconocido")).toBeNull();
    expect(persistedBillingTimeType("Cliente")).toBe("Cliente");
    expect(persistedBillingTimeType("Garantia")).toBe("Garantia");
    expect(persistedBillingTimeType("Interno")).toBe("Interno");
    expect(persist).toContain("persistedBillingTimeType(canonicalTimeType)");
    expect(persist).toContain("export { persistedBillingTimeType }");
    expect(persist).toContain("canonical_time_type_evidence");
    expect(persist).toContain("canonical_time_type_known_values");
    expect(persist).toContain("canonical_time_type_has_unknown");
  });

  it("mantiene solo las tres categorias comerciales y no reescribe historicos", () => {
    expect(schema).toContain("ALTER COLUMN tipo_tiempo DROP NOT NULL");
    expect(schema).toContain("ALTER COLUMN tipo_tiempo DROP DEFAULT");
    expect(schema).toContain(
      "tipo_tiempo IS NULL OR tipo_tiempo IN ('Cliente', 'Garantia', 'Interno')",
    );
    expect(schema).not.toMatch(/\bUPDATE\b/i);
    expect(schema).not.toMatch(/\b(?:ALTER|UPDATE|INSERT|DELETE)\b[^;]*\bcomisiones\b/i);
  });

  it("acepta NULL y rechaza Desconocido en la base", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.facturacion_lineas_importadas (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tipo_tiempo text NOT NULL DEFAULT 'Cliente'
            CONSTRAINT facturacion_lineas_tipo_tiempo_check
            CHECK (tipo_tiempo IN ('Cliente', 'Garantia', 'Interno'))
        );
      `);
      await db.exec(schema);
      await db.exec("INSERT INTO public.facturacion_lineas_importadas(tipo_tiempo) VALUES (NULL)");
      const result = await db.query<{ tipo_tiempo: string | null }>(
        "SELECT tipo_tiempo FROM public.facturacion_lineas_importadas",
      );
      expect(result.rows).toEqual([{ tipo_tiempo: null }]);
      await expect(db.exec(
        "INSERT INTO public.facturacion_lineas_importadas(tipo_tiempo) VALUES ('Desconocido')",
      )).rejects.toThrow();

      const catalog = await db.query<{ is_nullable: string; column_default: string | null }>(`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'facturacion_lineas_importadas'
          AND column_name = 'tipo_tiempo'
      `);
      expect(catalog.rows).toEqual([{ is_nullable: "YES", column_default: null }]);
    } finally {
      await db.close();
    }
  });
});
