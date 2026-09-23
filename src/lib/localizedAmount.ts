export type ParsedOptionalAmount = number | null | undefined;

// Form amounts follow the local convention: dots group thousands and commas
// separate decimals. Plain database-style decimal strings remain supported.
export function parseLocalizedNonNegativeAmount(value: number | string | null | undefined): ParsedOptionalAmount {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;

  const raw = value.trim().replace(/\s+/g, "");
  if (!raw) return null;
  if (!/^\+?\d+(?:[.,]\d+)*$/.test(raw)) return undefined;

  const unsigned = raw.replace(/^\+/, "");
  const dotCount = (unsigned.match(/\./g) ?? []).length;
  const commaCount = (unsigned.match(/,/g) ?? []).length;
  let normalized = unsigned;

  if (dotCount && commaCount) {
    const decimalSeparator = unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? "." : ",";
    const decimalIndex = unsigned.lastIndexOf(decimalSeparator);
    const integerPart = unsigned.slice(0, decimalIndex);
    const decimalPart = unsigned.slice(decimalIndex + 1);
    const groupingPattern = new RegExp(`^\\d{1,3}(?:\\${groupingSeparator}\\d{3})*$`);
    if (!decimalPart || !groupingPattern.test(integerPart)) return undefined;
    normalized = `${integerPart.replaceAll(groupingSeparator, "")}.${decimalPart}`;
  } else if (dotCount) {
    if (/^\d{1,3}(?:\.\d{3})+$/.test(unsigned)) normalized = unsigned.replaceAll(".", "");
    else if (dotCount !== 1) return undefined;
  } else if (commaCount) {
    if (commaCount > 1) {
      if (!/^\d{1,3}(?:,\d{3})+$/.test(unsigned)) return undefined;
      normalized = unsigned.replaceAll(",", "");
    } else {
      normalized = unsigned.replace(",", ".");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
