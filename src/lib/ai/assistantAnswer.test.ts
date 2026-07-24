import { describe, expect, it } from "vitest";
import { renderDeterministicAnswer } from "../../../supabase/functions/_shared/assistant-answer";
import type { GenericQueryPlan } from "../../../supabase/functions/_shared/assistant-semantic";

function resultFor(plan: GenericQueryPlan, rows: Record<string, unknown>[], sourceRows = rows.length) {
  return {
    args: plan,
    data: {
      dataset: plan.dataset,
      definition: "Definicion de prueba",
      metrics: plan.metrics,
      dimensions: plan.dimensions,
      filters: plan.filters,
      granularity: plan.granularity,
      source_rows: sourceRows,
      result_rows: rows.length,
      rows,
    },
  };
}

describe("assistant deterministic answer renderer", () => {
  it("renders a billing ranking without inventing invoice counts", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["sucursal"],
      filters: { date_from: "2026-01-01", date_to: "2026-12-31" },
      granularity: "month",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "Compara la facturacion por sucursal",
      mode: "brief",
      results: [resultFor(plan, [
        { sucursal: "Santa Rita", total_usd: 1307996.82 },
        { sucursal: "Loma Plata", total_usd: 435232.78 },
      ])],
    });

    expect(answer).toContain("Santa Rita: Facturacion USD: USD 1.307.996,82");
    expect(answer).not.toContain("facturas");
    expect(answer).toContain("2026-01-01 al 2026-12-31");
  });

  it("keeps billed hours as hours and lists time types", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["horas"],
      dimensions: ["tipo_tiempo"],
      filters: { rubro: "Servicio", date_from: "2026-01-01", date_to: "2026-12-31" },
      granularity: "month",
      order_by: "horas",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "Cuantas horas se facturaron por tipo de tiempo",
      mode: "brief",
      results: [resultFor(plan, [
        { tipo_tiempo: "Cliente", horas: 3727.85 },
        { tipo_tiempo: "Interno", horas: 83 },
        { tipo_tiempo: "Garantia", horas: 37.32 },
      ])],
    });

    expect(answer).toContain("Cliente: Horas facturadas: 3.727,85 hs");
    expect(answer).toContain("Rubro: Servicio");
    expect(answer).not.toContain("facturas unicas");
  });

  it("renders service-order productivity from OS metrics", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["horas", "ordenes"],
      dimensions: ["tecnico"],
      filters: { activo: "Inactivo" },
      granularity: "month",
      order_by: "horas",
      order_direction: "desc",
      limit: 1,
    };
    const answer = renderDeterministicAnswer({
      question: "Que tecnico inactivo fue el mas productivo",
      mode: "brief",
      results: [resultFor(plan, [{ tecnico: "ALCIDES VALDEZ", horas: 60.5, ordenes: 36 }])],
    });

    expect(answer).toContain("ALCIDES VALDEZ");
    expect(answer).toContain("Horas OS: 60,5 hs");
    expect(answer).toContain("Ordenes: 36");
    expect(answer).toContain("Situacion del tecnico: Inactivo");
  });

  it("renders complete chronological monthly series including zero months", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["horas", "ordenes"],
      dimensions: ["periodo"],
      filters: { estado: "Cerrada", tecnico: "JUAN PATINO", date_from: "2026-01-01", date_to: "2026-07-22" },
      granularity: "month",
      order_by: "periodo",
      order_direction: "asc",
      limit: 100,
    };
    const answer = renderDeterministicAnswer({
      question: "Cuantas horas cerradas en OS tiene Juan Patino por mes este ano",
      mode: "brief",
      results: [resultFor(plan, [
        { periodo: "2026-01", horas: 575.5, ordenes: 10 },
        { periodo: "2026-02", horas: 0, ordenes: 0 },
        { periodo: "2026-03", horas: 0, ordenes: 0 },
        { periodo: "2026-04", horas: 25, ordenes: 7 },
        { periodo: "2026-05", horas: 95.5, ordenes: 8 },
        { periodo: "2026-06", horas: 34.5, ordenes: 9 },
        { periodo: "2026-07", horas: 31.66, ordenes: 5 },
      ])],
    });

    expect(answer).toContain("febrero de 2026: Horas OS: 0 hs | Ordenes: 0");
    expect(answer).toContain("marzo de 2026: Horas OS: 0 hs | Ordenes: 0");
    expect(answer.indexOf("febrero de 2026")).toBeLessThan(answer.indexOf("marzo de 2026"));
    expect(answer.indexOf("marzo de 2026")).toBeLessThan(answer.indexOf("abril de 2026"));
  });

  it("returns an explicit empty result instead of asking the model to guess", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["ordenes"],
      dimensions: ["sucursal"],
      filters: { estado: "Cerrada" },
      granularity: "month",
      order_by: "ordenes",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "OS cerradas por sucursal",
      mode: "brief",
      results: [resultFor(plan, [], 0)],
    });

    expect(answer).toContain("No se encontraron datos de ordenes de servicio");
    expect(answer).toContain("Estado: Cerrada");
  });

  it("returns the second row for a follow-up asking who follows", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["cliente"],
      filters: {},
      granularity: "month",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 2,
    };
    const answer = renderDeterministicAnswer({
      question: "Y quien le sigue?",
      mode: "brief",
      results: [resultFor(plan, [
        { cliente: "CLIENTE A", total_usd: 1000 },
        { cliente: "CLIENTE B", total_usd: 900 },
      ])],
    });

    expect(answer).toContain("CLIENTE B");
    expect(answer).not.toContain("CLIENTE A");
  });

  it("warns when the winning row dominates the rest of the comparable results", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["periodo"],
      filters: {},
      granularity: "day",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 1,
    };
    const result = resultFor(plan, [{ periodo: "2018-03-03", total_usd: 96726043482 }]);
    (result.data as { outlier?: unknown }).outlier = {
      metric: "total_usd", top: 96726043482, median: 12000, ratio: 8060503.6,
    };
    const answer = renderDeterministicAnswer({ question: "Que dia tuvo mayor facturacion", mode: "brief", results: [result] });

    expect(answer).toContain("Aviso:");
    expect(answer).toContain("veces mas alto que el resto");
  });

  it("does not warn when there is no outlier flagged", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["periodo"],
      filters: {},
      granularity: "day",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 1,
    };
    const answer = renderDeterministicAnswer({
      question: "Que dia tuvo mayor facturacion",
      mode: "brief",
      results: [resultFor(plan, [{ periodo: "2026-07-20", total_usd: 15000 }])],
    });

    expect(answer).not.toContain("Aviso:");
  });

  it("warns when technician hours include pending journeys that have not been completed", () => {
    const plan: GenericQueryPlan = {
      dataset: "tecnicos",
      metrics: ["jornadas", "horas"],
      dimensions: ["tecnico", "carga"],
      filters: { date_from: "2026-07-20", date_to: "2026-07-26" },
      granularity: "month",
      order_by: "jornadas",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ tecnico: "JUAN PEREZ", carga: "Con carga", jornadas: 1, horas: 0 }]);
    (result.data as { pending_hours_caveat?: unknown }).pending_hours_caveat = { pendingJornadas: 1 };
    const answer = renderDeterministicAnswer({ question: "Que tecnicos tienen carga esta semana", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("jornada pendiente");
    expect(answer).toContain("que no trabajaron");
  });

  it("does not warn about pending hours when there is nothing pending", () => {
    const plan: GenericQueryPlan = {
      dataset: "tecnicos",
      metrics: ["jornadas", "horas"],
      dimensions: ["tecnico", "carga"],
      filters: { date_from: "2026-07-20", date_to: "2026-07-26" },
      granularity: "month",
      order_by: "jornadas",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "Que tecnicos tienen carga esta semana",
      mode: "brief",
      results: [resultFor(plan, [{ tecnico: "JUAN PEREZ", carga: "Con carga", jornadas: 3, horas: 12 }])],
    });

    expect(answer).not.toContain("Nota:");
  });

  it("renders cycle time in days using the median as the headline figure", () => {
    const plan: GenericQueryPlan = {
      dataset: "trabajos",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 5.5 }]);
    (result.data as { cycle_time_caveat?: unknown }).cycle_time_caveat = { closedCount: 12, median: 5.5, average: 6 };
    const answer = renderDeterministicAnswer({ question: "Tiempo de ciclo de los trabajos", mode: "brief", results: [result] });

    expect(answer).toContain("Tiempo de ciclo (mediana): 5,5 dias");
    expect(answer).not.toContain("Nota:");
  });

  it("warns when there are no closed jobs to compute cycle time from", () => {
    const plan: GenericQueryPlan = {
      dataset: "trabajos",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 0 }]);
    (result.data as { cycle_time_caveat?: unknown }).cycle_time_caveat = { closedCount: 0, median: 0, average: 0 };
    const answer = renderDeterministicAnswer({ question: "Tiempo de ciclo de los trabajos", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("no hay trabajos cerrados");
  });

  it("warns when the average diverges a lot from the median cycle time", () => {
    const plan: GenericQueryPlan = {
      dataset: "trabajos",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 4 }]);
    (result.data as { cycle_time_caveat?: unknown }).cycle_time_caveat = { closedCount: 10, median: 4, average: 20 };
    const answer = renderDeterministicAnswer({ question: "Tiempo de ciclo de los trabajos", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("difiere bastante de la mediana");
  });

  it("renders closure rate as a percentage", () => {
    const plan: GenericQueryPlan = {
      dataset: "trabajos",
      metrics: ["tasa_cierre"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "tasa_cierre",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "Que tasa de cierre tienen los trabajos",
      mode: "brief",
      results: [resultFor(plan, [{ tasa_cierre: 0.6 }])],
    });

    expect(answer).toContain("Tasa de cierre: 60%");
  });

  it("renders average and median age of open jobs together", () => {
    const plan: GenericQueryPlan = {
      dataset: "trabajos",
      metrics: ["dias_abierto_promedio", "dias_abierto_mediana"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_abierto_promedio",
      order_direction: "desc",
      limit: 20,
    };
    const answer = renderDeterministicAnswer({
      question: "Que antiguedad tienen los trabajos abiertos",
      mode: "brief",
      results: [resultFor(plan, [{ dias_abierto_promedio: 12.4, dias_abierto_mediana: 9 }])],
    });

    expect(answer).toContain("Antiguedad de abiertos (promedio): 12,4 dias");
    expect(answer).toContain("Antiguedad de abiertos (mediana): 9 dias");
  });

  it("warns when no OS in the result has execution-window data", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["horas_ejecucion"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "horas_ejecucion",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ horas_ejecucion: 0 }]);
    (result.data as { execution_coverage_caveat?: unknown }).execution_coverage_caveat = { withDataCount: 0, totalCount: 8, median: 0, average: 0 };
    const answer = renderDeterministicAnswer({ question: "Cuanto dura la visita de una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("ninguna de las OS consultadas");
  });

  it("discloses partial coverage when only some OS have execution-window data", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["horas_ejecucion"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "horas_ejecucion",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ horas_ejecucion: 1.75 }]);
    (result.data as { execution_coverage_caveat?: unknown }).execution_coverage_caveat = { withDataCount: 3, totalCount: 10, median: 1.75, average: 2 };
    const answer = renderDeterministicAnswer({ question: "Cuanto dura la visita de una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Duracion de ejecucion (mediana): 1,75 hs");
    expect(answer).toContain("Nota:");
    expect(answer).toContain("3 de 10 OS consultadas");
  });

  it("does not warn about coverage when every OS in the result has execution data", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["horas_ejecucion"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "horas_ejecucion",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ horas_ejecucion: 1.75 }]);
    (result.data as { execution_coverage_caveat?: unknown }).execution_coverage_caveat = { withDataCount: 5, totalCount: 5, median: 1.75, average: 1.8 };
    const answer = renderDeterministicAnswer({ question: "Cuanto dura la visita de una OS", mode: "brief", results: [result] });

    expect(answer).not.toContain("Nota:");
  });

  it("renders OS cycle time in days using the median as the headline figure", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 16 }]);
    (result.data as { os_cycle_time_caveat?: unknown }).os_cycle_time_caveat = { withDataCount: 8, totalCount: 8, median: 16, average: 15 };
    const answer = renderDeterministicAnswer({ question: "Cual es el tiempo promedio en dias en que se cierra una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Tiempo de cierre de OS (mediana): 16 dias");
    expect(answer).not.toContain("Nota:");
  });

  it("warns when there are no closed OS in the result", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 0 }]);
    (result.data as { os_cycle_time_caveat?: unknown }).os_cycle_time_caveat = { withDataCount: 0, totalCount: 0, median: 0, average: 0 };
    const answer = renderDeterministicAnswer({ question: "Cual es el tiempo promedio en dias en que se cierra una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("no hay OS cerradas");
  });

  it("warns when closed OS exist but none have an imported closing date", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 0 }]);
    (result.data as { os_cycle_time_caveat?: unknown }).os_cycle_time_caveat = { withDataCount: 0, totalCount: 5, median: 0, average: 0 };
    const answer = renderDeterministicAnswer({ question: "Cual es el tiempo promedio en dias en que se cierra una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("ninguna de las OS cerradas consultadas tiene fecha de cierre importada");
  });

  it("discloses partial coverage when only some closed OS have an imported closing date", () => {
    const plan: GenericQueryPlan = {
      dataset: "ordenes_servicio",
      metrics: ["dias_ciclo"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "dias_ciclo",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ dias_ciclo: 16 }]);
    (result.data as { os_cycle_time_caveat?: unknown }).os_cycle_time_caveat = { withDataCount: 3, totalCount: 10, median: 16, average: 15 };
    const answer = renderDeterministicAnswer({ question: "Cual es el tiempo promedio en dias en que se cierra una OS", mode: "brief", results: [result] });

    expect(answer).toContain("Nota:");
    expect(answer).toContain("3 de 10 OS cerradas consultadas");
  });

  it("renders composite queries without asking a model to reinterpret results", () => {
    const plan: GenericQueryPlan = {
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: [],
      filters: {},
      granularity: "month",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 20,
    };
    const result = resultFor(plan, [{ total_usd: 1000 }]);
    const answer = renderDeterministicAnswer({ question: "Compara", mode: "analytic", results: [result, result] });
    expect(answer).toContain("1. Facturacion");
    expect(answer).toContain("2. Facturacion");
    expect(answer).toContain("Facturacion USD: USD 1.000");
  });
});
