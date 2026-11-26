export type PurchaseProgress = "complete" | "pending" | "unknown";

export function purchaseProgress(
  quantity: number, completed: number | null | undefined, pending: number | null | undefined,
): PurchaseProgress {
  if (completed == null || pending == null || ![quantity, completed, pending].every(Number.isFinite)
    || quantity <= 0 || completed < 0 || pending < 0 || Math.abs(quantity - completed - pending) > 0.000001) {
    return "unknown";
  }
  return pending > 0 ? "pending" : "complete";
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
