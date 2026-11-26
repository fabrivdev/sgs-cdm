export type PurchaseProgress = "complete" | "pending" | "unknown";

export const purchaseProgressLabels: Record<PurchaseProgress, string> = {
  complete: "Sin saldo",
  pending: "Con saldo",
  unknown: "Sin verificar",
};

export function purchaseBalanceIssue(
  quantity: number, completed: number | null | undefined, pending: number | null | undefined,
) {
  if (completed == null || pending == null) return "Falta la cantidad en pedido o el saldo de TOTVS.";
  if (![quantity, completed, pending].every(Number.isFinite) || quantity <= 0 || completed < 0 || pending < 0) {
    return "Las cantidades del ítem son inválidas.";
  }
  if (Math.abs(quantity - completed - pending) > 0.000001) {
    return "Lo solicitado difiere de la suma de en pedido y saldo.";
  }
  return null;
}

export function purchaseProgress(
  quantity: number, completed: number | null | undefined, pending: number | null | undefined,
): PurchaseProgress {
  if (purchaseBalanceIssue(quantity, completed, pending)) return "unknown";
  return (pending ?? 0) > 0 ? "pending" : "complete";
}

export function purchaseBuckets<T>(rows: T[], group: (row: T) => string, state: (row: T) => PurchaseProgress) {
  const buckets = new Map<string, Record<PurchaseProgress, number>>();
  for (const row of rows) {
    const key = group(row);
    const counts = buckets.get(key) ?? { complete: 0, pending: 0, unknown: 0 };
    counts[state(row)]++;
    buckets.set(key, counts);
  }
  return [...buckets].map(([name, counts]) => ({ name, ...counts }));
}
