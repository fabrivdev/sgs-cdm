import { describe, expect, it } from "vitest";
import {
  displayImportedTechnicianName,
  importedServiceOrderParticipants,
  matchTechnicianProfile,
  normalizeTechnicianName,
} from "./technicianMatching";

const profiles = [
  { id: "1", nombre: "GUSTAVO ARIEL ARCE OCAMPO" },
  { id: "2", nombre: "JUAN PATIÑO" },
  { id: "3", nombre: "JUAN GABRIEL GAVILAN MEZA" },
];

describe("technician matching", () => {
  it("removes system codes and accents", () => {
    expect(normalizeTechnicianName("ME0016 - Juan Patiño")).toBe("JUAN PATINO");
  });

  it("matches abbreviated new-system names to the canonical profile", () => {
    expect(matchTechnicianProfile("ME0016 - GUSTAVO ARCE", profiles)?.id).toBe("1");
    expect(matchTechnicianProfile("Juan Patino", profiles)?.id).toBe("2");
  });

  it("unifies the new-system Dennis alias with Denis Benitez", () => {
    const denis = { id: "4", nombre: "DENIS DE LA CRUZ BENITEZ ARAUJO" };
    expect(matchTechnicianProfile("ME0019 - DENNIS BENITEZ", [...profiles, denis])?.id).toBe("4");
    expect(normalizeTechnicianName("ME0019 - DENNIS BENITEZ")).toBe("DENIS DE LA CRUZ BENITEZ ARAUJO");
  });

  it("unifies Daniel Molinas and Evaristo Daniel as the same technician", () => {
    const evaristo = { id: "5", nombre: "EVARISTO DANIEL MOLINAS" };
    expect(matchTechnicianProfile("DANIEL MOLINAS", [...profiles, evaristo])?.id).toBe("5");
    expect(matchTechnicianProfile("EVARISTO DANIEL", [...profiles, evaristo])?.id).toBe("5");
    expect(normalizeTechnicianName("DANIEL MOLINAS")).toBe("EVARISTO DANIEL MOLINAS");
    expect(normalizeTechnicianName("EVARISTO DANIEL")).toBe("EVARISTO DANIEL MOLINAS");
  });

  it("does not force ambiguous or weak associations", () => {
    expect(matchTechnicianProfile("Juan", profiles)).toBeNull();
    expect(displayImportedTechnicianName("ME0042 - Técnico Nuevo")).toBe("TECNICO NUEVO");
  });

  it("reads responsible and all historical auxiliary columns without duplicates", () => {
    expect(importedServiceOrderParticipants({
      Responsable: "JONATHAN EZEQUIEL GARCETE MARTINEZ",
      "Mec. Aux. 1": "RUBEN CACERES LUGO",
      "Mec. Aux. 2": "ALCIDES ROLANDO VALDEZ BENITEZ",
      "Mec. Aux. 3": "RUBEN CACERES LUGO",
    }, "JONATHAN EZEQUIEL GARCETE MARTINEZ")).toEqual([
      "JONATHAN EZEQUIEL GARCETE MARTINEZ",
      "RUBEN CACERES LUGO",
      "ALCIDES ROLANDO VALDEZ BENITEZ",
    ]);
  });
});
