export interface SpreadsheetXmlSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface SpreadsheetXmlWorkbook {
  sheets: SpreadsheetXmlSheet[];
}

export function decodeXmlBytes(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 256));
  const declared = prefix.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const encoding = declared === "iso-8859-1" || declared === "latin1" || declared === "windows-1252"
    ? "windows-1252"
    : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}

export async function readXmlFileText(file: Blob) {
  return decodeXmlBytes(await file.arrayBuffer());
}

const XML_NS = "urn:schemas-microsoft-com:office:spreadsheet";

function localNameOf(node: Node | null) {
  return (node as Element | null)?.localName ?? "";
}

function childElements(node: ParentNode | null, wantedLocalName?: string) {
  if (!node) return [];
  const elements = Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1);
  return wantedLocalName
    ? elements.filter((element) => localNameOf(element) === wantedLocalName)
    : elements;
}

function getAttr(element: Element, name: string) {
  return element.getAttribute(name) ?? element.getAttributeNS(XML_NS, name) ?? null;
}

function cellText(cell: Element) {
  const data = childElements(cell, "Data")[0];
  return data?.textContent?.trim() ?? "";
}

function worksheetTable(worksheet: Element) {
  return childElements(worksheet).find((child) => localNameOf(child) === "Table") ?? null;
}

function materializeRow(row: Element) {
  const cells = childElements(row, "Cell");
  const values: string[] = [];
  let cursor = 0;

  for (const cell of cells) {
    const indexAttr = getAttr(cell, "Index");
    if (indexAttr) {
      const requestedIndex = Math.max(Number(indexAttr) - 1, 0);
      while (cursor < requestedIndex) {
        values.push("");
        cursor += 1;
      }
    }

    values.push(cellText(cell));
    cursor += 1;
  }

  return values;
}

function makeUniqueHeaders(headers: string[]) {
  const occurrences = new Map<string, number>();

  return headers.map((rawHeader, index) => {
    const header = rawHeader || `col_${index + 1}`;
    const occurrence = (occurrences.get(header) ?? 0) + 1;
    occurrences.set(header, occurrence);
    return occurrence === 1 ? header : `${header}_${occurrence}`;
  });
}

function decodeXmlEntities(value: string) {
  const cdata = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return cdata
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

function fastCellText(cellBody: string) {
  const data = cellBody.match(/<(?:[\w.-]+:)?Data\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Data\s*>/i);
  if (!data) return "";
  return decodeXmlEntities(data[1].replace(/<[^>]*>/g, "")).trim();
}

function fastMaterializeRow(rowBody: string) {
  const values: string[] = [];
  let cursor = 0;
  const cells = rowBody.matchAll(/<(?:[\w.-]+:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?Cell\s*>)/gi);
  for (const cell of cells) {
    const indexAttr = xmlAttribute(cell[1], "Index");
    if (indexAttr) {
      const requestedIndex = Math.max(Number(indexAttr) - 1, 0);
      while (cursor < requestedIndex) {
        values.push("");
        cursor += 1;
      }
    }
    values.push(fastCellText(cell[2] ?? ""));
    cursor += 1;
  }
  return values;
}

function parseSpreadsheetXmlFast(xmlText: string): SpreadsheetXmlWorkbook | null {
  const worksheets = [...xmlText.matchAll(/<(?:[\w.-]+:)?Worksheet\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?Worksheet\s*>/gi)];
  if (!worksheets.length) return null;

  return {
    sheets: worksheets.map((worksheet) => {
      const table = worksheet[2].match(/<(?:[\w.-]+:)?Table\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Table\s*>/i);
      const rowValues = table
        ? [...table[1].matchAll(/<(?:[\w.-]+:)?Row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Row\s*>/gi)]
            .map((row) => fastMaterializeRow(row[1]))
        : [];
      const headers = makeUniqueHeaders(rowValues[0]?.map((header) => String(header || "").trim()) ?? []);
      const dataRows = rowValues.slice(1).filter((row) => row.some((item) => String(item || "").trim() !== ""));
      return {
        name: xmlAttribute(worksheet[1], "Name") || "Hoja 1",
        headers,
        rows: dataRows.map<Record<string, unknown>>((row) => {
          const record: Record<string, unknown> = {};
          const maxLength = Math.max(headers.length, row.length);
          for (let index = 0; index < maxLength; index += 1) {
            record[headers[index] || `col_${index + 1}`] = row[index] ?? "";
          }
          return record;
        }),
      };
    }),
  };
}

export function parseSpreadsheetXml(xmlText: string): SpreadsheetXmlWorkbook {
  const fastWorkbook = parseSpreadsheetXmlFast(xmlText);
  if (fastWorkbook) return fastWorkbook;

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  const parserError = documentNode.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new Error(parserError.textContent || "No se pudo leer el XML Spreadsheet");
  }

  const worksheets = Array.from(documentNode.getElementsByTagNameNS(XML_NS, "Worksheet"));
  const sheets: SpreadsheetXmlSheet[] = worksheets.map((worksheet) => {
    const table = worksheetTable(worksheet);
    const rows = table ? childElements(table, "Row").map(materializeRow) : [];
    const headers = makeUniqueHeaders(rows[0]?.map((header) => String(header || "").trim()) ?? []);
    const dataRows = rows.slice(1).filter((row) => row.some((value) => String(value || "").trim() !== ""));

    const mappedRows = dataRows.map<Record<string, unknown>>((row) => {
      const record: Record<string, unknown> = {};
      const maxLength = Math.max(headers.length, row.length);
      for (let index = 0; index < maxLength; index += 1) {
        const header = headers[index] || `col_${index + 1}`;
        record[header] = row[index] ?? "";
      }
      return record;
    });

    return {
      name: getAttr(worksheet, "Name") || "Hoja 1",
      headers,
      rows: mappedRows,
    };
  });

  return { sheets };
}
