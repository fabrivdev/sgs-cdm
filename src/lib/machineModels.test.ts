import { describe, expect, it } from "vitest";
import { canonicalMachineSubgroup, normalizeMachineModelKey } from "./machineModels";

describe("normalizeMachineModelKey", () => {
  it("unifica diferencias de espacios, guiones y mayúsculas", () => {
    expect(normalizeMachineModelKey("Lexion-760")).toBe(normalizeMachineModelKey(" lexion 760 "));
  });

  it("unifica caracteres acentuados sin mezclar números", () => {
    expect(normalizeMachineModelKey("Jagüar 960")).toBe("JAGUAR960");
  });
});

describe("canonicalMachineSubgroup", () => {
  it("unifica la clasificación histórica de plataformas y cabezales", () => {
    expect(canonicalMachineSubgroup("PLATAFORMAS")).toBe("PLATAFORMAS/CABEZALES");
    expect(canonicalMachineSubgroup("Plataforma")).toBe("PLATAFORMAS/CABEZALES");
    expect(canonicalMachineSubgroup("Direct Disc")).toBe("PLATAFORMAS/CABEZALES");
  });

  it("distingue los dos usos de picadora definidos por negocio", () => {
    expect(canonicalMachineSubgroup("C - Picadora")).toBe("PLATAFORMAS/CABEZALES");
    expect(canonicalMachineSubgroup("M - Picadora")).toBe("PICADORAS");
  });

  it("normaliza los demás textos históricos conocidos", () => {
    expect(canonicalMachineSubgroup("Plantadora / Sembradora")).toBe("SEMBRADORAS");
    expect(canonicalMachineSubgroup("M - Cosechadora")).toBe("COSECHADORAS");
    expect(canonicalMachineSubgroup("Pulverizadora")).toBe("PULVERIZADORAS");
  });
});
