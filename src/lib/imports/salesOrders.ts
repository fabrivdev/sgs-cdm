import type { CanonicalImportEnvelope, CanonicalSalesOrderRow } from "@/lib/imports/canonical";
import { normalizeDateLike, normalizeText, parseFlexibleNumber } from "@/lib/imports/fiscal";
import { normalizeStableKey } from "@/lib/imports/mappings";
import type { SpreadsheetXmlSheet } from "@/lib/imports/xmlSpreadsheet";

const EXPECTED_HEADERS = [
  "FILIAL", "Fch Emision", "Cliente", "Nombre", "VENDEDOR", "CNDPAG", "NATURALEZA",
  "GENERA", "MONEDA", "Nro Pedido", "Item", "Producto", "Cod Faricant", "Descripcion",
  "Unidad", "Cantidad", "Prc Unitario", "Vlr.Total", "Ctd.Entregad", "PENDIENTE",
  "ESTADO", "NUMPRESU", "ITEMPRESU", "Serie Fact.", "Factura", "TIPENT",
];

const value = (row: Record<string, unknown>, header: string) => row[header];
const text = (row: Record<string, unknown>, header: string) => normalizeText(value(row, header));
const displayText = (row: Record<string, unknown>, header: string) =>
  String(value(row, header) ?? "").trim().replace(/\s+/g, " ");

function requiredNumber(row: Record<string, unknown>, header: string, sourceRow: number) {
  const raw = String(value(row, header) ?? "").trim();
  if (!raw || !/[0-9]/.test(raw)) {
    throw new Error(`Pedidos de venta: fila ${sourceRow} con ${header} no num\u00e9rico o vac\u00edo.`);
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
      `Pedidos de venta: estructura inesperada (${sheet.headers.length} columnas). ${mismatches.slice(0, 3).join("; ")}`,
    );
  }
}

function fingerprint(values: unknown[]) {
  return JSON.stringify(values.map((item) => item == null ? null : item));
}

export interface SalesOrderDiagnostics {
  rows: number;
  from: string | null;
  to: string | null;
  branches: number;
  ordersByBranch: number;
  pendingRows: number;
  pendingQuantity: number;
  duplicateKeys: number;
}

export type SalesOrderEnvelope = CanonicalImportEnvelope<CanonicalSalesOrderRow> & {
  diagnostics: SalesOrderDiagnostics;
};

