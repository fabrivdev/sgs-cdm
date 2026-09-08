type ImportSaleEvidence = {
  venta_facturada?: unknown;
  estado_disponibilidad?: string | null;
};

export function isImportSaleInvoiced(row: ImportSaleEvidence) {
  const reportedAsInvoiced = ["TRUE", "SI", "SÍ", "1"].includes(
    String(row.venta_facturada ?? "").trim().toUpperCase(),
  );

  return reportedAsInvoiced || row.estado_disponibilidad === "EN_PARQUE";
}
