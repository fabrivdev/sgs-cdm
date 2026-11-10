/** Only pad known segments; never invent a missing establishment or point of sale. */
export function formatInvoiceNumber(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  const parts = text.match(/^(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,7})$/);
  if (parts)
    return (
      parts[1].padStart(3, "0") +
      "-" +
      parts[2].padStart(3, "0") +
      "-" +
      parts[3].padStart(7, "0")
    );
  if (/^\d{13}$/.test(text))
    return text.slice(0, 3) + "-" + text.slice(3, 6) + "-" + text.slice(6);
  return text;
}
export const completeInvoiceNumber = (value: string) =>
  /^\d{3}-\d{3}-\d{7}$/.test(value);
export function guideInvoiceNumber(value: string) {
  if (/^\d{3}-\d{4,}$/.test(value))
    return value.slice(0, 7) + "-" + value.slice(7);
  if (!/^\d+$/.test(value)) return value;
  return (
    value.slice(0, 3) +
    (value.length > 3 ? "-" + value.slice(3, 6) : "") +
    (value.length > 6 ? "-" + value.slice(6) : "")
  );
}
