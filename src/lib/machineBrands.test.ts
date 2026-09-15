import { describe, expect, it } from "vitest";
import { machineBrandClass, machineBrandStyle, normalizeMachineBrand } from "./machineBrands";

describe("normalizeMachineBrand", () => {
  it("treats NB MAQUINAS as the NB brand", () => {
    expect(normalizeMachineBrand("NB MAQUINAS")).toBe("NB");
    expect(normalizeMachineBrand(" nb   maquinas ")).toBe("NB");
    expect(normalizeMachineBrand("NB")).toBe("NB");
  });
});

describe("Operaciones brand palette", () => {
  it("uses the same base classes for normalized brands", () => {
    expect(machineBrandClass(" claas ")).toBe("border-marca-claas/30 bg-marca-claas-bg text-marca-claas");
    expect(machineBrandClass("horsch")).toBe("border-marca-horsch/30 bg-marca-horsch-bg text-marca-horsch");
    expect(machineBrandClass("OTROS")).toBe("border-border bg-muted text-muted-foreground");
  });

  it("preserves the existing Operaciones color for each custom brand", () => {
    expect(machineBrandStyle("NB MAQUINAS")).toEqual({
      backgroundColor: "hsl(324 68% 94%)", borderColor: "hsl(324 52% 72%)", color: "hsl(324 62% 28%)",
    });
    expect(machineBrandStyle(" nb ")).toEqual(machineBrandStyle("NB MAQUINAS"));
    expect(machineBrandStyle("John Deere")).toEqual(machineBrandStyle("JOHN DEERE"));
    expect(machineBrandStyle("JOHN DEERE")).not.toEqual(machineBrandStyle("NB"));
    expect(machineBrandStyle("CLAAS")).toBeUndefined();
    expect(machineBrandStyle("HORSCH")).toBeUndefined();
    expect(machineBrandStyle(null)).toBeUndefined();
  });
});
