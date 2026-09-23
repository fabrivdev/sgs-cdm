import { describe, expect, it } from "vitest";
import { parseLocalizedNonNegativeAmount } from "./localizedAmount";

describe("parseLocalizedNonNegativeAmount", () => {
  it.each([
    ["1.500", 1500],
    ["1.500.000", 1500000],
    ["1.500.000,50", 1500000.5],
    ["1500,50", 1500.5],
    ["1500.50", 1500.5],
    ["329725.38", 329725.38],
    ["0.5", 0.5],
    ["1,500,000", 1500000],
    [1500, 1500],
  ])("parses %s as %s", (input, expected) => {
    expect(parseLocalizedNonNegativeAmount(input)).toBe(expected);
  });

  it("keeps an empty value optional and rejects malformed or negative values", () => {
    expect(parseLocalizedNonNegativeAmount("")).toBeNull();
    expect(parseLocalizedNonNegativeAmount(null)).toBeNull();
    expect(parseLocalizedNonNegativeAmount("1.50.00")).toBeUndefined();
    expect(parseLocalizedNonNegativeAmount("-1.500")).toBeUndefined();
    expect(parseLocalizedNonNegativeAmount("1.500,00.00")).toBeUndefined();
  });
});
