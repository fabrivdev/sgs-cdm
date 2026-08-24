import { describe, expect, it } from "vitest";
import { attributeServiceOrderMetrics, calculateTeamCapacity } from "./serviceOrderMetrics";

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

  it("does not add a canonical technician row and its raw aliases twice", () => {
    const [result] = attributeServiceOrderMetrics(
      [
        {
          key: "JONATHAN EZEQUIEL GARCETE MARTINEZ",
          sources: [
            "ME0016 - JONATHAN EZEQUIEL GARCETE MARTINEZ",
            "JONATHAN EZEQUIEL GARCETE MARTINEZ",
          ],
        },
      ],
      {
        "ME0016 - JONATHAN EZEQUIEL GARCETE MARTINEZ": {
          horas: 7,
          kilometros: 20,
          valor_servicio: 100,
        },
        "JONATHAN EZEQUIEL GARCETE MARTINEZ": {
          horas: 4,
          kilometros: 10,
          valor_servicio: 60,
        },
      },
      orderTotals,
    );

    expect(result).toEqual({
      key: "JONATHAN EZEQUIEL GARCETE MARTINEZ",
      hours: 4,
      kilometers: 10,
      value: 60,
      source: "individual",
    });
  });

  it("uses only one raw alias when no canonical total exists", () => {
    const [result] = attributeServiceOrderMetrics(
      [
        {
          key: "tecnico",
          sources: ["TECNICO 001", "TECNICO UNO"],
        },
      ],
      {
        "TECNICO 001": { horas: 5 },
        "TECNICO UNO": { horas: 5 },
      },
      orderTotals,
    );

    expect(result).toMatchObject({ hours: 5, source: "individual" });
  });
});

describe("service team capacity", () => {
  it("compares person-hours against the target of every technician", () => {
    const result = calculateTeamCapacity(20, 132, 2);

    expect(result.technicians).toBe(2);
    expect(result.hoursAvailable).toBe(264);
    expect(result.hoursUsed).toBe(20);
    expect(result.percentage).toBeCloseTo(7.5758, 3);
  });

  it("returns a safe zero percentage when the team has no capacity base", () => {
    expect(calculateTeamCapacity(10, 132, 0)).toEqual({
      technicians: 0,
      hoursAvailable: 0,
      hoursUsed: 10,
      percentage: 0,
    });
  });
});
