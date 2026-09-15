import { describe, expect, it } from "vitest";
import { partsRange, validPartsRange } from "./partsSalesFormat";
describe("Rango de Ventas de Repuestos", () => {
  it("agosto termina el 31, sin incluir septiembre", () => {
    expect(partsRange({ desde: "2026-01-01", hasta: "2026-09-15" }, "2026-08-01", "mes")).toEqual({ desde: "2026-08-01", hasta: "2026-08-31" });
  });
  it("intersecta selección y filtro superior en ambos extremos", () => {
    expect(partsRange({ desde: "2026-08-10", hasta: "2026-08-20" }, "2026-08-01", "mes")).toEqual({ desde: "2026-08-10", hasta: "2026-08-20" });
  });
  it("respeta semanas, días, años y febrero bisiesto", () => {
    const range = { desde: "2024-01-01", hasta: "2026-12-31" };
    expect(partsRange(range, "2024-02-01", "mes").hasta).toBe("2024-02-29");
    expect(partsRange(range, "2026-08-10", "semana").hasta).toBe("2026-08-16");
    expect(partsRange(range, "2026-08-10", "dia").hasta).toBe("2026-08-10");
    expect(partsRange(range, "2026-01-01", "anio").hasta).toBe("2026-12-31");
    expect(partsRange(range, null, "mes")).toEqual(range);
  });
  it("rechaza vacíos, rango invertido y fechas inexistentes", () => {
    for (const range of [{ desde: "", hasta: "2026-08-31" }, { desde: "2026-09-01", hasta: "2026-08-31" }, { desde: "2026-02-31", hasta: "2026-08-31" }]) expect(validPartsRange(range)).toBe(false);
    expect(validPartsRange({ desde: "2026-08-01", hasta: "2026-08-31" })).toBe(true);
  });
});
