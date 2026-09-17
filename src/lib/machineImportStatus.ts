type ImportSaleEvidence = {
  venta_facturada?: unknown;
  estado_disponibilidad?: string | null;
};

export type ImportArrivalState = "PLANIFICADO" | "EN_TRANSITO" | "ARRIBADO" | "COMPLETADO" | "CANCELADO";

export function importArrivalState(row: {
  estado_fuente?: string | null; eta?: string | null; ata?: string | null;
  costo_stock_habilitado?: boolean; stock_fisico_confirmado?: boolean; estado_disponibilidad?: string | null;
}): ImportArrivalState {
  const raw = String(row.estado_fuente ?? "").trim().toUpperCase();
  if (raw.includes("CANCEL")) return "CANCELADO";
  const physicallyConfirmed = row.stock_fisico_confirmado ?? (row.costo_stock_habilitado === true && row.estado_disponibilidad !== "CONFLICTO");
  if (row.ata) return physicallyConfirmed ? "COMPLETADO" : "ARRIBADO";
  if (raw.includes("ARRIB") || raw.includes("RECIB") || raw.includes("COMPLET")) return "ARRIBADO";
  if (raw.includes("TRANSIT") || raw.includes("EMBARC")) return "EN_TRANSITO";
  return "PLANIFICADO";
}

export function isImportSaleInvoiced(row: ImportSaleEvidence) {
  const reportedAsInvoiced = ["TRUE", "SI", "SÍ", "1"].includes(
    String(row.venta_facturada ?? "").trim().toUpperCase(),
  );

  return reportedAsInvoiced || row.estado_disponibilidad === "EN_PARQUE";
}
