import { describe, expect, it } from "vitest";
import { resolveNamedEntityFilters } from "../../../supabase/functions/_shared/assistant-entities";

describe("assistant entity resolution", () => {
  const candidates = {
    cliente: ["GANADERA EL FOGON S.A.", "CAMPOS DEL MANANA S.A. - SANTA RITA", "SANTA RITA"],
    tecnico: ["JUAN GABRIEL GAVILAN MEZA", "ALCIDES ROLANDO VALDEZ BENITEZ"],
  } as const;

  it("resolves a client even when the question omits its legal suffix", () => {
    expect(resolveNamedEntityFilters("Cuanto facturo Ganadera El Fogon", candidates)).toEqual({
      cliente: "GANADERA EL FOGON S.A.",
    });
  });

  it("resolves the base company name when stored with a branch suffix", () => {
    expect(resolveNamedEntityFilters("Mostrame las OS del cliente Campos del Manana", candidates)).toEqual({
      cliente: "CAMPOS DEL MANANA S.A. - SANTA RITA",
    });
  });

  it("uses the role word to distinguish a technician from a client", () => {
    expect(resolveNamedEntityFilters("Productividad del tecnico Juan Gabriel Gavilan Meza", candidates)).toEqual({
      tecnico: "JUAN GABRIEL GAVILAN MEZA",
    });
  });

  it("does not turn a branch name into a client filter", () => {
    expect(resolveNamedEntityFilters("Facturacion de la sucursal Santa Rita", candidates, ["Santa Rita"]))
      .toEqual({});
  });

  it("does not guess an unknown or partial person", () => {
    expect(resolveNamedEntityFilters("Cuanto produjo Juan", candidates)).toEqual({});
  });
});