export function mapSalesOrderSheet(sourceFileName: string, sheet: SpreadsheetXmlSheet): SalesOrderEnvelope {
  validateHeaders(sheet);
  const seen = new Set<string>();
  let duplicateKeys = 0;

  const rows = sheet.rows.map((raw, index): CanonicalSalesOrderRow => {
    const sourceRow = index + 2;
    const branch = text(raw, "FILIAL");
    const emissionDate = normalizeDateLike(value(raw, "Fch Emision"));
    const orderNumber = text(raw, "Nro Pedido");
    const item = text(raw, "Item");
    const productCode = text(raw, "Producto");
    const required = [
      ["FILIAL", branch], ["Fch Emision", emissionDate], ["Nro Pedido", orderNumber],
      ["Item", item], ["Producto", productCode],
    ].filter(([, fieldValue]) => !fieldValue).map(([name]) => name);
    if (required.length) throw new Error(`Pedidos de venta: fila ${sourceRow} sin ${required.join(", ")}.`);

    const quantity = requiredNumber(raw, "Cantidad", sourceRow);
    const unitPrice = requiredNumber(raw, "Prc Unitario", sourceRow);
    const totalValue = requiredNumber(raw, "Vlr.Total", sourceRow);
    const deliveredQuantity = requiredNumber(raw, "Ctd.Entregad", sourceRow);
    const pendingQuantity = requiredNumber(raw, "PENDIENTE", sourceRow);
    const rowId = [branch, orderNumber, item].map(normalizeStableKey).join("|");
    if (seen.has(rowId)) duplicateKeys += 1;
    seen.add(rowId);

    const customerCode = text(raw, "Cliente") || null;
    const customerName = displayText(raw, "Nombre") || null;
    const seller = displayText(raw, "VENDEDOR") || null;
    const paymentCondition = displayText(raw, "CNDPAG") || null;
    const nature = displayText(raw, "NATURALEZA") || null;
    const generates = displayText(raw, "GENERA") || null;
    const currency = displayText(raw, "MONEDA") || null;
    const manufacturerCode = text(raw, "Cod Faricant") || null;
    const description = displayText(raw, "Descripcion") || null;
    const unit = text(raw, "Unidad") || null;
    const status = displayText(raw, "ESTADO") || null;
    const quoteNumber = text(raw, "NUMPRESU") || null;
    const quoteItem = text(raw, "ITEMPRESU") || null;
    const invoiceSeries = text(raw, "Serie Fact.") || null;
    const invoiceNumber = text(raw, "Factura") || null;
    const entryType = displayText(raw, "TIPENT") || null;
    const sourceFingerprint = fingerprint([
      branch, emissionDate, customerCode, customerName, seller, paymentCondition, nature,
      generates, currency, orderNumber, item, productCode, manufacturerCode, description,
      unit, quantity, unitPrice, totalValue, deliveredQuantity, pendingQuantity, status,
      quoteNumber, quoteItem, invoiceSeries, invoiceNumber, entryType,
    ]);

    return {
      rowId, sourceFileName, sourceRow, branch, emissionDate: emissionDate!, customerCode,
      customerName, seller, paymentCondition, nature, generates, currency, orderNumber,
      item, productCode, manufacturerCode, description, unit, quantity, unitPrice,
      totalValue, deliveredQuantity, pendingQuantity, status, quoteNumber, quoteItem,
      invoiceSeries, invoiceNumber, entryType, sourceFingerprint, raw,
    };
  });

  if (duplicateKeys) {
    throw new Error(`Pedidos de venta: ${duplicateKeys} claves FILIAL + Nro Pedido + Item repetidas.`);
  }
  const dates = rows.map((row) => row.emissionDate).sort();
  const pendingRows = rows.filter((row) => row.pendingQuantity !== 0);
  return {
    sourceSystem: "totvs_pedidos_venta",
    sourceFileName,
    worksheetName: sheet.name,
    importedAt: new Date().toISOString(),
    rows,
    diagnostics: {
      rows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      branches: new Set(rows.map((row) => row.branch)).size,
      ordersByBranch: new Set(rows.map((row) => `${row.branch}|${row.orderNumber}`)).size,
      pendingRows: pendingRows.length,
      pendingQuantity: Number(pendingRows.reduce((sum, row) => sum + row.pendingQuantity, 0).toFixed(6)),
      duplicateKeys,
    },
  };
}

export function mapCanonicalSalesOrderToRow(row: CanonicalSalesOrderRow) {
  return {
    filial: row.branch,
    fecha_emision: row.emissionDate,
    cliente_codigo: row.customerCode,
    cliente_nombre: row.customerName,
    vendedor: row.seller,
    condicion_pago: row.paymentCondition,
    naturaleza: row.nature,
    genera: row.generates,
    moneda: row.currency,
    nro_pedido: row.orderNumber,
    item: row.item,
    producto_codigo: row.productCode,
    fabricante_codigo: row.manufacturerCode,
    descripcion: row.description,
    unidad: row.unit,
    cantidad: row.quantity,
    precio_unitario: row.unitPrice,
    valor_total: row.totalValue,
    cantidad_entregada: row.deliveredQuantity,
    cantidad_pendiente: row.pendingQuantity,
    estado: row.status,
    nro_presupuesto: row.quoteNumber,
    item_presupuesto: row.quoteItem,
    serie_factura: row.invoiceSeries,
    factura: row.invoiceNumber,
    tipo_entrada: row.entryType,
    archivo_origen: row.sourceFileName,
    fila_origen: row.sourceRow,
    huella_origen: row.sourceFingerprint,
    datos_fuente: row.raw,
  };
}

export function mergeSalesOrderRows(rows: CanonicalSalesOrderRow[]) {
  const merged = new Map<string, CanonicalSalesOrderRow>();
  let duplicatesSkipped = 0;
  for (const row of rows) {
    const previous = merged.get(row.rowId);
    if (!previous) {
      merged.set(row.rowId, row);
      continue;
    }
    if (previous.sourceFingerprint !== row.sourceFingerprint) {
      throw new Error(
        `Pedidos de venta: la clave ${row.rowId} difiere entre ${previous.sourceFileName} (fila ${previous.sourceRow}) y ${row.sourceFileName} (fila ${row.sourceRow}).`,
      );
    }
    duplicatesSkipped += 1;
  }
  return { rows: [...merged.values()], duplicatesSkipped };
}
