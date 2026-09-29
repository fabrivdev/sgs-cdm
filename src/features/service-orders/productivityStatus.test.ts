import { describe, expect, it } from "vitest";
import { matchesTechnicianStatus } from "./productivityStatus";

describe("productivity technician status", () => {
  it.each([
    [{ profileId: "ACTIVE", activo: true }, true],
    [{ profileId: "INACTIVE", activo: false }, false],
    [{ profileId: null, activo: false }, false],
    [{ profileId: null, activo: true }, false],
  ])("partitions everyone into active or inactive without changing identity: %j", (row, active) => {
    const before = { ...row };
    expect(matchesTechnicianStatus(row, "todos")).toBe(true);
    expect(matchesTechnicianStatus(row, "activos")).toBe(active);
    expect(matchesTechnicianStatus(row, "inactivos")).toBe(!active);
    expect(row).toEqual(before);
  });
});
