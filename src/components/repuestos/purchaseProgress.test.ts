import { expect, it } from "vitest";
import { purchaseProgress } from "./purchaseProgress";

it("separa avance completo, saldos parciales y datos insuficientes", () => {
  expect(purchaseProgress(5, 5, 0)).toBe("complete");
  expect(purchaseProgress(5, 0, 5)).toBe("pending");
  expect(purchaseProgress(5, 3, 2)).toBe("pending");
  expect(purchaseProgress(5, null, 0)).toBe("unknown");
  expect(purchaseProgress(5, 3, 0)).toBe("unknown");
  expect(purchaseProgress(5, 6, -1)).toBe("unknown");
});
