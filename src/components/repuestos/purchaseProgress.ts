type PurchaseProgress = "complete" | "pending" | "unknown";

export const purchaseProgressLabels: Record<PurchaseProgress, string> = {
  complete: "Sin saldo",
  pending: "Con saldo",
  unknown: "Sin verificar",
};

export function purchaseProgress(
  quantity: number, completed: number | null | undefined, pending: number | null | undefined,
): PurchaseProgress {
  if (completed == null || pending == null || ![quantity, completed, pending].every(Number.isFinite)
    || quantity <= 0 || completed < 0 || pending < 0 || Math.abs(quantity - completed - pending) > 0.000001) {
    return "unknown";
  }
  return pending > 0 ? "pending" : "complete";
}
