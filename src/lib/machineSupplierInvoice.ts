export type MachineSupplierInvoiceExtraction = {
  factura_numero: string | null;
  factura_fecha: string | null;
  moneda: "USD" | "EUR" | "PYG" | null;
  valor_facturado: number | null;
  valor_facturado_estado: "confiable" | "ambiguo" | "ausente";
  chasis: string[];
};

type InvoiceCurrency = Exclude<MachineSupplierInvoiceExtraction["moneda"], null>;

type AmountCandidate = {
  amount: number;
  currency: InvoiceCurrency | null;
  rawAmount: string;
  score: number;
};

const CURRENCY_TOKEN = String.raw`(?:USD|EUR|PYG|GS\.?|(?<![A-Z])\$|\u20AC)`;
const AMOUNT_TOKEN = String.raw`(?:[0-9]{1,3}(?:[.,\s][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]+(?:[.,][0-9]{2})?)`;
const TOTAL_LABELS = [
  { pattern: String.raw`(?:GRAND\s+TOTAL|TOTAL\s+GENERAL|INVOICE\s+TOTAL|TOTAL\s+(?:DE\s+)?FACTURA)`, score: 3 },
  { pattern: String.raw`(?:(?:PRECIO|VALOR|IMPORTE|MONTO)\s+TOTAL)`, score: 2 },
  { pattern: String.raw`TOTAL`, score: 1 },
] as const;

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

function currencyFromToken(token: string | undefined, fallback: InvoiceCurrency | null) {
  const normalized = token?.replace(".", "");
  if (normalized === "USD" || normalized === "EUR" || normalized === "PYG") return normalized;
  if (normalized === "GS") return "PYG";
  return fallback;
}

function isPlausibleMoney(rawAmount: string, currency: InvoiceCurrency | null) {
  const compact = rawAmount.replace(/\s/g, "");
  const digits = compact.replace(/\D/g, "");
  const hasSeparator = /[.,]/.test(compact);
  // Long unformatted USD/EUR integers are commonly SKUs or part numbers.
  if (!hasSeparator && digits.length >= 7 && currency !== "PYG") return false;
  return digits.length > 0;
}

function distinctCandidates(candidates: AmountCandidate[]) {
  return candidates.filter((candidate, index, all) => all.findIndex(item => (
    item.amount === candidate.amount && item.currency === candidate.currency
  )) === index);
}

function contextualAmountCandidates(source: string, fallbackCurrency: InvoiceCurrency | null) {
  const candidates: AmountCandidate[] = [];
  for (const label of TOTAL_LABELS) {
    const pattern = new RegExp(
      String.raw`\b(?:${label.pattern})\b\s*[:#=\-]?\s*(${CURRENCY_TOKEN})?\s*(${AMOUNT_TOKEN})(?:\s*(${CURRENCY_TOKEN}))?`,
      "g",
    );
    for (const match of source.matchAll(pattern)) {
      const rawAmount = match[2];
      const currency = currencyFromToken(match[1] || match[3], fallbackCurrency);
      const amount = localizedAmount(rawAmount);
      if (amount !== null && isPlausibleMoney(rawAmount, currency)) {
        candidates.push({ amount, currency, rawAmount, score: label.score });
      }
    }
  }
  return candidates;
}

function adjacentCurrencyCandidates(source: string, fallbackCurrency: InvoiceCurrency | null) {
  const candidates: AmountCandidate[] = [];
  const patterns = [
    new RegExp(String.raw`(${CURRENCY_TOKEN})\s*(${AMOUNT_TOKEN})`, "g"),
    new RegExp(String.raw`(${AMOUNT_TOKEN})\s*(${CURRENCY_TOKEN})`, "g"),
  ];
  for (const [patternIndex, pattern] of patterns.entries()) {
    for (const match of source.matchAll(pattern)) {
      const currencyToken = patternIndex === 0 ? match[1] : match[2];
      const rawAmount = patternIndex === 0 ? match[2] : match[1];
      const currency = currencyFromToken(currencyToken, fallbackCurrency);
      const amount = localizedAmount(rawAmount);
      if (amount !== null && isPlausibleMoney(rawAmount, currency)) {
        candidates.push({ amount, currency, rawAmount, score: 0 });
      }
    }
  }
  return candidates;
}

