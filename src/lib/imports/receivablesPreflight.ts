export type ReceivablesCurrency = "PYG" | "USD" | "EUR";
export type ReceivablesDocumentNature = "INVOICE" | "CUSTOMER_CREDIT_NOTE" | "CUSTOMER_ADVANCE" | "OTHER";

export const RECEIVABLE_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  NF: "Factura",
  NCC: "Nota de crédito de cliente",
  RA: "Recebimento Antecipado (cobro/recibo anticipado de cliente)",
};

function documentNature(type: string): ReceivablesDocumentNature {
  if (type === "NF") return "INVOICE";
  if (type === "NCC") return "CUSTOMER_CREDIT_NOTE";
  if (type === "RA") return "CUSTOMER_ADVANCE";
  return "OTHER";
}

export interface ReceivablesImportRow {
  clave_origen: string;
  huella_origen: string;
  fecha_corte: string;
  sucursal: string;
  documento: string;
  tipo_documento: string;
  naturaleza_documento: ReceivablesDocumentNature;
  serie: string;
  cuota: string | null;
  fecha_emision: string;
  fecha_vencimiento: string;
  fecha_vencimiento_original: string | null;
  valor_original: number;
  saldo_pendiente: number;
  moneda_codigo: string;
  moneda: ReceivablesCurrency;
  tasa_moneda: number;
  modalidad: string;
  cliente_codigo: string;
  cliente_nombre: string;
  asesor: string;
  condicion: string;
  elegible_kpi: boolean;
  archivo_origen: string;
  fila_origen: number;
  datos_fuente: Record<string, string>;
}

export interface ReceivablesPreflight {
  sourceFileName: string;
  sourceFileSize: number;
  worksheetName: string | null;
  headers: string[];
  sourceRows: number;
  documentRows: number;
  footerRows: number;
  exactDuplicateRows: number;
  conflictingDuplicateKeys: number;
  cutoffDate: string;
  cutoffEvidence: "USER_CONFIRMED";
  issueFrom: string;
  issueTo: string;
  dueFrom: string;
  dueTo: string;
  documents: number;
  installments: number;
  clients: number;
  branches: number;
  advisors: number;
  currencyCodes: string[];
  currencies: ReceivablesCurrency[];
  documentTypes: Record<string, number>;
  missingOriginalDueDate: number;
  grossValue: number;
  sourceNetBalance: number;
  positiveBalanceRows: number;
  positiveBalance: number;
  zeroBalanceRows: number;
  negativeBalanceRows: number;
  negativeBalance: number;
  eligibleInvoiceRows: number;
  eligiblePendingUsd: number;
  overdueInvoiceRows: number;
  overdueUsd: number;
  dueTodayInvoiceRows: number;
  dueTodayUsd: number;
  futureInvoiceRows: number;
  futureUsd: number;
  excludedPositiveNonInvoiceRows: number;
  excludedPositiveNonInvoiceUsd: number;
  customerAdvanceRows: number;
  customerAdvanceBalance: number;
  customerAdvancePositiveRows: number;
  customerAdvancePositiveBalance: number;
  customerAdvanceZeroRows: number;
  customerAdvanceNegativeRows: number;
  customerAdvanceNegativeBalance: number;
  customerAdvanceLinkedRows: 0;
  customerAdvanceApplicationCoverage: "SIN_VINCULO_EXPLICITO";
  warnings: string[];
}

export interface ReceivablesReadOptions {
  batchSize?: number;
  cutoffDate: string;
  sourceLastModified?: number;
  onDocumentBatch?: (rows: ReceivablesImportRow[]) => void | Promise<void>;
}

const CURRENCY_BY_CODE: Record<string, ReceivablesCurrency> = {
  "1": "PYG",
  "2": "USD",
  "3": "EUR",
};

const REQUIRED_HEADERS = [
  "Suc. Orig", "DOCUMENTO", "Tipo", "SERIE", "CUOTA", "Fch Emision", "Vencimiento",
  "VALOR", "SALDO", "Moneda", "Tasa moneda", "Modalidad", "CLIENTE", "Nombre", "ASESOR",
  "Vencto Orig", "Condicion",
] as const;

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'").replace(/&amp;/gi, "&");
}

function xmlAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeXmlEntities(match[2]) : null;
}

function materializeRow(rowBody: string) {
  const values: string[] = [];
  let cursor = 0;
  for (const cell of rowBody.matchAll(/<(?:[\w.-]+:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?Cell\s*>)/gi)) {
    const requested = xmlAttribute(cell[1], "Index");
    if (requested) {
      const requestedIndex = Math.max(Number(requested) - 1, 0);
      while (cursor < requestedIndex) {
        values.push("");
        cursor += 1;
      }
    }
    const data = (cell[2] ?? "").match(/<(?:[\w.-]+:)?Data\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Data\s*>/i);
    values.push(data ? decodeXmlEntities(data[1].replace(/<[^>]*>/g, "")).trim() : "");
    cursor += 1;
  }
  return values;
}

function uniqueHeaders(values: string[]) {
  const occurrences = new Map<string, number>();
  return values.map((value, index) => {
    const base = value.trim() || `col_${index + 1}`;
    const count = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
}

function sourceNumber(value: string, field: string, row: number) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) throw new Error(`fila ${row}: ${field} está vacío`);
  let canonical = normalized;
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(normalized)) canonical = normalized.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(normalized)) canonical = normalized.replace(/,/g, "");
  else if (normalized.includes(",") && !normalized.includes(".")) canonical = normalized.replace(",", ".");
  const parsed = Number(canonical);
  if (!Number.isFinite(parsed)) throw new Error(`fila ${row}: ${field} no es numérico (${value})`);
  return parsed;
}

function money(value: string, field: string, row: number) {
  return Math.round((sourceNumber(value, field, row) + Number.EPSILON) * 100) / 100;
}

