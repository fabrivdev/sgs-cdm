import { describe, expect, it } from "vitest";
import { operationsDate, operationsMoney, operationsPeriod } from "./format";

describe("OS display formats", () => {
  it("formats source dates without time-zone conversion", () => {
    expect(operationsDate("2026-09-01")).toBe("01/09/2026");
    expect(operationsDate("2026-09-01T00:00:00Z")).toBe("01/09/2026");
    expect(operationsDate(null)).toBe("—");
  });
  it("distinguishes day, week, month and year buckets", () => {
    expect(operationsPeriod("2026-09-01")).toBe("01/09/2026");
    expect(operationsPeriod("2026-W39")).toBe("Sem. 39 · 2026");
    expect(operationsPeriod("2026-09")).toBe("sept. 2026");
    expect(operationsPeriod("2026")).toBe("2026");
    expect(operationsPeriod("2026-99")).toBe("2026-99");
  });
  it("preserves zero, negative and decimal amounts", () => {
    expect(operationsMoney(0)).toBe("$ 0,00");
    expect(operationsMoney(-18.7)).toBe("$ -18,70");
    expect(operationsMoney(1240.25)).toBe("$ 1.240,25");
  });
});
