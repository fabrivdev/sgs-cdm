import { describe, expect, it } from "vitest";
import { groupServiceBrandsByMachine, groupServiceBrandsByTime, serviceReportBrand } from "./serviceBrandGroups";
import type { IndicadorMarcaTipo, IndicadorMaquina } from "./useServiciosIndicadores";

const amounts = { mo: 10, km: 2, repuestos: 3, terceros: 5, neto: 20 };
const sum = (rows: typeof amounts[], key: keyof typeof amounts) => rows.reduce((total, row) => total + row[key], 0);

describe("service report brand groups", () => {
  it("keeps CLAAS/HORSCH and genuine missing brands, not custom brand names", () => {
    expect(serviceReportBrand(" claas ")).toBe("CLAAS");
    expect(serviceReportBrand("horsch")).toBe("HORSCH");
    for (const brand of ["JOHN DEERE", "VALTRA", "NB MAQUINAS", "Otros"]) expect(serviceReportBrand(brand)).toBe("OTROS");
    expect(serviceReportBrand("Sin identificar")).toBe("Sin identificar");
  });

  it("merges only the same time type and historical coverage, retaining null hours and credits", () => {
    const rows: IndicadorMarcaTipo[] = [
      { ...amounts, marca: "JOHN DEERE", tipo_tiempo: "Cliente", horas: 2 },
      { ...amounts, marca: "VALTRA", tipo_tiempo: "Cliente", horas: 3 },
      { ...amounts, marca: "NB", tipo_tiempo: "Garantia", horas: 4 },
      { ...amounts, neto: -20, mo: -10, km: -2, repuestos: -3, terceros: -5, marca: "OTROS", tipo_tiempo: "Cliente", horas: 0 },
      { ...amounts, marca: "OTROS", tipo_tiempo: "Cliente", horas: null, sin_vinculo_historico: true },
      { ...amounts, marca: "SIN MARCA", tipo_tiempo: "Cliente", horas: null },
    ];
    const original = structuredClone(rows);
    const groups = groupServiceBrandsByTime(rows);
    expect(groups).toHaveLength(4);
    expect(groups.find(r => r.marca === "OTROS" && r.tipo_tiempo === "Cliente" && !r.sin_vinculo_historico)).toMatchObject({ horas: 5, neto: 20 });
    expect(groups.find(r => r.sin_vinculo_historico)?.horas).toBeNull();
    for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) expect(sum(groups, key)).toBe(sum(rows, key));
    expect(rows).toEqual(original);
    expect(groupServiceBrandsByTime([{ ...rows[0], horas: null }, rows[1]])[0].horas).toBeNull();
  });

  it("merges other brands within each machine type, retaining totals and source rows", () => {
    const rows: IndicadorMaquina[] = [
      { ...amounts, marca: "JOHN DEERE", tipo_maquina: "TRACTORES", maquinas: 1, ordenes: 2, horas: 5 },
      { ...amounts, marca: "VALTRA", tipo_maquina: "TRACTORES", maquinas: 2, ordenes: 3, horas: 8 },
      { ...amounts, marca: "NB", tipo_maquina: "SEMBRADORAS", maquinas: 1, ordenes: 1, horas: 3 },
      { ...amounts, marca: "CLAAS", tipo_maquina: "TRACTORES", maquinas: 1, ordenes: 1, horas: 4 },
      { ...amounts, marca: "Sin identificar", tipo_maquina: "Sin identificar", maquinas: 0, ordenes: 0, horas: 0 },
    ];
    const original = structuredClone(rows);
    const groups = groupServiceBrandsByMachine(rows);
    expect(groups).toHaveLength(4);
    expect(groups.find(r => r.marca === "OTROS" && r.tipo_maquina === "TRACTORES")).toMatchObject({ maquinas: 3, ordenes: 5, horas: 13, neto: 40 });
    for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) expect(sum(groups, key)).toBe(sum(rows, key));
    expect(rows).toEqual(original);
    expect(groupServiceBrandsByMachine([])).toEqual([]);
    expect(groupServiceBrandsByTime([])).toEqual([]);
  });
});
