import { expect, it } from "vitest";
import {
  fleetResponsibleName,
  structuredResponsibleName,
} from "./responsibleNames";
it("uses reviewed identities and preserves ambiguous names and compound surnames", () => {
  expect(fleetResponsibleName("CARLOS JAVIER BENITEZ ZARZA")).toBe(
    "CARLOS BENITEZ",
  );
  expect(fleetResponsibleName("ANIBAL VILLALBA ROLON")).toBe("ANIBAL VILLALBA");
  expect(fleetResponsibleName("JORGE DE MORAIS")).toBe("JORGE DE MORAIS");
  expect(fleetResponsibleName("LEONARDO DE OLIVEIRA")).toBe(
    "LEONARDO DE OLIVEIRA",
  );
  expect(fleetResponsibleName("ANDRES CAÑETE")).toBe("ANDRES CAÑETE");
  expect(fleetResponsibleName("Nombre ambiguo desconocido")).toBe(
    "Nombre ambiguo desconocido",
  );
  expect(structuredResponsibleName("Maria Elena", "De la Cruz Lopez")).toBe(
    "Maria De la Cruz",
  );
  expect(
    fleetResponsibleName("Maria Elena De la Cruz Lopez", "Maria De la Cruz"),
  ).toBe("Maria De la Cruz");
});
