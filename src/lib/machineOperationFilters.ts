import { reviewCatalogLine, type MachineCatalog } from "./machineOrderValidation";

type MachineRow = {
  marca: string | null;
  modelo: string | null;
  producto: string | null;
  modelo_original?: string | null;
  linea_id?: string | null;
};

export function normalizeOperationModel<T extends MachineRow>(row: T, catalog?: MachineCatalog) {
  const match = catalog ? reviewCatalogLine({ marca: row.marca ?? "", modelo: row.modelo ?? "", subgrupo: row.producto ?? "OTRO" }, catalog).match : undefined;
  return { ...row, modelo_original: row.modelo_original ?? row.modelo, ...(match ? { modelo: match.nombre, producto: match.subgrupo } : {}) };
}

export function operationModelOptions(rows: MachineRow[], marca: string, tipo: string) {
  return Array.from(new Set(rows.filter(row =>
    (marca === "TODOS" || row.marca === marca) && (tipo === "TODOS" || row.producto === tipo)
  ).map(row => row.modelo).filter((value): value is string => Boolean(value)))).sort();
}

export function matchesOperationFilters(row: MachineRow, filters: { marca: string; modelo: string; tipo: string; vinculoNp?: string }) {
  if (filters.marca !== "TODOS" && row.marca !== filters.marca) return false;
  if (filters.modelo !== "TODOS" && row.modelo !== filters.modelo) return false;
  if (filters.tipo !== "TODOS" && row.producto !== filters.tipo) return false;
  if (filters.vinculoNp === "VINCULADA" && !row.linea_id) return false;
  if (filters.vinculoNp === "SIN_NP" && row.linea_id) return false;
  return true;
}
