import { describe, expect, it } from "vitest";
import {
  inclusiveOverlapDays,
  referencesVisibleContext,
  resolveQuestionDateRange,
  shouldApplyPageContext,
} from "../../../supabase/functions/_shared/assistant-context";

describe("assistant page context", () => {
  it("does not constrain an unrelated billing question from Planner", () => {
    expect(shouldApplyPageContext(
      "Que sucursal facturo mas en abril de 2026",
      { module: "Planificador", filters: { fecha_desde: "2026-07-20", fecha_hasta: "2026-07-26" } },
    )).toBe(false);
  });

  it("uses Planner context for an operational planning question", () => {
    expect(shouldApplyPageContext(
      "Que tecnicos tienen jornadas programadas",
      { module: "Planificador" },
    )).toBe(true);
  });

  it("uses context from any module when the user explicitly references it", () => {
    expect(referencesVisibleContext("Compara la facturacion del periodo visible")).toBe(true);
    expect(shouldApplyPageContext(
      "Compara la facturacion del periodo visible",
      { module: "Calendario" },
    )).toBe(true);
  });

  it("does not inherit Dashboard filters unless they are explicitly referenced", () => {
    expect(shouldApplyPageContext("Cuantas maquinas CLAAS hay", { module: "Dashboard" })).toBe(false);
    expect(shouldApplyPageContext("Cuantas maquinas hay con estos filtros", { module: "Dashboard" })).toBe(true);
  });
});

describe("assistant interval overlap", () => {
  it("counts inclusive days inside the consulted range", () => {
    expect(inclusiveOverlapDays("2026-07-20", "2026-07-24", "2026-07-21", "2026-07-23")).toBe(3);
  });

  it("keeps the complete interval without date filters", () => {
    expect(inclusiveOverlapDays("2026-07-20", "2026-07-24")).toBe(5);
  });

  it("returns zero when intervals do not overlap", () => {
    expect(inclusiveOverlapDays("2026-07-20", "2026-07-24", "2026-08-01", "2026-08-02")).toBe(0);
  });
});

describe("assistant relative dates", () => {
  const currentDate = "2026-07-21";

  it("resolves the current week from Monday to Sunday", () => {
    expect(resolveQuestionDateRange("esta semana", currentDate)).toEqual({
      date_from: "2026-07-20",
      date_to: "2026-07-26",
    });
  });

  it("resolves a named month and explicit year", () => {
    expect(resolveQuestionDateRange("durante abril de 2025", currentDate)).toEqual({
      date_from: "2025-04-01",
      date_to: "2025-04-30",
    });
  });

  it("lets a named month override a broader relative period", () => {
    expect(resolveQuestionDateRange("este ano, especificamente febrero", currentDate)).toEqual({
      date_from: "2026-02-01",
      date_to: "2026-02-28",
    });
  });

  it("returns no implicit dates when the question does not name a period", () => {
    expect(resolveQuestionDateRange("Que tecnico tiene mas OS", currentDate)).toEqual({});
  });
});
