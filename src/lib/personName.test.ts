import { describe, expect, it } from "vitest";
import { shortPersonName } from "./personName";

describe("shortPersonName", () => {
  it("shows only the first and last name parts", () => {
    expect(shortPersonName("CARLOS JAVIER BENITEZ ZARZA")).toBe("CARLOS ZARZA");
  });

  it("keeps already short names and tolerates empty values", () => {
    expect(shortPersonName("RUBEN ROTELA")).toBe("RUBEN ROTELA");
    expect(shortPersonName(null)).toBe("");
  });
});
