import { describe, expect, it } from "vitest";
import { cuadrillaIds, resolverCuadrillaJornada } from "./jornada-cuadrilla";

const servicio = { tecnico_responsable_id: "s1", auxiliares: ["s2", "s3"] };

describe("resolverCuadrillaJornada", () => {
  it("usa la cuadrilla de la jornada editada", () => {
    const r = resolverCuadrillaJornada({ tecnico_responsable_id: "j1", auxiliares: ["j2"] }, servicio);
    expect(r).toEqual({ principalId: "j1", auxiliares: ["j2"] });
  });

  it("respeta una jornada editada sin auxiliares", () => {
    const r = resolverCuadrillaJornada({ tecnico_responsable_id: "j1", auxiliares: [] }, servicio);
    expect(r).toEqual({ principalId: "j1", auxiliares: [] });
    expect(cuadrillaIds(r)).toEqual(["j1"]);
  });

  it("hereda del servicio cuando la jornada legado no tiene responsable", () => {
    const r = resolverCuadrillaJornada({ tecnico_responsable_id: null, auxiliares: null }, servicio);
    expect(r).toEqual({ principalId: "s1", auxiliares: ["s2", "s3"] });
  });
});
