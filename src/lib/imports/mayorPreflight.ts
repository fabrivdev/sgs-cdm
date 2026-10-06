export interface MayorTpsldoSummary {
  rows: number;
  amountPyg: number;
  amountUsd: number;
}

export interface MayorPreflight {
  sourceFileName: string;
  sourceFileSize: number;
  worksheetName: string | null;
  currencies: { SALDO01: "PYG"; SALDO02: "USD" };
  headers: string[];
  sourceRows: number;
  movementRows: number;
  footerRows: number;
  from: string | null;
  to: string | null;
  periods: Array<{ period: string; rows: number }>;
  branches: number;
  accounts: number;
  costCenters: number;
  openings: number;
  duplicateCandidateKeys: number;
  missing: {
    account: number;
    accountDescription: number;
    costCenter: number;
    origin: number;
  };
  tpsldo: Record<string, MayorTpsldoSummary>;
  signViolations: { type1Negative: number; type2Positive: number };
  warnings: string[];
}

export interface MayorImportRow {
  clave_origen: string;
  huella_origen: string;
  sucursal: string;
  anio_mes: string | null;
  fecha_fuente: string;
  fecha_movimiento: string;
  lote: string;
  sublote: string;
  documento: string;
  linea: string;
  importe_pyg: number;
  importe_usd: number;
  historial: string | null;
  cuenta_codigo: string | null;
  cuenta_descripcion: string | null;
  centro_costo: string | null;
  centro_costo_descripcion: string | null;
  item_contable: string | null;
  cliente: string | null;
  origen: string | null;
  tipo_movimiento: string;
  tipo_saldo: string;
  contraparte_codigo: string | null;
  contraparte_tienda: string | null;
  documento_asociado: string | null;
  tipo_asiento: string | null;
  fecha_inclusion: string | null;
  usuario_nombre: string | null;
  asiento: string | null;
  es_apertura: boolean;
  requiere_cuarentena: boolean;
  archivo_origen: string;
  fila_origen: number;
  datos_fuente: Record<string, string>;
}

export interface MayorReadOptions {
  batchSize?: number;
  onMovementBatch?: (rows: MayorImportRow[]) => void | Promise<void>;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function xmlAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? decodeXmlEntities(match[2]) : null;
}

