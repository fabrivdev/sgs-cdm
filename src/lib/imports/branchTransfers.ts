import type { CanonicalBranchTransferRow, CanonicalImportEnvelope } from "@/lib/imports/canonical";
import { normalizeDateLike, normalizeText, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = ["ORIGEN", "DESTINO", "Fch Emision", "Serie Docto.", "Num. Doc.", "Item", "Producto", "Descripcion", "Cantidad", "Observacion"];
const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const display = (row: Record<string, unknown>, header: string) => String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

export function mapBranchTransferSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): CanonicalImportEnvelope<CanonicalBranchTransferRow> {
  if (sheet.headers.length !== EXPECTED_HEADERS.length || EXPECTED_HEADERS.some((header, index) => sheet.headers[index] !== header)) {
    throw new Error("Transferencias entre sucursales: estructura inesperada.");
  }
  const seen = new Set<string>();
  const rows = sheet.rows.map((raw, index): CanonicalBranchTransferRow => {
    const sourceRow = index + 2;
    const originBranch = text(raw, "ORIGEN");
    const destinationBranch = text(raw, "DESTINO");
    const emissionDate = normalizeDateLike(value(raw, "Fch Emision"));
    const documentSeries = text(raw, "Serie Docto.");
    const documentNumber = text(raw, "Num. Doc.");
    const item = text(raw, "Item");
    const productCode = text(raw, "Producto");
    const quantityRaw = String(value(raw, "Cantidad") ?? "").trim();
    if (!originBranch || !destinationBranch || !emissionDate || !documentSeries || !documentNumber || !item || !productCode || !/\d/.test(quantityRaw)) {
      throw new Error(`Transferencias entre sucursales: fila ${sourceRow} con clave, fecha, producto o cantidad inválida.`);
    }
    const rowId = [originBranch, destinationBranch, documentSeries, documentNumber, item].map(normalizeStableKey).join("|");
    if (seen.has(rowId)) throw new Error(`Transferencias entre sucursales: clave repetida en fila ${sourceRow}.`);
    seen.add(rowId);
    const productDescription = display(raw, "Descripcion") || null;
    const quantity = parseFlexibleNumber(quantityRaw);
    const observation = display(raw, "Observacion") || null;
    const sourceFingerprint = JSON.stringify([originBranch, destinationBranch, emissionDate, documentSeries, documentNumber, item, productCode, productDescription, quantity, observation]);
    return { rowId, sourceFileName, sourceRow, originBranch, destinationBranch, emissionDate, documentSeries, documentNumber, item, productCode, productDescription, quantity, observation, sourceFingerprint, raw };
  });
  return { sourceSystem: "totvs_transferencias_transito", sourceFileName, worksheetName: sheet.name, importedAt: new Date().toISOString(), rows };
}

export function mergeBranchTransferRows(rows: CanonicalBranchTransferRow[]) {
  const merged = new Map<string, CanonicalBranchTransferRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) merged.set(row.rowId, row);
    else if (previous.sourceFingerprint !== row.sourceFingerprint) throw new Error(`Transferencias entre sucursales: la clave ${row.rowId} difiere entre archivos.`);
    else duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}

export function mapCanonicalBranchTransferToRow(row: CanonicalBranchTransferRow) {
  return {
    origen: row.originBranch, destino: row.destinationBranch, fecha_emision: row.emissionDate,
    serie_documento: row.documentSeries, numero_documento: row.documentNumber, item: row.item,
    producto_codigo: row.productCode, producto_descripcion: row.productDescription, cantidad: row.quantity,
    observacion: row.observation, archivo_origen: row.sourceFileName, fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint, datos_fuente: row.raw,
  };
}
