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
