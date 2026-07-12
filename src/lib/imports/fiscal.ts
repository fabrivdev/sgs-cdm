import type { CanonicalCurrency, CanonicalIvaRate } from "@/lib/imports/canonical";

const IVA_10_PATTERNS = [/10\s*%/, /\biva\s*10\b/, /\bgravad[oa]\s*10\b/];
const IVA_5_PATTERNS = [/5\s*%/, /\biva\s*5\b/, /\bgravad[oa]\s*5\b/];
const EXEMPT_PATTERNS = [/\bexent[oa]\b/, /\bexonerad[oa]\b/, /\biva\s*0\b/];

export const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export const normalizeUpper = (value: unknown) => normalizeText(value).toUpperCase();

export function parseFlexibleNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const hourMatch = raw.match(/(\d+):(\d{1,2})/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const minutes = Number(hourMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours + minutes / 60;
    }
  }

  const cleaned = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/^[^\d-]+/, "")
    .replace(/[^\d]+$/, "");
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const hasComma = lastComma >= 0;
  const hasDot = lastDot >= 0;

  if (hasComma && hasDot) {
    if (lastComma > lastDot) {
      return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return Number(cleaned.replace(/,/g, "")) || 0;
  }

  if (hasComma) {
    return Number(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }

  return Number(cleaned) || 0;
}

export function roundMoney(value: number) {
  return Number((value || 0).toFixed(2));
}

export function inferIvaRate(...values: unknown[]): CanonicalIvaRate {
  const sample = values.map(normalizeUpper).join(" ");
  if (!sample) return 0;
  if (EXEMPT_PATTERNS.some((pattern) => pattern.test(sample))) return 0;
  if (IVA_10_PATTERNS.some((pattern) => pattern.test(sample))) return 0.1;
  if (IVA_5_PATTERNS.some((pattern) => pattern.test(sample))) return 0.05;
  return 0;
}

export function applyIva(baseAmount: number, ivaRate: CanonicalIvaRate) {
  return roundMoney(baseAmount * (1 + ivaRate));
}

export function resolveCurrency(...values: unknown[]): CanonicalCurrency {
  const sample = values.map(normalizeUpper).join(" ");
  if (sample.includes("USD") || sample.includes("DOLAR")) return "USD";
  if (sample.includes("GS") || sample.includes("PYG") || sample.includes("GUARANI")) return "GS";
  return "UNKNOWN";
}

export function extractShortInvoiceNumber(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (!/[0-9]/.test(raw)) return null;
  const match = raw.match(/(\d{3}-\d{3}-\d{6,})/);
  if (match) return match[1];
  const fallback = raw.match(/\d{6,}/);
  return fallback ? fallback[0] : raw;
}

export function normalizeDateLike(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }

  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + serial);
    return epoch.toISOString().slice(0, 10);
  }

  return null;
}
