export type MachineSupplierInvoiceExtraction = {
  factura_numero: string | null;
  factura_fecha: string | null;
  moneda: "USD" | "EUR" | "PYG" | null;
  valor_facturado: number | null;
  chasis: string[];
};

const normalizedText = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toUpperCase();

function isoDate(value: string | undefined) {
  if (!value) return null;
  const parts = value.split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return null;
  const [first, second, third] = parts;
  const [year, month, day] = first > 999 ? [first, second, third] : [third, second, first];
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localizedAmount(value: string) {
  const compact = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  let normalized = compact;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = compact.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = compact.length - comma - 1 === 2 ? compact.replace(/\./g, "").replace(",", ".") : compact.replace(/,/g, "");
  } else if (dot >= 0) {
    normalized = compact.length - dot - 1 === 2 ? compact.replace(/,/g, "") : compact.replace(/\./g, "");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export function extractMachineSupplierInvoice(text: string, fileName = ""): MachineSupplierInvoiceExtraction {
  const source = normalizedText(text);
  const name = normalizedText(fileName);
  const number = source.match(/(?:NUMERO|NRO\.?|INVOICE(?: NUMBER| NO\.?)?|FACTURA(?: NUMERO| NRO\.?)?)\s*[:#º°.-]*\s*([0-9]{3,})(?=[.\s/-]|$)/)?.[1]
    ?? name.match(/(?:INVOICE|FACTURA)\s*[-_:]?\s*([0-9]{3,})/)?.[1]
    ?? null;
  const dateValue = source.match(/(?:FECHA DEL DOCUMENTO|FECHA DE FACTURA|INVOICE DATE|DOCUMENT DATE)\s*:?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/)?.[1];
  const currency = source.match(/(?:MONEDA|CURRENCY)\s*:?\s*(USD|EUR|PYG)\b/)?.[1] as MachineSupplierInvoiceExtraction["moneda"]
    ?? (/\bUSD\b/.test(source) ? "USD" : /\bEUR\b/.test(source) ? "EUR" : /\bPYG\b|\bGS\.?\b/.test(source) ? "PYG" : null);
  const amountTokens = [
    ...source.matchAll(/(?:USD|EUR|PYG|\$|€|GS\.?)\s*([0-9][0-9.,]*)/g),
    ...source.matchAll(/([0-9][0-9.,]*)\s*(?:USD|EUR|PYG|\$|€|GS\.?)/g),
  ].map(match => localizedAmount(match[1])).filter((amount): amount is number => amount !== null);
  const value = amountTokens.length ? Math.max(...amountTokens) : null;
  const chassis = [...source.matchAll(/CHASS?I(?:S|\/SERIE)?\s*[:#-]?\s*([A-Z0-9-]{5,})/g)]
    .map(match => match[1]).filter((item, index, all) => all.indexOf(item) === index);
  return { factura_numero: number, factura_fecha: isoDate(dateValue), moneda: currency, valor_facturado: value, chasis: chassis };
}

export function machineSupplierInvoicePatch(extraction: MachineSupplierInvoiceExtraction) {
  return Object.fromEntries([
    extraction.factura_numero && ["invoice_supplier", extraction.factura_numero],
    extraction.factura_fecha && ["factura_proveedor_fecha", extraction.factura_fecha],
    extraction.moneda && ["factura_proveedor_moneda", extraction.moneda],
    extraction.valor_facturado != null && ["valor_factura_proveedor", String(extraction.valor_facturado)],
  ].filter((entry): entry is [string, string] => Boolean(entry)));
}
