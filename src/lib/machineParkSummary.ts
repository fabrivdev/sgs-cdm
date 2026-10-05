export type MachineSummaryInput = { cliente_id: string | null; marca: string };

export function summarizeFilteredMachines(rows: MachineSummaryInput[]) {
  return {
    totalMaquinas: rows.length,
    totalClientes: new Set(rows.map((row) => row.cliente_id).filter((id): id is string => !!id)).size,
    totalHorsch: rows.filter((row) => row.marca === "HORSCH").length,
    totalClaas: rows.filter((row) => row.marca === "CLAAS").length,
  };
}