function selectInvoiceAmount(source: string, fallbackCurrency: InvoiceCurrency | null) {
  const contextual = contextualAmountCandidates(source, fallbackCurrency);
  const highestScore = contextual.reduce((score, candidate) => Math.max(score, candidate.score), 0);
  const candidates = highestScore > 0
    ? distinctCandidates(contextual.filter(candidate => candidate.score === highestScore))
    : distinctCandidates(adjacentCurrencyCandidates(source, fallbackCurrency));
  if (!candidates.length) return { value: null, currency: fallbackCurrency, state: "ausente" as const };
  if (candidates.length > 1) return { value: null, currency: fallbackCurrency, state: "ambiguo" as const };
  return { value: candidates[0].amount, currency: candidates[0].currency ?? fallbackCurrency, state: "confiable" as const };
}

export function extractMachineSupplierInvoice(text: string, fileName = ""): MachineSupplierInvoiceExtraction {
  const source = normalizedText(text);
  const name = normalizedText(fileName);
  const number = source.match(/(?:NUMERO|NRO\.?|INVOICE(?: NUMBER| NO\.?)?|FACTURA(?: NUMERO| NRO\.?)?)\s*[:#º°.-]*\s*([0-9]{3,})(?=[.\s/-]|$)/)?.[1]
    ?? name.match(/(?:INVOICE|FACTURA)\s*[-_:]?\s*([0-9]{3,})/)?.[1]
    ?? null;
  const dateValue = source.match(/(?:FECHA DEL DOCUMENTO|FECHA DE FACTURA|INVOICE DATE|DOCUMENT DATE)\s*:?\s*(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})/)?.[1];
  const declaredCurrency = source.match(/(?:MONEDA|CURRENCY)\s*:?\s*(USD|EUR|PYG)\b/)?.[1] as InvoiceCurrency | undefined;
  const currencies = ([...source.matchAll(/\b(?:USD|EUR|PYG)\b|\bGS\.?\b/g)]
    .map(match => currencyFromToken(match[0], null))
    .filter((item): item is InvoiceCurrency => item !== null));
  const uniqueCurrencies = currencies.filter((item, index, all) => all.indexOf(item) === index);
  const documentCurrency = declaredCurrency ?? (uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : null);
  const amount = selectInvoiceAmount(source, documentCurrency);
  const chassis = [...source.matchAll(/CHASS?I(?:S|\/SERIE)?\s*[:#-]?\s*([A-Z0-9-]{5,})/g)]
    .map(match => match[1]).filter((item, index, all) => all.indexOf(item) === index);
  return {
    factura_numero: number,
    factura_fecha: isoDate(dateValue),
    moneda: amount.currency,
    valor_facturado: amount.value,
    valor_facturado_estado: amount.state,
    chasis: chassis,
  };
}

export function machineSupplierInvoicePatch(extraction: MachineSupplierInvoiceExtraction) {
  return Object.fromEntries([
    extraction.factura_numero && ["invoice_supplier", extraction.factura_numero],
    extraction.factura_fecha && ["factura_proveedor_fecha", extraction.factura_fecha],
    extraction.moneda && ["factura_proveedor_moneda", extraction.moneda],
    extraction.valor_facturado_estado === "confiable" && extraction.valor_facturado != null
      && ["valor_factura_proveedor", String(extraction.valor_facturado)],
  ].filter((entry): entry is [string, string] => Boolean(entry)));
}

export function machineSupplierInvoiceExtractionStatus(extraction: Partial<MachineSupplierInvoiceExtraction> | null) {
  return extraction?.valor_facturado_estado === "confiable" ? "EXTRAIDO" : "PENDIENTE";
}
