import { describe, expect, it } from "vitest";
import {
  compileSemanticPlan,
  detectSemanticAmbiguity,
  enumeratePeriodBuckets,
  getDataCatalog,
  shouldSortTemporalSeriesChronologically,
  validateGenericPlans,
  type GenericQueryPlan,
} from "../../../supabase/functions/_shared/assistant-semantic";

function planFor(question: string, explicitFilters: Record<string, unknown> = {}, previousPlan?: GenericQueryPlan) {
  const compiled = compileSemanticPlan(question, explicitFilters, previousPlan);
  expect(compiled, `No se compilo un plan para: ${question}`).not.toBeNull();
  return compiled!.plan;
}

describe("assistant semantic catalog", () => {
  it("documents source, grain, date and stable key for every dataset", () => {
    const catalog = getDataCatalog();
    expect(catalog.version).toBeGreaterThan(0);

    for (const definition of Object.values(catalog.datasets)) {
      expect(definition.source).not.toBe("");
      expect(definition.grain).not.toBe("");
      expect(definition.stableKey).not.toBe("");
      expect(definition).toHaveProperty("canonicalDate");
    }
  });
});

describe("assistant semantic compiler", () => {
  it("enumerates missing monthly buckets across the requested range", () => {
    expect(enumeratePeriodBuckets("2026-01-01", "2026-07-22", "month")).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
    ]);
  });

  it("keeps ordinary period breakdowns in chronological order", () => {
    expect(shouldSortTemporalSeriesChronologically(
      "Cuantas horas cerradas en OS tiene Juan Patino por mes este ano",
      ["periodo"],
    )).toBe(true);
    expect(shouldSortTemporalSeriesChronologically(
      "Que mes tuvo la mayor cantidad de OS cerradas",
      ["periodo"],
    )).toBe(false);
  });

  it("uses billing lines for billed hours and breaks them down by time type", () => {
    const plan = planFor("Cuantas horas se facturaron por tipo de tiempo");
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["horas"],
      dimensions: ["tipo_tiempo"],
      filters: { rubro: "Servicio" },
    });
  });

  it("defines technical productivity from service orders, not app journeys", () => {
    const plan = planFor("Que tecnico inactivo fue el mas productivo");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.metrics).toEqual(["horas", "ordenes"]);
    expect(plan.dimensions).toContain("tecnico");
    expect(plan.filters).toMatchObject({ activo: "Inactivo" });
    expect(plan.order_by).toBe("horas");
  });

  it("ranks closed service orders by month", () => {
    const plan = planFor("Que mes tuvo la mayor cantidad de OS cerradas");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["ordenes"],
      dimensions: ["periodo"],
      filters: { estado: "Cerrada" },
      granularity: "month",
      order_direction: "desc",
      limit: 1,
    });
  });

  it("ranks technicians with open service orders", () => {
    const plan = planFor("Que tecnico tiene mas OS abiertas");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["ordenes"],
      filters: { estado: "Abierta" },
      limit: 1,
    });
    expect(plan.dimensions).toContain("tecnico");
  });

  it("groups one technician's closed OS hours by month", () => {
    const plan = planFor("Cuantas horas cerradas en OS tiene Juan Patino por mes este ano");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      filters: { estado: "Cerrada" },
      granularity: "month",
    });
    expect(plan.metrics).toContain("horas");
    expect(plan.dimensions).toEqual(["periodo"]);
  });

  it("ranks billing branches for the service category", () => {
    const plan = planFor("Que sucursal facturo mas en el rubro Servicios");
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["sucursal"],
      filters: { rubro: "Servicio" },
      limit: 1,
    });
  });

  it("ranks the highest billing day instead of silently grouping by month", () => {
    const plan = planFor("Dia con mayor facturacion de todos los anos");
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["periodo"],
      granularity: "day",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 1,
    });
    expect(plan.filters).not.toHaveProperty("date_from");
    expect(plan.filters).not.toHaveProperty("date_to");
  });

  it("finds the largest invoice without counting invoice lines", () => {
    const plan = planFor("Cual fue la factura mas grande");
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["factura"],
      order_direction: "desc",
      limit: 1,
    });
  });

  it("uses cancelled app journeys for no-realizada questions", () => {
    const plan = planFor("Cuantas jornadas no realizadas hubo");
    expect(plan).toMatchObject({
      dataset: "jornadas",
      metrics: ["jornadas"],
      filters: { estado: "Cancelada" },
    });
  });

  it("keeps the previous business question in a contextual follow-up", () => {
    const previous = planFor("Cuantas horas se facturaron por tipo de tiempo", {
      date_from: "2026-01-01",
      date_to: "2026-12-31",
    });
    const followUp = planFor("Y en el mes en curso?", {
      date_from: "2026-07-01",
      date_to: "2026-07-31",
    }, previous);

    expect(followUp.dataset).toBe("facturacion");
    expect(followUp.metrics).toEqual(["horas"]);
    expect(followUp.dimensions).toEqual(["tipo_tiempo"]);
    expect(followUp.filters).toMatchObject({
      date_from: "2026-07-01",
      date_to: "2026-07-31",
      rubro: "Servicio",
    });
  });

  it("lists technician workload instead of returning one aggregate", () => {
    const plan = planFor("Que tecnicos tienen carga esta semana y quienes no");
    expect(plan.dataset).toBe("tecnicos");
    expect(plan.metrics).toEqual(["jornadas", "horas"]);
    expect(plan.dimensions).toEqual(expect.arrayContaining(["tecnico", "carga"]));
  });

  it("lists chassis prefixes with model and owner", () => {
    const plan = planFor("Dime los chasis que empiecen por I51 con su modelo y dueno");
    expect(plan.dataset).toBe("parque");
    expect(plan.metrics).toEqual(["maquinas"]);
    expect(plan.dimensions).toEqual(["cliente", "serie", "modelo"]);
    expect(plan.filters).toMatchObject({ serie: "I51" });
    expect(plan.limit).toBe(100);
  });

  it("distinguishes billed clients from park clients", () => {
    expect(planFor("Cuantos clientes facturados hubo").dataset).toBe("facturacion");
    expect(planFor("Cuantos clientes tiene el parque activo").dataset).toBe("parque");
  });

  it("ranks billed spare parts by a stable product code", () => {
    const plan = planFor("Top 10 repuestos facturados por codigo");
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["codigo_producto"],
      filters: { rubro: "Repuestos" },
      limit: 10,
    });
  });

  it("can group billing by the actual product or concept", () => {
    const plan = planFor("Que productos facturamos y por que monto");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.metrics).toEqual(["total_usd"]);
    expect(plan.dimensions).toContain("concepto");
  });

  it("filters a service-order detail by its stable OS number", () => {
    const plan = planFor("Que problema tenia la OS 02-00000019");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.dimensions).toContain("problema");
    expect(plan.filters).toMatchObject({ os: "02-00000019" });
  });

  it("preserves a formatted invoice number as a literal filter", () => {
    const plan = planFor("Mostrame el detalle de la factura 001-003-0000212");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.filters).toMatchObject({ factura: "001-003-0000212" });
  });

  it("preserves punctuation in a manufacturer product code", () => {
    const plan = planFor("Cuanto se facturo por el codigo de repuesto ABC-123/7");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.filters).toMatchObject({ codigo_producto: "ABC-123/7" });
  });

  it("uses readable client names when grouping app jobs", () => {
    const plan = planFor("Cuantos trabajos hubo por cliente");
    expect(plan.dataset).toBe("trabajos");
    expect(plan.metrics).toEqual(["trabajos"]);
    expect(plan.dimensions).toContain("cliente");
  });

  it("lists technicians on vacation from the availability source", () => {
    const plan = planFor("Que tecnicos estan de vacaciones esta semana");
    expect(plan).toMatchObject({
      dataset: "disponibilidades",
      metrics: ["tecnicos"],
      filters: { tipo: "Vacaciones" },
    });
    expect(plan.dimensions).toContain("tecnico");
  });

  it("totals training days by technician branch", () => {
    const plan = planFor("Cuantos dias de capacitacion hubo por sucursal");
    expect(plan).toMatchObject({
      dataset: "disponibilidades",
      metrics: ["dias"],
      dimensions: ["sucursal"],
      filters: { tipo: "Capacitacion" },
    });
  });

  it("reads client contact details without confusing them with commercial follow-ups", () => {
    const plan = planFor("Cual es el telefono y correo de la persona de contacto de Ganadera El Fogon");
    expect(plan.dataset).toBe("contactos");
    expect(plan.metrics).toEqual(["contactos"]);
    expect(plan.dimensions).toEqual(expect.arrayContaining(["contacto", "telefono", "correo"]));
  });

  it("counts unique clients with a principal contact", () => {
    const plan = planFor("Cuantos clientes tienen contacto principal");
    expect(plan).toMatchObject({
      dataset: "contactos",
      metrics: ["clientes"],
      filters: { principal: "Si" },
    });
  });

  it("keeps commercial contacts in the agenda dataset", () => {
    const plan = planFor("Cuantos clientes fueron contactados por la agenda comercial");
    expect(plan.dataset).toBe("agenda");
    expect(plan.metrics).toEqual(["clientes"]);
  });

  it("filters work history by an exact TR reference", () => {
    const plan = planFor("Quien modifico el trabajo TR-000123");
    expect(plan.dataset).toBe("historial_trabajos");
    expect(plan.metrics).toEqual(["eventos"]);
    expect(plan.dimensions).toContain("usuario");
    expect(plan.filters).toMatchObject({ trabajo: "TR-000123" });
  });

  it("orders the latest import by its real timestamp", () => {
    const plan = planFor("Cuantos duplicados tuvo la ultima importacion");
    expect(plan).toMatchObject({
      dataset: "importaciones",
      metrics: ["duplicados"],
      order_by: "fecha",
      order_direction: "desc",
      limit: 1,
    });
    expect(plan.dimensions).toContain("fecha");
  });

  it("lists non-working days from the global calendar", () => {
    const plan = planFor("Que feriados hay este mes");
    expect(plan).toMatchObject({
      dataset: "dias_no_laborales",
      metrics: ["dias"],
    });
    expect(plan.dimensions).toEqual(expect.arrayContaining(["fecha", "motivo"]));
  });
});

