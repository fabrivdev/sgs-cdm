import { describe, expect, it } from "vitest";
import { compliancePeriodMode } from "./compliancePeriod";

describe("automatic compliance matrix periods", () => {
  it.each([
    ["2026-09-07", "2026-09-13", "dia"],
    ["2026-09-01", "2026-09-30", "semana"],
    ["2026-07-01", "2026-09-29", "mes"],
    ["2026-01-01", "2026-12-31", "mes"],
    ["2025-01-01", "2026-09-29", "anio"],
  ] as const)("groups %s through %s by %s", (from, to, mode) => {
    expect(compliancePeriodMode(from, to)).toBe(mode);
  });

  it("does not throw while the user is entering an incomplete date", () => {
    expect(compliancePeriodMode("", "2026-09-29")).toBe("mes");
  });

  it("honors a quick period even early in the month or across two weeks", () => {
    expect(compliancePeriodMode("2026-10-01", "2026-10-02", new Date(2026, 9, 2))).toBe("semana");
    expect(compliancePeriodMode("2026-09-21", "2026-09-29", new Date(2026, 8, 29))).toBe("dia");
  });
});
