type ImportSaleEvidence = {
  venta_facturada?: unknown;
  estado_disponibilidad?: string | null;
};

export type ImportArrivalState = "PLANIFICADO" | "EN_TRANSITO" | "ARRIBADO" | "COMPLETADO" | "CANCELADO";

// Importaciones has a deliberately smaller display vocabulary than commercial Stock.
// Project the source state without rewriting it or using it to infer arrival/payment.
export const IMPORT_SITUATION_LABELS = {
  DISPONIBLE: "Stock", RESERVADO: "Reservado", EN_PARQUE: "En parque",
  SIN_CHASIS: "Sin chasis", SIN_CONCILIAR: "Sin conciliar",
} as const;
export type ImportSituationState = keyof typeof IMPORT_SITUATION_LABELS;
type ImportSituationEvidence = {
  chasis?: string | null;
  estado_disponibilidad?: string | null;
  chasis_ambiguo?: boolean;
};

export function importSituationState(row: ImportSituationEvidence): ImportSituationState {
  if (!String(row.chasis ?? "").replace(/[^a-zA-Z0-9]/g, "")) return "SIN_CHASIS";
  if (row.chasis_ambiguo || row.estado_disponibilidad === "CONFLICTO") return "SIN_CONCILIAR";
  switch (row.estado_disponibilidad) {
    case "VENDIDO_PENDIENTE_ENTREGA":
    case "RESERVADO": return "RESERVADO";
    case "DISPONIBLE": return "DISPONIBLE";
    case "EN_PARQUE": return "EN_PARQUE";
    default: return "SIN_CONCILIAR";
  }
}

export function importSituationLabel(row: ImportSituationEvidence) {
  return IMPORT_SITUATION_LABELS[importSituationState(row)];
}

export function importArrivalState(row: {
  estado_fuente?: string | null; eta?: string | null; ata?: string | null;
  costo_stock_habilitado?: boolean; stock_fisico_confirmado?: boolean; parque_confirmado?: boolean;
  chasis_ambiguo?: boolean; estado_disponibilidad?: string | null;
}): ImportArrivalState {
  const raw = String(row.estado_fuente ?? "").trim().toUpperCase();
  if (raw.includes("CANCEL")) return "CANCELADO";
  // These flags prove an exact chassis match, not a reservation/NP or an imported label.
  // Completion is independent of ATA; never manufacture a historical arrival date.
  const physicallyConfirmed = row.stock_fisico_confirmado ??
    (!!row.ata && row.costo_stock_habilitado === true && row.estado_disponibilidad !== "CONFLICTO");
  if (!row.chasis_ambiguo && (physicallyConfirmed || row.parque_confirmado === true)) return "COMPLETADO";
  if (row.ata) return "ARRIBADO";
  if (raw.includes("TRANSIT") || raw.includes("EMBARC")) return "EN_TRANSITO";
  return "PLANIFICADO";
}

export function isImportSaleInvoiced(row: ImportSaleEvidence) {
  const reportedAsInvoiced = ["TRUE", "SI", "SÍ", "1"].includes(
    String(row.venta_facturada ?? "").trim().toUpperCase(),
  );

  return reportedAsInvoiced || row.estado_disponibilidad === "EN_PARQUE";
}