function materializeRow(rowBody: string) {
  const values: string[] = [];
  let cursor = 0;
  const cells = rowBody.matchAll(/<(?:[\w.-]+:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?Cell\s*>)/gi);
  for (const cell of cells) {
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

function sourceNumber(value: string) {
  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return 0;
  const decimal = normalized.includes(".") ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number) {
  const result = Number(value.toFixed(6));
  return Math.abs(result) < 0.00001 ? 0 : result;
}

export async function readMayorPreflightFile(
  file: Blob,
  sourceFileName = "libro-mayor.xml",
  options: MayorReadOptions = {},
): Promise<MayorPreflight> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("el lote del Mayor debe contener entre 1 y 500 filas");
  }
  const prefixBytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const asciiPrefix = new TextDecoder("ascii").decode(prefixBytes);
  const declared = asciiPrefix.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const encoding = declared === "iso-8859-1" || declared === "latin1" || declared === "windows-1252"
    ? "windows-1252"
    : "utf-8";
  const decoder = new TextDecoder(encoding);
  const reader = file.stream().getReader();

  let buffer = "";
  let worksheetName: string | null = null;
  let headers: string[] = [];
  let headerIndex = new Map<string, number>();
  let sourceRows = 0;
  let movementRows = 0;
  let footerRows = 0;
  let from: string | null = null;
  let to: string | null = null;
  let openings = 0;
  let duplicateCandidateKeys = 0;
  let type1Negative = 0;
  let type2Positive = 0;
  const periods = new Map<string, number>();
  const branches = new Set<string>();
  const accounts = new Set<string>();
  const costCenters = new Set<string>();
  const keys = new Set<string>();
  const tpsldo: Record<string, MayorTpsldoSummary> = {};
  const missing = { account: 0, accountDescription: 0, costCenter: 0, origin: 0 };
  const pendingBatch: MayorImportRow[] = [];
  let physicalRow = 0;

  const flushBatch = async () => {
    if (!pendingBatch.length || !options.onMovementBatch) return;
    const batch = pendingBatch.splice(0, pendingBatch.length);
    await options.onMovementBatch(batch);
  };

  const valueAt = (row: string[], header: string) => row[headerIndex.get(header) ?? -1]?.trim() ?? "";
  const consumeRow = (rowBody: string) => {
    const row = materializeRow(rowBody);
    physicalRow += 1;
    if (!headers.length) {
      headers = uniqueHeaders(row);
      headerIndex = new Map(headers.map((header, index) => [header.toUpperCase(), index]));
      return;
    }
    if (!row.some((value) => value !== "")) return;
    sourceRows += 1;

    const dateTime = valueAt(row, "FECHA");
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateTime) ? dateTime.slice(0, 10) : "";
    const balanceType = valueAt(row, "TPSLDO");
    if (!date || !balanceType) {
      footerRows += 1;
      return;
    }

    movementRows += 1;
    if (!from || date < from) from = date;
    if (!to || date > to) to = date;
    periods.set(date.slice(0, 7), (periods.get(date.slice(0, 7)) ?? 0) + 1);

    const branch = valueAt(row, "SUCURS");
    const account = valueAt(row, "CUENTA");
    const accountDescription = valueAt(row, "DESC_CTA");
    const costCenter = valueAt(row, "CCOSTO");
    const origin = valueAt(row, "ORIGEN");
    if (branch) branches.add(branch);
    if (account) accounts.add(account); else missing.account += 1;
    if (!accountDescription) missing.accountDescription += 1;
    if (costCenter) costCenters.add(costCenter); else missing.costCenter += 1;
    if (!origin) missing.origin += 1;
    if (valueAt(row, "HIST").toUpperCase() === "APERTURA") openings += 1;

    const amountPyg = sourceNumber(valueAt(row, "SALDO01"));
    const amountUsd = sourceNumber(valueAt(row, "SALDO02"));
    const summary = tpsldo[balanceType] ?? { rows: 0, amountPyg: 0, amountUsd: 0 };
    summary.rows += 1;
    summary.amountPyg += amountPyg;
    summary.amountUsd += amountUsd;
    tpsldo[balanceType] = summary;

    const movementType = valueAt(row, "TIPO_MOV");
    if (movementType === "1" && (amountPyg < 0 || amountUsd < 0)) type1Negative += 1;
    if (movementType === "2" && (amountPyg > 0 || amountUsd > 0)) type2Positive += 1;

    const key = ["SUCURS", "FECHA", "LOTE", "SUBLOTE", "DOCUMENTO", "LINEA"]
      .map((header) => valueAt(row, header))
      .join("|");
    if (keys.has(key)) duplicateCandidateKeys += 1;
    else keys.add(key);

    if (options.onMovementBatch) {
      const raw = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
      const nullable = (header: string) => valueAt(row, header) || null;
      pendingBatch.push({
        clave_origen: key,
        huella_origen: JSON.stringify(headers.map((header) => raw[header] ?? "")),
        sucursal: branch,
        anio_mes: nullable("ANOMES"),
        fecha_fuente: dateTime,
        fecha_movimiento: date,
        lote: valueAt(row, "LOTE"),
        sublote: valueAt(row, "SUBLOTE"),
        documento: valueAt(row, "DOCUMENTO"),
        linea: valueAt(row, "LINEA"),
        importe_pyg: amountPyg,
        importe_usd: amountUsd,
        historial: nullable("HIST"),
        cuenta_codigo: account || null,
        cuenta_descripcion: accountDescription || null,
        centro_costo: costCenter || null,
        centro_costo_descripcion: nullable("DESCCCOS"),
        item_contable: nullable("ITEMC"),
        cliente: nullable("Cliente"),
        origen: origin || null,
        tipo_movimiento: movementType,
        tipo_saldo: balanceType,
        contraparte_codigo: nullable("CLIFOR"),
        contraparte_tienda: nullable("LOJA"),
        documento_asociado: nullable("DOCASOC"),
        tipo_asiento: nullable("T_A"),
        fecha_inclusion: nullable("FECH_INC"),
        usuario_nombre: nullable("USU_NOM"),
        asiento: nullable("ASIENTO"),
        es_apertura: valueAt(row, "HIST").toUpperCase() === "APERTURA",
        requiere_cuarentena: !account,
        archivo_origen: sourceFileName,
        fila_origen: physicalRow,
        datos_fuente: raw,
      });
    }
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
      const bodyStart = open.index + open[0].length;
      const remainder = buffer.slice(bodyStart);
      const close = remainder.match(/<\/(?:[\w.-]+:)?Row\s*>/i);
      if (!close || close.index === undefined) {
        buffer = buffer.slice(open.index);
        break;
      }
      consumeRow(remainder.slice(0, close.index));
      buffer = remainder.slice(close.index + close[0].length);
      if (pendingBatch.length >= batchSize) await flushBatch();
    }

    if (done) break;
    if (!/<(?:[\w.-]+:)?Row\b/i.test(buffer) && buffer.length > 16_384) {
      buffer = buffer.slice(-16_384);
    }
  }

  await flushBatch();

  if (!headers.length) throw new Error("no contiene filas SpreadsheetML legibles");
  const required = ["SUCURS", "FECHA", "SALDO01", "SALDO02", "CUENTA", "TIPO_MOV", "TPSLDO"];
  const absent = required.filter((header) => !headerIndex.has(header));
  if (absent.length) throw new Error(`faltan columnas requeridas del Mayor: ${absent.join(", ")}`);

  for (const summary of Object.values(tpsldo)) {
    summary.amountPyg = rounded(summary.amountPyg);
    summary.amountUsd = rounded(summary.amountUsd);
  }
  const warnings: string[] = [];
  if (footerRows) warnings.push(`${footerRows} filas totalizadoras o no contables fueron excluidas.`);
  if (duplicateCandidateKeys) warnings.push(`${duplicateCandidateKeys} claves candidatas duplicadas requieren revisión.`);
  if (missing.account || missing.accountDescription) warnings.push("Hay movimientos sin cuenta o descripción contable.");
  if (missing.costCenter) warnings.push(`${missing.costCenter} movimientos no tienen centro de costo.`);
  if (missing.origin) warnings.push(`${missing.origin} movimientos no tienen origen.`);
  if (tpsldo["9"]?.rows) warnings.push(`TPSLDO=9 contiene ${tpsldo["9"].rows} movimientos y se muestra separado.`);

  return {
    sourceFileName,
    sourceFileSize: file.size,
    worksheetName,
    currencies: { SALDO01: "PYG", SALDO02: "USD" },
    headers,
    sourceRows,
    movementRows,
    footerRows,
    from,
    to,
    periods: [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, rows]) => ({ period, rows })),
    branches: branches.size,
    accounts: accounts.size,
    costCenters: costCenters.size,
    openings,
    duplicateCandidateKeys,
    missing,
    tpsldo,
    signViolations: { type1Negative, type2Positive },
    warnings,
  };
}
