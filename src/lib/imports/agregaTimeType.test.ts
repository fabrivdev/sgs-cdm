import { describe, expect, it } from "vitest";
import { inferCanonicalTimeType } from "./mappings";
import { buildCommissionTimeEntries } from "./commissionTime";
import type { CanonicalServiceOrderRow } from "./canonical";

describe("Agrega al costo", () => {
  it("conserva Garantia y la misma clave de comisión al reimportar una jornada Agrega", () => {
    const row = {
      serviceOrderNumber: "01-125", technician: "001 - JUAN PEREZ", auxiliaryTechnicians: [],
      productName: "MA01", productCode: "-------", serviceHours: 1,
      timeType: "Garantia", raw: { ITEM: "1", canonical_start_date: "2026-08-01",
        canonical_end_date: "2026-08-01", canonical_start_time: "0800", canonical_end_time: "0900" },
    } as unknown as CanonicalServiceOrderRow;
    const original = buildCommissionTimeEntries([row], "old", []);
    const corrected = buildCommissionTimeEntries([{ ...row, timeType: "Agrega al costo" }], "new", []);
    expect(corrected).toHaveLength(1);
    expect(corrected[0].tipo_tiempo).toBe("Garantia");
    expect(corrected[0].tipo_tiempo_importado).toBe("Garantia");
    expect(corrected[0].fuente_clave).toBe(original[0].fuente_clave);
  });
  it.each(["AGR - AGREGAR REPUESTOS", "AGS - AGREGAR SERVICIOS", "Agrega al costo"])("reconoce %s antes de las abreviaturas de garantía", value => {
    expect(inferCanonicalTimeType(value)).toBe("Agrega al costo");
  });
  it.each(["GR - GARANTIA REPUESTOS", "GS - GARANTIA SERVICIOS"])("conserva %s como garantía", value => {
    expect(inferCanonicalTimeType(value)).toBe("Garantia");
  });
});
