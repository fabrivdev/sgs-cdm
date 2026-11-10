import { expect, it } from "vitest";
import {
  groupHistoryWorks,
  groupInvoiceWorks,
  maintenanceGroups,
  exportWorkGroups,
} from "./maintenanceGroups";
it("includes every work once and preserves its details without inferring from comments", () => {
  const works = [
    "MOTOR / Filtro Aceite",
    "CAJAS / ACEITE",
    "CUBIERTAS",
    "Correa",
    "Batería",
    "REPUESTOS / VARIOS",
    "SERVICIOS / VARIOS",
    "Trabajo nuevo",
  ].map((work) => ({ work, value: "X", comment: "Original: filtro" }));
  const before = structuredClone(works);
  const groups = groupHistoryWorks(works);
  expect(maintenanceGroups.flatMap((g) => groups[g])).toHaveLength(
    works.length,
  );
  expect(groups.Repuestos.map((w) => w.name)).toEqual([
    "Correa",
    "Batería",
    "Repuestos varios",
  ]);
  expect(groups.Otros).toHaveLength(2);
  expect(groups.Aceites[0]).toEqual({
    name: "Aceite de caja",
    observation: "Original: filtro",
  });
  expect(exportWorkGroups(groups).groupOtros).toContain("Trabajo nuevo");
  expect(works).toEqual(before);
});
it("does not infer specific parts from invoice categories or description", () => {
  const groups = groupInvoiceWorks({
    categories: ["Filtros", "Otros trabajos y repuestos"],
    description: "Texto original",
  });
  expect(groups.Filtros).toEqual([{ name: "Filtros", observation: null }]);
  expect(groups.Repuestos).toEqual([]);
  expect(groups.Otros[0].name).toBe("Otros trabajos y repuestos");
});
