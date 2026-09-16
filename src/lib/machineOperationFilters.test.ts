import { describe, expect, it } from "vitest";
import { matchesOperationFilters, normalizeOperationModel, operationModelOptions } from "./machineOperationFilters";
import type { MachineCatalog } from "./machineOrderValidation";

const catalog: MachineCatalog = {
  brands: [{ nombre: "HORSCH", activa: true }],
  models: [{ id: "14", nombre: "MAESTRO CF 14.50", marca_nombre: "HORSCH", subgrupo: "SEMBRADORAS", activo: true }],
};
const row = { marca: "HORSCH", modelo: "MAESTRO CF 14.50", producto: "SEMBRADORAS", modelo_original: "MAESTRO 14 CF E50", linea_id: "np-line", estado: "DISPONIBLE", cantidad: 3 };
const all = { marca: "TODOS", modelo: "TODOS", tipo: "TODOS", vinculoNp: "TODOS" };

describe("operation model display and filters", () => {
  it("keeps the imported original while displaying the linked NP model", () => {
    expect(normalizeOperationModel(row, catalog)).toEqual(row);
    expect(row.modelo_original).toBe("MAESTRO 14 CF E50");
  });
  it("normalizes catalog formatting without changing state or quantity", () => {
    expect(normalizeOperationModel({ ...row, modelo: "maestro cf 14 50", producto: "OTRO" }, catalog)).toEqual(row);
  });
  it("does not guess an unknown model without an approved alias", () => {
    const unknown = { ...row, modelo: "MAESTRO 14 CF E50", modelo_original: undefined };
    expect(normalizeOperationModel(unknown, catalog).modelo).toBe(unknown.modelo);
    expect(normalizeOperationModel(unknown).modelo_original).toBe(unknown.modelo);
  });
  it("builds unique model options from displayed models constrained by brand and type", () => {
    const rows = [row, row, { ...row, marca: "CLAAS", modelo: "LEXION", producto: "COSECHADORAS" }, { ...row, modelo: null }];
    expect(operationModelOptions(rows, "HORSCH", "SEMBRADORAS")).toEqual([row.modelo]);
    expect(operationModelOptions(rows, "TODOS", "TODOS")).toEqual(["LEXION", row.modelo]);
  });
  it("combines model, brand, type and actual NP linkage", () => {
    expect(matchesOperationFilters(row, { ...all, modelo: row.modelo, tipo: row.producto, vinculoNp: "VINCULADA" })).toBe(true);
    expect(matchesOperationFilters(row, { ...all, modelo: "LEXION" })).toBe(false);
    expect(matchesOperationFilters(row, { ...all, marca: "CLAAS" })).toBe(false);
    expect(matchesOperationFilters(row, { ...all, tipo: "SUELO" })).toBe(false);
    expect(matchesOperationFilters(row, { ...all, vinculoNp: "SIN_NP" })).toBe(false);
    expect(matchesOperationFilters({ ...row, linea_id: null }, { ...all, vinculoNp: "SIN_NP" })).toBe(true);
    expect(matchesOperationFilters({ ...row, linea_id: null }, { ...all, vinculoNp: "VINCULADA" })).toBe(false);
    expect(matchesOperationFilters(row, all)).toBe(true);
  });
});
