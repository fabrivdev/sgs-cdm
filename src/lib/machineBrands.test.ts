import { describe, expect, it } from "vitest";
import { normalizeMachineBrand } from "./machineBrands";

describe("normalizeMachineBrand", () => {
  it("treats NB MAQUINAS as the NB brand", () => {
    expect(normalizeMachineBrand("NB MAQUINAS")).toBe("NB");
    expect(normalizeMachineBrand(" nb   maquinas ")).toBe("NB");
    expect(normalizeMachineBrand("NB")).toBe("NB");
  });
});
