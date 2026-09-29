import { describe, expect, it } from "vitest";
import { matrixCompletion } from "./matrixCompletion";

describe("matrix completion", () => {
  it("uses only work with an outcome as the denominator", () => {
    expect(matrixCompletion({ realizadas: 3, noRealizadas: 1, programadas: 8, noDisponibilidad: ["Vacaciones"] }))
      .toEqual({ completed: 3, notCompleted: 1, decided: 4, scheduled: 8, unavailable: 1, percent: 75 });
  });

  it("distinguishes no result from zero percent", () => {
    expect(matrixCompletion({ realizadas: 0, noRealizadas: 0, programadas: 2, noDisponibilidad: [] }).percent).toBeNull();
    expect(matrixCompletion({ realizadas: 0, noRealizadas: 2, programadas: 0, noDisponibilidad: [] }).percent).toBe(0);
    expect(matrixCompletion({ realizadas: 2, noRealizadas: 0, programadas: 0, noDisponibilidad: [] }).percent).toBe(100);
  });
});