describe("assistant semantic clarifications", () => {
  it("asks for the client universe only when the source is ambiguous", () => {
    expect(detectSemanticAmbiguity("Cuantos clientes hay")?.id).toBe("clientes_sin_universo");
    expect(detectSemanticAmbiguity("Cuantos clientes fueron facturados")).toBeNull();
  });

  it("asks which hours are requested", () => {
    expect(detectSemanticAmbiguity("Cuantas horas hubo")?.id).toBe("horas_sin_fuente");
    expect(detectSemanticAmbiguity("Cuantas horas de OS hubo")).toBeNull();
  });

  it("does not interrupt a contextual follow-up", () => {
    const previous = planFor("Cuantos clientes fueron facturados");
    expect(detectSemanticAmbiguity("Y cuantos clientes hubo?", previous)).toBeNull();
  });
});

describe("assistant plan validation", () => {
  it("rejects unknown fields, caps limits and preserves valid fields", () => {
    const result = validateGenericPlans({ queries: [{
      dataset: "facturacion",
      metrics: ["total_usd", "invented_metric"],
      dimensions: ["sucursal", "invented_dimension"],
      filters: { rubro: "Servicio", secret: "no" },
      limit: 999,
    }] });

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].metrics).toEqual(["total_usd"]);
    expect(result.plans[0].dimensions).toEqual(["sucursal"]);
    expect(result.plans[0].filters).toEqual({ rubro: "Servicio" });
    expect(result.plans[0].limit).toBe(100);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unknown_metric",
      "unknown_dimension",
      "unknown_filter",
    ]));
  });

  it("gives literal filters priority over model guesses", () => {
    const result = validateGenericPlans({ queries: [{
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["sucursal"],
      filters: { date_from: "2025-01-01", sucursal: "Misiones" },
    }] }, { date_from: "2026-04-01", date_to: "2026-04-30", sucursal: "Santa Rita" });

    expect(result.plans[0].filters).toMatchObject({
      date_from: "2026-04-01",
      date_to: "2026-04-30",
      sucursal: "Santa Rita",
    });
  });

  it("enforces metric-specific filters over incompatible suggestions", () => {
    const result = validateGenericPlans({ queries: [{
      dataset: "facturacion",
      metrics: ["horas"],
      dimensions: ["tipo_tiempo"],
      filters: { rubro: "Repuestos" },
    }] });

    expect(result.plans[0].filters.rubro).toBe("Servicio");
  });
});
