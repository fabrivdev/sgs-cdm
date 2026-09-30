import type { CanonicalImportDispatchRow, CanonicalImportEnvelope } from "@/lib/imports/canonical";
import { normalizeDateLike, normalizeText, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = [
  "Sucursal", "Proceso", "Fch Proceso", "DESPACHANT", "Finalizacion", "Item",
  "Proveedor", "PROVEEDOR", "Serie", "Fecha Emis.", "CNDPAG", "MONEDA",
  "Timbrado", "Numero Docto", "Item_2", "Producto", "PRODUCTO", "CODFAB",
  "Cantidad", "Prc Unitario", "GENERADA", "TIPENT", "PORDER",
];

const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const displayText = (row: Record<string, unknown>, header: string) =>
  String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

function requiredNumber(row: Record<string, unknown>, header: string, sourceRow: number) {
  const raw = String(value(row, header) ?? "").trim();
  if (!raw || !/[0-9]/.test(raw)) {
    throw new Error(`Importaciones - Despacho: fila ${sourceRow} con ${header} no num\u00e9rico o vac\u00edo.`);
  }
  return parseFlexibleNumber(raw);
}

function validateHeaders(sheet: SpreadsheetXmlSheet) {
  const actual = sheet.headers.slice(0, EXPECTED_HEADERS.length);
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) =>
    actual[index] === expected ? [] : [`columna ${index + 1}: se esperaba "${expected}" y lleg\u00f3 "${actual[index] ?? "vac\u00eda"}"`],
  );
  if (mismatches.length || sheet.headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(
      `Importaciones - Despacho: estructura inesperada (${sheet.headers.length} columnas). ${mismatches.slice(0, 3).join("; ")}`,
    );
  }
}

function fingerprint(values: unknown[]) {
  return JSON.stringify(values.map((item) => item == null ? null : item));
}

export interface ImportDispatchDiagnostics {
  rows: number;
  from: string | null;
  to: string | null;
  branches: number;
  processes: number;
  quantity: number;
  duplicateKeys: number;
}

export type ImportDispatchEnvelope = CanonicalImportEnvelope<CanonicalImportDispatchRow> & {
  diagnostics: ImportDispatchDiagnostics;
};

export function mapImportDispatchSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): ImportDispatchEnvelope {
  validateHeaders(sheet);
  const seen = new Set<string>();
  let duplicateKeys = 0;

  const rows = sheet.rows.map((raw, index): CanonicalImportDispatchRow => {
    const sourceRow = index + 2;
    const branch = text(raw, "Sucursal");
    const processNumber = text(raw, "Proceso");
    const processDate = normalizeDateLike(value(raw, "Fch Proceso"));
    const processItem = text(raw, "Item");
    const documentNumber = text(raw, "Numero Docto");
    const documentItem = text(raw, "Item_2");
    const productCode = text(raw, "Producto");
    const required = [
      ["Sucursal", branch], ["Proceso", processNumber], ["Fch Proceso", processDate],
      ["Item (proceso)", processItem], ["Numero Docto", documentNumber],
      ["Item (documento)", documentItem], ["Producto", productCode],
    ].filter(([, fieldValue]) => !fieldValue).map(([name]) => name);
    if (required.length) {
      throw new Error(`Importaciones - Despacho: fila ${sourceRow} sin ${required.join(", ")}.`);
    }

    const quantity = requiredNumber(raw, "Cantidad", sourceRow);
    const unitPrice = requiredNumber(raw, "Prc Unitario", sourceRow);
    const rowId = [branch, processNumber, processItem, documentNumber, documentItem, productCode]
      .map(normalizeStableKey).join("|");
    if (seen.has(rowId)) duplicateKeys += 1;
    seen.add(rowId);

    const customsBroker = displayText(raw, "DESPACHANT") || null;
    const completionDate = normalizeDateLike(value(raw, "Finalizacion"));
    const supplierCode = text(raw, "Proveedor") || null;
    const supplierName = displayText(raw, "PROVEEDOR") || null;
    const series = text(raw, "Serie") || null;
    const documentDate = normalizeDateLike(value(raw, "Fecha Emis."));
    const paymentCondition = displayText(raw, "CNDPAG") || null;
    const currency = displayText(raw, "MONEDA") || null;
    const stampNumber = text(raw, "Timbrado") || null;
    const productDescription = displayText(raw, "PRODUCTO") || null;
    const manufacturerCode = text(raw, "CODFAB") || null;
    const generated = text(raw, "GENERADA") || null;
    const entryType = displayText(raw, "TIPENT") || null;
    const purchaseOrderReference = text(raw, "PORDER") || null;
    const sourceFingerprint = fingerprint([
      branch, processNumber, processDate, customsBroker, completionDate, processItem,
      supplierCode, supplierName, series, documentDate, paymentCondition, currency,
      stampNumber, documentNumber, documentItem, productCode, productDescription,
      manufacturerCode, quantity, unitPrice, generated, entryType, purchaseOrderReference,
    ]);

    return {
      rowId, sourceFileName, sourceRow, branch, processNumber, processDate: processDate!,
      customsBroker, completionDate, processItem, supplierCode, supplierName, series,
      documentDate, paymentCondition, currency, stampNumber, documentNumber, documentItem,
      productCode, productDescription, manufacturerCode, quantity, unitPrice, generated,
      entryType, purchaseOrderReference, sourceFingerprint, raw,
    };
  });

  if (duplicateKeys) {
    throw new Error(
      `Importaciones - Despacho: ${duplicateKeys} claves repetidas al grano Sucursal + Proceso + Item proceso + Documento + Item documento + Producto.`,
    );
  }
  const dates = rows.map((row) => row.processDate).sort();
  return {
    sourceSystem: "totvs_importaciones_despacho",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
    diagnostics: {
      rows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      branches: new Set(rows.map((row) => row.branch)).size,
      processes: new Set(rows.map((row) => `${row.branch}|${row.processNumber}`)).size,
      quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      duplicateKeys,
    },
  };
}

export function mapCanonicalImportDispatchToRow(row: CanonicalImportDispatchRow) {
  return {
    sucursal: row.branch,
    proceso: row.processNumber,
    fecha_proceso: row.processDate,
    despachante: row.customsBroker,
    fecha_finalizacion: row.completionDate,
    item_proceso: row.processItem,
    proveedor_codigo: row.supplierCode,
    proveedor_nombre: row.supplierName,
    serie: row.series,
    fecha_documento: row.documentDate,
    condicion_pago: row.paymentCondition,
    moneda: row.currency,
    timbrado: row.stampNumber,
    numero_documento: row.documentNumber,
    item_documento: row.documentItem,
    producto_codigo: row.productCode,
    producto_descripcion: row.productDescription,
    fabricante_codigo: row.manufacturerCode,
    cantidad: row.quantity,
    precio_unitario: row.unitPrice,
    generada: row.generated,
    tipo_entrada: row.entryType,
    referencia_orden_compra: row.purchaseOrderReference,
    archivo_origen: row.sourceFileName,
    fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint,
    datos_fuente: row.raw,
  };
}

export function mergeImportDispatchRows(rows: CanonicalImportDispatchRow[]) {
  const merged = new Map<string, CanonicalImportDispatchRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) {
      merged.set(row.rowId, row);
      continue;
    }
    if (previous.sourceFingerprint !== row.sourceFingerprint) {
      throw new Error(
        `Importaciones - Despacho: la clave ${row.rowId} difiere entre ${previous.sourceFileName} (fila ${previous.sourceRow}) y ${row.sourceFileName} (fila ${row.sourceRow}).`,
      );
    }
    duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}
