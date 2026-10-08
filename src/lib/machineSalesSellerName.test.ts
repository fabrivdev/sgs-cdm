import { describe, expect, it } from "vitest";
import { machineSalesSellerName } from "./machineSalesSellerName";

describe("machineSalesSellerName", () => {
  it("uses the confirmed machine-sales alias for Carlos", () => {
    expect(machineSalesSellerName("CARLOS")).toBe("CARLOS BENITEZ");
    expect(machineSalesSellerName(" carlos ")).toBe("CARLOS BENITEZ");
  });

  it("does not merge other people named Carlos", () => {
    expect(machineSalesSellerName("CARLOS ACOSTA")).toBe("CARLOS ACOSTA");
    expect(machineSalesSellerName("CARLOS POCHIÑEC")).toBe("CARLOS POCHIÑEC");
  });
});
