import { describe, expect, it } from "vitest";
import { normalizeMachineModelKey } from "./machineModels";

describe("normalizeMachineModelKey", () => {
  it("unifica diferencias de espacios, guiones y mayúsculas", () => {
    expect(normalizeMachineModelKey("Lexion-760")).toBe(normalizeMachineModelKey(" lexion 760 "));
  });

  it("unifica caracteres acentuados sin mezclar números", () => {
    expect(normalizeMachineModelKey("Jagüar 960")).toBe("JAGUAR960");
  });
});
