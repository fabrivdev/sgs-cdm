import { expect, it } from "vitest";
import {
  compactCategories,
  readableWork,
  workCategories,
  workObservation,
} from "./maintenancePresentation";

it("classifies recorded names without interpreting comments or changing originals", () => {
  const works = [
    { work: "MOTOR / Filtro.Comb.", value: "X", comment: null },
    { work: "MOTOR / Filtro Aceite", value: "X", comment: null },
    { work: "MOTOR / ACEITE", value: 5, comment: "Original" },
    { work: "CUBIERTAS", value: 4, comment: null },
    { work: "SERVICIOS / VARIOS", value: "X", comment: "Revisar batería" },
  ];
  const before = structuredClone(works);
  expect(workCategories(works)).toEqual([
    "Filtros",
    "Aceites y fluidos",
    "Cubiertas",
    "Otros trabajos y repuestos",
  ]);
  expect(compactCategories(workCategories(works))).toBe(
    "Filtros · Aceites y fluidos +2",
  );
  expect(works).toEqual(before);
  expect(readableWork(works[0].work)).toBe("Filtro de combustible");
  expect(readableWork("Trabajo sin mapear")).toBe("Trabajo sin mapear");
  expect(compactCategories([])).toBe("Sin clasificar");
  expect(workCategories([])).toEqual([]);
});

it("omits spreadsheet check marks but preserves meaningful observations", () => {
  expect(
    workObservation({ work: "Filtro", value: "X", comment: null }),
  ).toBeNull();
  expect(
    workObservation({ work: "Filtro", value: "x", comment: "Reemplazado" }),
  ).toBe("Reemplazado");
  expect(
    workObservation({ work: "Cubiertas", value: 4, comment: "Delanteras" }),
  ).toBe("4 · Delanteras");
});
