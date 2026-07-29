import { describe, expect, it } from "vitest";
import { attributeServiceOrderMetrics } from "./serviceOrderMetrics";

const orderTotals = {
  hours: 10,
  kilometers: 120,
  value: 450,
};

describe("service order participant metrics", () => {
  it("attributes the complete OS totals to every participant without individual detail", () => {
    const result = attributeServiceOrderMetrics(
      [
        { key: "principal", sources: ["TECNICO PRINCIPAL"] },
        { key: "auxiliar", sources: ["TECNICO AUXILIAR"] },
      ],
      {},
      orderTotals,
    );

    expect(result).toEqual([
      { key: "principal", ...orderTotals, source: "order" },
      { key: "auxiliar", ...orderTotals, source: "order" },
    ]);
    expect(result.reduce((sum, row) => sum + row.hours, 0)).toBe(20);
  });

  it("uses individual TOTVS hours when they exist for every participant", () => {
    const result = attributeServiceOrderMetrics(
      [
        { key: "principal", sources: ["TECNICO PRINCIPAL"] },
        { key: "auxiliar", sources: ["TECNICO AUXILIAR"] },
      ],
      {
        "TECNICO PRINCIPAL": { horas: 6, kilometros: 80, valor_servicio: 180 },
        "TECNICO AUXILIAR": { horas: 4, kilometros: 40, valor_servicio: 120 },
      },
      orderTotals,
    );

    expect(result[0]).toMatchObject({ hours: 6, kilometers: 80, value: 180, source: "individual" });
    expect(result[1]).toMatchObject({ hours: 4, kilometers: 40, value: 120, source: "individual" });
  });

  it("falls back per participant when TOTVS detail is only partial", () => {
    const result = attributeServiceOrderMetrics(
      [
        { key: "principal", sources: ["TECNICO PRINCIPAL"] },
        { key: "auxiliar", sources: ["TECNICO AUXILIAR"] },
      ],
      {
        "TECNICO PRINCIPAL": { horas: 6, kilometros: 80, valor_servicio: 180 },
      },
      orderTotals,
    );

    expect(result[0]).toMatchObject({ hours: 6, source: "individual" });
    expect(result[1]).toEqual({ key: "auxiliar", ...orderTotals, source: "order" });
  });

  it("does not treat an empty TOTVS participant record as individual detail", () => {
    const [result] = attributeServiceOrderMetrics(
      [{ key: "auxiliar", sources: ["TECNICO AUXILIAR"] }],
      { "TECNICO AUXILIAR": {} },
      orderTotals,
    );

    expect(result).toEqual({ key: "auxiliar", ...orderTotals, source: "order" });
  });

  it("inherits OS hours when TOTVS only provides another individual metric", () => {
    const [result] = attributeServiceOrderMetrics(
      [{ key: "auxiliar", sources: ["TECNICO AUXILIAR"] }],
      {
        "TECNICO AUXILIAR": { kilometros: 15, valor_servicio: 200 },
      },
      orderTotals,
    );

    expect(result).toEqual({
      key: "auxiliar",
      hours: 10,
      kilometers: 15,
      value: 200,
      source: "order",
    });
  });

  it("matches imported technician keys after normalization", () => {
    const [result] = attributeServiceOrderMetrics(
      [{ key: "patino", sources: ["ME0016 - Juan Patiño"] }],
      {
        "JUAN PATINO": { horas: 7.5, kilometros: 15, valor_servicio: 200 },
      },
      orderTotals,
    );

    expect(result).toMatchObject({ hours: 7.5, kilometers: 15, value: 200, source: "individual" });
  });
});
