import { describe, expect, it } from "vitest";
import { summarizeFilteredMachines } from "./machineParkSummary";

describe("filtered machine park cards", () => {
  it("counts HORSCH rows and unique clients from the filtered population", () => {
    expect(summarizeFilteredMachines([
      { cliente_id: "C1", marca: "HORSCH" },
      { cliente_id: "C1", marca: "HORSCH" },
      { cliente_id: "C2", marca: "HORSCH" },
    ])).toEqual({ totalMaquinas: 3, totalClientes: 2, totalHorsch: 3, totalClaas: 0 });
  });

  it("returns zeroes for an empty filtered result", () => {
    expect(summarizeFilteredMachines([])).toEqual({
      totalMaquinas: 0,
      totalClientes: 0,
      totalHorsch: 0,
      totalClaas: 0,
    });
  });
});
