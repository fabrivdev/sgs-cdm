export interface SpreadsheetXmlSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface SpreadsheetXmlWorkbook {
  sheets: SpreadsheetXmlSheet[];
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

export function parseSpreadsheetXml(xmlText: string): SpreadsheetXmlWorkbook {
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
