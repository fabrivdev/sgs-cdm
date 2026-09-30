import type { CanonicalImportEnvelope, CanonicalPurchaseInvoiceRow } from "@/lib/imports/canonical";
import { normalizeCompactDate, normalizeDateLike, normalizeText, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = [
  "FILIAL", "Fch Emision", "Fecha Digit.", "PROVEEDOR", "LOJA", "NOMBRE", "MONORI",
  "ESPECIE", "MODALIDAD", "DOCELEC", "TIMBRADO", "SERIE", "DOCUMENTO", "ITEM",
  "CODIGO", "PRODUCTO", "CANTIDAD", "VUNITGS", "TOTALGS", "VUNITUSD", "TOTALUSD",
  "TIPOES", "CUENTA", "CCOSTO", "TIPCAM", "PEDIDO", "ITEMPC", "FCHVEN", "OBSERV",
  "NROREI", "REINTEGRO", "USRALT",
];

const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const display = (row: Record<string, unknown>, header: string) => String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

function validateHeaders(sheet: SpreadsheetXmlSheet) {
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) =>
    sheet.headers[index] === expected ? [] : [`columna ${index + 1}: se esperaba "${expected}" y llegó "${sheet.headers[index] ?? "vacía"}"`],
  );
  if (mismatches.length || sheet.headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(`Facturas de compra: estructura inesperada. ${mismatches.slice(0, 3).join("; ")}`);
  }
}

function requiredNumber(row: Record<string, unknown>, header: string, sourceRow: number) {
  const raw = String(value(row, header) ?? "").trim();
  if (!raw || !/\d/.test(raw)) throw new Error(`Facturas de compra: fila ${sourceRow} con ${header} no numérico o vacío.`);
  return parseFlexibleNumber(raw);
}

function fingerprint(values: unknown[]) {
  return JSON.stringify(values.map((item) => item == null ? null : item));
}

export interface PurchaseInvoiceDiagnostics {
  rows: number;
  from: string | null;
  to: string | null;
  suppliers: number;
  documents: number;
  sourceCurrencies: string[];
  documentKinds: string[];
}

export type PurchaseInvoiceEnvelope = CanonicalImportEnvelope<CanonicalPurchaseInvoiceRow> & { diagnostics: PurchaseInvoiceDiagnostics };

export function mapPurchaseInvoiceSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): PurchaseInvoiceEnvelope {
  validateHeaders(sheet);
  const seen = new Set<string>();
  const rows = sheet.rows.map((raw, index): CanonicalPurchaseInvoiceRow => {
    const sourceRow = index + 2;
    const branch = text(raw, "FILIAL");
    const emissionDate = normalizeDateLike(value(raw, "Fch Emision"));
    const entryDate = normalizeDateLike(value(raw, "Fecha Digit."));
    const supplierCode = text(raw, "PROVEEDOR");
    const supplierStore = text(raw, "LOJA");
    const series = text(raw, "SERIE");
    const documentNumber = text(raw, "DOCUMENTO");
    const item = text(raw, "ITEM");
    const productCode = text(raw, "CODIGO");
    if (!branch || !emissionDate || !entryDate || !supplierCode || !supplierStore || !documentNumber || !item || !productCode) {
      throw new Error(`Facturas de compra: fila ${sourceRow} sin clave, fecha, proveedor o producto obligatorio.`);
    }
    const rowId = [branch, supplierCode, supplierStore, series, documentNumber, item].map(normalizeStableKey).join("|");
    if (seen.has(rowId)) throw new Error(`Facturas de compra: clave filial + proveedor + tienda + serie + documento + item repetida en fila ${sourceRow}.`);
    seen.add(rowId);

    const quantity = requiredNumber(raw, "CANTIDAD", sourceRow);
    const unitValueGs = requiredNumber(raw, "VUNITGS", sourceRow);
    const totalValueGs = requiredNumber(raw, "TOTALGS", sourceRow);
    const unitValueUsd = requiredNumber(raw, "VUNITUSD", sourceRow);
    const totalValueUsd = requiredNumber(raw, "TOTALUSD", sourceRow);
    const exchangeRate = requiredNumber(raw, "TIPCAM", sourceRow);
    const sourceCurrency = display(raw, "MONORI");
    const documentKind = text(raw, "ESPECIE").toUpperCase();
    if (!sourceCurrency || !documentKind) throw new Error(`Facturas de compra: fila ${sourceRow} sin MONORI o ESPECIE.`);
    const dueDate = normalizeDateLike(value(raw, "FCHVEN")) ?? normalizeCompactDate(value(raw, "FCHVEN"));
    const sourceFingerprint = fingerprint([
      branch, emissionDate, entryDate, supplierCode, supplierStore, display(raw, "NOMBRE"), sourceCurrency,
      documentKind, display(raw, "MODALIDAD"), text(raw, "DOCELEC"), text(raw, "TIMBRADO"), series,
      documentNumber, item, productCode, display(raw, "PRODUCTO"), quantity, unitValueGs, totalValueGs,
      unitValueUsd, totalValueUsd, display(raw, "TIPOES"), display(raw, "CUENTA"), display(raw, "CCOSTO"),
      exchangeRate, text(raw, "PEDIDO"), text(raw, "ITEMPC"), dueDate, display(raw, "OBSERV"),
      text(raw, "NROREI"), display(raw, "REINTEGRO"), display(raw, "USRALT"),
    ]);
    return {
      rowId, sourceFileName, sourceRow, branch, emissionDate, entryDate, supplierCode, supplierStore,
      supplierName: display(raw, "NOMBRE") || null, sourceCurrency, documentKind,
      modality: display(raw, "MODALIDAD") || null, electronicDocument: text(raw, "DOCELEC") || null,
      stampNumber: text(raw, "TIMBRADO") || null, series, documentNumber, item, productCode,
      productDescription: display(raw, "PRODUCTO") || null, quantity, unitValueGs, totalValueGs,
      unitValueUsd, totalValueUsd, entryType: display(raw, "TIPOES") || null,
      accountingAccount: display(raw, "CUENTA") || null, costCenter: display(raw, "CCOSTO") || null,
      exchangeRate, purchaseOrderNumber: text(raw, "PEDIDO") || null,
      purchaseOrderItem: text(raw, "ITEMPC") || null, dueDate, observation: display(raw, "OBSERV") || null,
      reimbursementNumber: text(raw, "NROREI") || null, reimbursement: display(raw, "REINTEGRO") || null,
      createdBy: display(raw, "USRALT") || null, sourceFingerprint, raw,
    };
  });
  const dates = rows.map((row) => row.emissionDate).sort();
  return {
    sourceSystem: "totvs_facturas_compra", sourceFileName, worksheetName: sheet.name,
    importedAt: new Date().toISOString(), rows,
    diagnostics: {
      rows: rows.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
      suppliers: new Set(rows.map((row) => `${row.supplierCode}|${row.supplierStore}`)).size,
      documents: new Set(rows.map((row) => `${row.branch}|${row.series}|${row.documentNumber}`)).size,
      sourceCurrencies: [...new Set(rows.map((row) => row.sourceCurrency))].sort(),
      documentKinds: [...new Set(rows.map((row) => row.documentKind))].sort(),
    },
  };
}

export function mergePurchaseInvoiceRows(rows: CanonicalPurchaseInvoiceRow[]) {
  const merged = new Map<string, CanonicalPurchaseInvoiceRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) merged.set(row.rowId, row);
    else if (previous.sourceFingerprint !== row.sourceFingerprint) {
      throw new Error(`Facturas de compra: la clave ${row.rowId} difiere entre ${previous.sourceFileName} (fila ${previous.sourceRow}) y ${row.sourceFileName} (fila ${row.sourceRow}).`);
    } else duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}

export function mapCanonicalPurchaseInvoiceToRow(row: CanonicalPurchaseInvoiceRow) {
  return {
    filial: row.branch, fecha_emision: row.emissionDate, fecha_digitacion: row.entryDate,
    proveedor_codigo: row.supplierCode, proveedor_tienda: row.supplierStore, proveedor_nombre: row.supplierName,
    moneda_origen: row.sourceCurrency, especie: row.documentKind, modalidad: row.modality,
    documento_electronico: row.electronicDocument, timbrado: row.stampNumber, serie: row.series,
    documento: row.documentNumber, item: row.item, producto_codigo: row.productCode,
    producto_descripcion: row.productDescription, cantidad: row.quantity, valor_unitario_gs: row.unitValueGs,
    total_gs: row.totalValueGs, valor_unitario_usd: row.unitValueUsd, total_usd: row.totalValueUsd,
    tipo_entrada: row.entryType, cuenta_contable: row.accountingAccount, centro_costo: row.costCenter,
    tipo_cambio: row.exchangeRate, pedido_compra: row.purchaseOrderNumber, item_pedido_compra: row.purchaseOrderItem,
    fecha_vencimiento: row.dueDate, observacion: row.observation, nro_reintegro: row.reimbursementNumber,
    reintegro: row.reimbursement, usuario_alta: row.createdBy, archivo_origen: row.sourceFileName,
    fila_origen: row.sourceRow, huella_origen: row.sourceFingerprint, datos_fuente: row.raw,
  };
}
