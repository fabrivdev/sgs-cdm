import { describe, expect, it } from "vitest";
import { canonicalClientId, canonicalClientName, canonicalClientOptions } from "./clientIdentity";

describe("client identity", () => {
  it("removes a branch suffix without changing the legal name", () => {
    expect(canonicalClientName("CAMPOS DEL MAÑANA S.A. - LOMA PLATA")).toBe("CAMPOS DEL MAÑANA S.A.");
  });

  it("groups branch variants and keeps one canonical option", () => {
    const options = canonicalClientOptions([
      { id: "lp", nombre: "CAMPOS DEL MAÑANA S.A. - LOMA PLATA", ruc: "80056738-2" },
      { id: "kt", nombre: "CAMPOS DEL MAÑANA S.A. - KATUETE", ruc: "80056738-2" },
      { id: "base", nombre: "CAMPOS DEL MAÑANA S.A.", ruc: "80056738-2" },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: "base", nombre: "CAMPOS DEL MAÑANA S.A." });
    expect(canonicalClientId(options, "lp")).toBe("base");
  });

  it("does not remove a locality when it is not a trailing branch qualifier", () => {
    expect(canonicalClientName("AGROPECUARIA LOMA PLATA S.A.")).toBe("AGROPECUARIA LOMA PLATA S.A.");
  });
});
