export const purchaseHead = "h-9 overflow-hidden whitespace-nowrap px-1 text-[12px] font-medium sm:px-2";
export const purchaseCell = "overflow-hidden truncate whitespace-nowrap px-1 py-2 text-[13px] leading-5 sm:px-2";
export const purchaseQuantity = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 6 });

// Formatting only: never convert or add together amounts in different currencies.
export function purchaseMoney(value: number, currency: string | null | undefined) {
  const code = (currency ?? "").trim().toUpperCase();
  const symbol = code === "USD" ? "$" : ["PYG", "GS", "GS."].includes(code) ? "₲" : code === "EUR" ? "€" : code;
  return `${symbol ? `${symbol} ` : ""}${value.toLocaleString("es-PY", { maximumFractionDigits: 2 })}`;
}
