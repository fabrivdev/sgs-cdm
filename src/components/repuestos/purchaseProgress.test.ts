import { expect, it } from "vitest";
import { purchaseBuckets, purchaseProgress } from "./purchaseProgress";

it("separa avance completo, saldos parciales y datos insuficientes", () => {
  expect(purchaseProgress(5, 5, 0)).toBe("complete");
  expect(purchaseProgress(5, 0, 5)).toBe("pending");
  expect(purchaseProgress(5, 3, 2)).toBe("pending");
  expect(purchaseProgress(5, null, 0)).toBe("unknown");
  expect(purchaseProgress(5, 3, 0)).toBe("unknown");
  expect(purchaseProgress(5, 6, -1)).toBe("unknown");
  const rows = [{ requested: 5, ordered: 0, pending: 5 }, { requested: 3, ordered: null, pending: null }];
  expect(purchaseBuckets(rows, () => "Sucursal", r => purchaseProgress(r.requested, r.ordered, r.pending)))
    .toEqual([{ name: "Sucursal", complete: 0, pending: 1, unknown: 1 }]);
});
