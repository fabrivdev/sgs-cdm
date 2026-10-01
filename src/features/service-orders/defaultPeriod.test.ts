import { describe, expect, it } from "vitest";
import { defaultServiceOrdersPeriod, paraguayIsoDate } from "./defaultPeriod";

describe("service orders default period", () => {
  it("starts at the new-system boundary and ends on today's date in Paraguay", () => {
    expect(defaultServiceOrdersPeriod(new Date("2026-10-01T12:00:00Z"))).toEqual({
      dateFrom: "2026-07-01",
      dateTo: "2026-10-01",
    });
  });

  it("uses Paraguay's calendar date around UTC midnight", () => {
    expect(paraguayIsoDate(new Date("2026-10-01T00:30:00Z"))).toBe("2026-09-30");
    expect(paraguayIsoDate(new Date("2026-10-01T04:30:00Z"))).toBe("2026-10-01");
  });
});
