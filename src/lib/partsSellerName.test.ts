import { describe, expect, it } from "vitest";
import { partsSellerIdentities, partsSellerName } from "./partsSellerName";

describe("partsSellerName", () => {
  it("unifies every observed historical/current alias", () => {
    for (const [name, aliases] of partsSellerIdentities) {
      for (const alias of aliases) {
        expect(partsSellerName(alias)).toBe(name);
        expect(partsSellerName(`AR0001 - ${alias}`)).toBe(name);
      }
    }
    expect(partsSellerName("AR0003 - JAVIER NALERIO")).toBe("FRANCISCO NALERIO");
  });
  it("removes numeric and alphanumeric codes without truncating names", () => {
    expect(partsSellerName("  AS0002 – Angela Knorst  ")).toBe("ANGELA KNORST");
    expect(partsSellerName("ZZ0001: PABLO JAUREGUI")).toBe("PABLO JAUREGUI");
    expect(partsSellerName("000006 - Oscar Benítez")).toBe("OSCAR BENITEZ");
    expect(partsSellerName("000003 - Andres Canete")).toBe("LUIS CAÑETE");
    expect(partsSellerName("AR0007 - Pedro Servián")).toBe("PEDRO SERVIAN");
  });
  it("keeps unrelated people and generic sellers separate", () => {
    expect(partsSellerName("OSCAR ARTURO SPERLING SOTELO")).toBe("OSCAR ARTURO SPERLING SOTELO");
    expect(partsSellerName("WILLIAM EDUARDO LENGUAZA SCHONHAUSER")).toBe("WILLIAM EDUARDO LENGUAZA SCHONHAUSER");
    expect(partsSellerName("000001 - Vendedor CDM")).toBe("VENDEDOR CDM");
    expect(partsSellerName("GROUP CARILO S.R.L")).toBe("GROUP CARILO S.R.L");
  });
  it("treats empty values, placeholder dashes and bare codes as missing", () => {
    for (const value of [null, "", "\t-", "AR0001", "000001", "AR0001 -"]) {
      expect(partsSellerName(value)).toBe("Sin vendedor");
    }
  });
});