function sourceDate(value: string, field: string, row: number) {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`))) {
    throw new Error(`fila ${row}: ${field} no tiene fecha ISO válida (${value})`);
  }
  return match[1];
}

function addMoney(left: number, right: number) {
  return Math.round((left + right + Number.EPSILON) * 100) / 100;
}

export async function readReceivablesPreflightFile(
  file: Blob,
  sourceFileName = "cuentas-por-cobrar.xml",
  options: ReceivablesReadOptions = {},
): Promise<ReceivablesPreflight> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("el lote de cuentas por cobrar debe contener entre 1 y 500 filas");
  }

  const prefixBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const prefix = new TextDecoder("ascii").decode(prefixBytes);
  if (!prefix.includes("<Workbook") && !prefix.includes("<ss:Workbook")) {
    throw new Error("no es un libro SpreadsheetML de Excel");
  }
  const declared = prefix.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const encoding = declared === "iso-8859-1" || declared === "latin1" || declared === "windows-1252" ? "windows-1252" : "utf-8";
  const reader = file.stream().getReader();
  const decoder = new TextDecoder(encoding);

  let buffer = "";
  let worksheetName: string | null = null;
  let headers: string[] = [];
  let headerIndex = new Map<string, number>();
  let sourceRows = 0;
  let documentRows = 0;
  let footerRows = 0;
  let exactDuplicateRows = 0;
  let conflictingDuplicateKeys = 0;
  let issueFrom: string | null = null;
  let issueTo: string | null = null;
  let dueFrom: string | null = null;
  let dueTo: string | null = null;
  let physicalRow = 0;
  let missingOriginalDueDate = 0;
  let grossValue = 0;
  let sourceNetBalance = 0;
  let positiveBalanceRows = 0;
  let positiveBalance = 0;
  let zeroBalanceRows = 0;
  let negativeBalanceRows = 0;
  let negativeBalance = 0;
  let eligibleInvoiceRows = 0;
  let eligiblePendingUsd = 0;
  let overdueInvoiceRows = 0;
  let overdueUsd = 0;
  let dueTodayInvoiceRows = 0;
  let dueTodayUsd = 0;
  let futureInvoiceRows = 0;
  let futureUsd = 0;
  let excludedPositiveNonInvoiceRows = 0;
  let excludedPositiveNonInvoiceUsd = 0;
  let customerAdvanceRows = 0;
  let customerAdvanceBalance = 0;
  let customerAdvancePositiveRows = 0;
  let customerAdvancePositiveBalance = 0;
  let customerAdvanceZeroRows = 0;
  let customerAdvanceNegativeRows = 0;
  let customerAdvanceNegativeBalance = 0;
  const branches = new Set<string>();
  const advisors = new Set<string>();
  const clients = new Set<string>();
  const documents = new Set<string>();
  const installments = new Set<string>();
  const currencyCodes = new Set<string>();
  const currencies = new Set<ReceivablesCurrency>();
  const documentTypes: Record<string, number> = {};
  const seen = new Map<string, string>();
  const parsedRows: Array<Omit<ReceivablesImportRow, "clave_origen" | "fecha_corte" | "elegible_kpi">> = [];

  const at = (row: string[], header: string) => row[headerIndex.get(normalizeHeader(header)) ?? -1]?.trim() ?? "";
  const consumeRow = (rowBody: string) => {
    const row = materializeRow(rowBody);
    physicalRow += 1;
    if (!headers.length) {
      headers = uniqueHeaders(row);
      headerIndex = new Map(headers.map((header, index) => [normalizeHeader(header), index]));
      return;
    }
    if (!row.some((value) => value !== "")) return;
    sourceRows += 1;

    const document = at(row, "DOCUMENTO");
    const issueRaw = at(row, "Fch Emision");
    const currencyCode = at(row, "Moneda");
    if (!document && (!issueRaw || currencyCode === "0")) {
      footerRows += 1;
      return;
    }

    const requiredValues = ["Suc. Orig", "DOCUMENTO", "Tipo", "SERIE", "Fch Emision", "Vencimiento", "VALOR", "SALDO", "Moneda", "Tasa moneda", "Modalidad", "CLIENTE", "Nombre", "ASESOR", "Condicion"];
    const missing = requiredValues.filter((header) => !at(row, header));
    if (missing.length) throw new Error(`fila ${physicalRow}: faltan campos obligatorios (${missing.join(", ")})`);

    const issueDate = sourceDate(issueRaw, "Fch Emision", physicalRow);
    const dueDate = sourceDate(at(row, "Vencimiento"), "Vencimiento", physicalRow);
    const originalDueRaw = at(row, "Vencto Orig");
    const originalDueDate = originalDueRaw ? sourceDate(originalDueRaw, "Vencto Orig", physicalRow) : null;
    const originalValue = money(at(row, "VALOR"), "VALOR", physicalRow);
    const balance = money(at(row, "SALDO"), "SALDO", physicalRow);
    const currency = CURRENCY_BY_CODE[currencyCode];
    if (!currency) throw new Error(`fila ${physicalRow}: código de moneda no soportado (${currencyCode})`);
    const source = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    const branch = at(row, "Suc. Orig");
    const type = at(row, "Tipo");
    const nature = documentNature(type);
    const series = at(row, "SERIE");
    const installment = at(row, "CUOTA") || null;
    const customerCode = at(row, "CLIENTE");
    const identity = [branch, type, series, document, installment ?? "", customerCode].join("|");
    const fingerprint = JSON.stringify(headers.map((header) => source[header] ?? ""));
    const previous = seen.get(identity);
    if (previous) {
      if (previous === fingerprint) {
        exactDuplicateRows += 1;
        return;
      }
      conflictingDuplicateKeys += 1;
      throw new Error(`fila ${physicalRow}: la clave documental ${identity} se repite con contenido distinto`);
    }
    seen.set(identity, fingerprint);

    issueFrom = !issueFrom || issueDate < issueFrom ? issueDate : issueFrom;
    issueTo = !issueTo || issueDate > issueTo ? issueDate : issueTo;
    dueFrom = !dueFrom || dueDate < dueFrom ? dueDate : dueFrom;
    dueTo = !dueTo || dueDate > dueTo ? dueDate : dueTo;
    if (!originalDueDate) missingOriginalDueDate += 1;
    branches.add(branch);
    advisors.add(at(row, "ASESOR"));
    clients.add(customerCode);
    documents.add([branch, type, series, document, customerCode].join("|"));
    installments.add(identity);
    currencyCodes.add(currencyCode);
    currencies.add(currency);
    documentTypes[type] = (documentTypes[type] ?? 0) + 1;
    grossValue = addMoney(grossValue, originalValue);
    sourceNetBalance = addMoney(sourceNetBalance, balance);
    if (balance > 0) {
      positiveBalanceRows += 1;
      positiveBalance = addMoney(positiveBalance, balance);
    } else if (balance === 0) zeroBalanceRows += 1;
    else {
      negativeBalanceRows += 1;
      negativeBalance = addMoney(negativeBalance, balance);
    }
    if (nature === "CUSTOMER_ADVANCE") {
      customerAdvanceRows += 1;
      customerAdvanceBalance = addMoney(customerAdvanceBalance, balance);
      if (balance > 0) {
        customerAdvancePositiveRows += 1;
        customerAdvancePositiveBalance = addMoney(customerAdvancePositiveBalance, balance);
      } else if (balance === 0) customerAdvanceZeroRows += 1;
      else {
        customerAdvanceNegativeRows += 1;
        customerAdvanceNegativeBalance = addMoney(customerAdvanceNegativeBalance, balance);
      }
    }

    parsedRows.push({
      huella_origen: fingerprint,
      sucursal: branch,
      documento: document,
      tipo_documento: type,
      naturaleza_documento: nature,
      serie: series,
      cuota: installment,
      fecha_emision: issueDate,
      fecha_vencimiento: dueDate,
      fecha_vencimiento_original: originalDueDate,
      valor_original: originalValue,
      saldo_pendiente: balance,
      moneda_codigo: currencyCode,
      moneda: currency,
      tasa_moneda: sourceNumber(at(row, "Tasa moneda"), "Tasa moneda", physicalRow),
      modalidad: at(row, "Modalidad"),
      cliente_codigo: customerCode,
      cliente_nombre: at(row, "Nombre"),
      asesor: at(row, "ASESOR"),
      condicion: at(row, "Condicion"),
      archivo_origen: sourceFileName,
      fila_origen: physicalRow,
      datos_fuente: source,
    });
    documentRows += 1;
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    if (!worksheetName) {
      const worksheet = buffer.match(/<(?:[\w.-]+:)?Worksheet\b([^>]*)>/i);
      if (worksheet) worksheetName = xmlAttribute(worksheet[1], "Name");
    }
    while (true) {
      const open = buffer.match(/<(?:[\w.-]+:)?Row\b[^>]*>/i);
      if (!open || open.index === undefined) break;
      const remainder = buffer.slice(open.index + open[0].length);
      const close = remainder.match(/<\/(?:[\w.-]+:)?Row\s*>/i);
      if (!close || close.index === undefined) {
        buffer = buffer.slice(open.index);
        break;
      }
      consumeRow(remainder.slice(0, close.index));
      buffer = remainder.slice(close.index + close[0].length);
    }
    if (done) break;
    if (!/<(?:[\w.-]+:)?Row\b/i.test(buffer) && buffer.length > 16_384) buffer = buffer.slice(-16_384);
  }

  if (!headers.length) throw new Error("no contiene filas SpreadsheetML legibles");
  const absent = REQUIRED_HEADERS.filter((header) => !headerIndex.has(normalizeHeader(header)));
  if (absent.length) throw new Error(`faltan columnas requeridas de cuentas por cobrar: ${absent.join(", ")}`);
  if (!documentRows || !issueFrom || !issueTo || !dueFrom || !dueTo) throw new Error("no contiene documentos de cuentas por cobrar");
  if (!options.cutoffDate) throw new Error("la fecha de corte debe ser confirmada por el usuario; no se infiere del archivo");
  if (currencies.size !== 1 || !currencies.has("USD")) {
    throw new Error(`esta carga de mora exige una única moneda USD; monedas observadas: ${[...currencies].sort().join(", ")}`);
  }
  const cutoffDate = options.cutoffDate;
  if (cutoffDate < issueTo) throw new Error(`el corte ${cutoffDate} es anterior a la fecha máxima de emisión observada ${issueTo}`);

  const pendingBatch: ReceivablesImportRow[] = [];
  for (const row of parsedRows) {
    const identity = [row.sucursal, row.tipo_documento, row.serie, row.documento, row.cuota ?? "", row.cliente_codigo].join("|");
    const eligible = row.moneda === "USD" && row.tipo_documento === "NF" && row.saldo_pendiente > 0;
    if (eligible) {
      eligibleInvoiceRows += 1;
      eligiblePendingUsd = addMoney(eligiblePendingUsd, row.saldo_pendiente);
      if (row.fecha_vencimiento < cutoffDate) {
        overdueInvoiceRows += 1;
        overdueUsd = addMoney(overdueUsd, row.saldo_pendiente);
      } else if (row.fecha_vencimiento === cutoffDate) {
        dueTodayInvoiceRows += 1;
        dueTodayUsd = addMoney(dueTodayUsd, row.saldo_pendiente);
      } else {
        futureInvoiceRows += 1;
        futureUsd = addMoney(futureUsd, row.saldo_pendiente);
      }
    } else if (row.moneda === "USD" && row.tipo_documento !== "NF" && row.saldo_pendiente > 0) {
      excludedPositiveNonInvoiceRows += 1;
      excludedPositiveNonInvoiceUsd = addMoney(excludedPositiveNonInvoiceUsd, row.saldo_pendiente);
    }
    if (options.onDocumentBatch) {
      pendingBatch.push({ ...row, clave_origen: `${cutoffDate}|${identity}`, fecha_corte: cutoffDate, elegible_kpi: eligible });
      if (pendingBatch.length >= batchSize) {
        await options.onDocumentBatch(pendingBatch.splice(0, pendingBatch.length));
      }
    }
  }
  if (pendingBatch.length && options.onDocumentBatch) await options.onDocumentBatch(pendingBatch.splice(0, pendingBatch.length));

  const warnings: string[] = [];
  if (footerRows) warnings.push(`${footerRows} filas de título/control fueron excluidas.`);
  if (zeroBalanceRows) warnings.push(`${zeroBalanceRows} documentos con saldo cero se conservaron y no integran mora.`);
  if (negativeBalanceRows) warnings.push(`${negativeBalanceRows} documentos con saldo negativo se conservaron separados y no compensan facturas sin vínculo explícito.`);
  if (excludedPositiveNonInvoiceRows) warnings.push(`${excludedPositiveNonInvoiceRows} saldos positivos de tipos no NF quedaron fuera del KPI hasta definir su tratamiento.`);
  if (missingOriginalDueDate) warnings.push(`${missingOriginalDueDate} documentos no informan vencimiento original; conservan el vencimiento vigente.`);
  if (customerAdvanceRows) warnings.push(`${customerAdvanceRows} RA son anticipos de clientes; la fuente no identifica su aplicación a facturas y se informan separados.`);

  return {
    sourceFileName,
    sourceFileSize: file.size,
    worksheetName,
    headers,
    sourceRows,
    documentRows,
    footerRows,
    exactDuplicateRows,
    conflictingDuplicateKeys,
    cutoffDate,
    cutoffEvidence: "USER_CONFIRMED",
    issueFrom,
    issueTo,
    dueFrom,
    dueTo,
    documents: documents.size,
    installments: installments.size,
    clients: clients.size,
    branches: branches.size,
    advisors: advisors.size,
    currencyCodes: [...currencyCodes].sort(),
    currencies: [...currencies].sort(),
    documentTypes,
    missingOriginalDueDate,
    grossValue,
    sourceNetBalance,
    positiveBalanceRows,
    positiveBalance,
    zeroBalanceRows,
    negativeBalanceRows,
    negativeBalance,
    eligibleInvoiceRows,
    eligiblePendingUsd,
    overdueInvoiceRows,
    overdueUsd,
    dueTodayInvoiceRows,
    dueTodayUsd,
    futureInvoiceRows,
    futureUsd,
    excludedPositiveNonInvoiceRows,
    excludedPositiveNonInvoiceUsd,
    customerAdvanceRows,
    customerAdvanceBalance,
    customerAdvancePositiveRows,
    customerAdvancePositiveBalance,
    customerAdvanceZeroRows,
    customerAdvanceNegativeRows,
    customerAdvanceNegativeBalance,
    customerAdvanceLinkedRows: 0,
    customerAdvanceApplicationCoverage: "SIN_VINCULO_EXPLICITO",
    warnings,
  };
}
