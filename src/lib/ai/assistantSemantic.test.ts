import { describe, expect, it } from "vitest";
import {
  asksUnaddressedComplement,
  compileSemanticPlan,
  detectSemanticAmbiguity,
  enforceSemanticIntent,
  enumeratePeriodBuckets,
  getDataCatalog,
  isSemanticFollowUpQuestion,
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

  it("uses the requested month as the productivity axis instead of forcing technician", () => {
    const plan = planFor("Quiero saber cual fue mi mes mas productivo");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["horas", "ordenes"],
      dimensions: ["periodo"],
      granularity: "month",
      order_by: "horas",
      order_direction: "desc",
      limit: 1,
    });
    expect(plan.dimensions).not.toContain("tecnico");
    expect(shouldSortTemporalSeriesChronologically(
      "Quiero saber cual fue mi mes mas productivo",
      plan.dimensions,
    )).toBe(false);
  });

  it("keeps productivity metric independent from an explicitly requested branch axis", () => {
    const plan = planFor("Cual fue la sucursal mas productiva");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.metrics).toEqual(["horas", "ordenes"]);
    expect(plan.dimensions).toEqual(["sucursal"]);
    expect(plan.dimensions).not.toContain("tecnico");
  });

  it("supports a productivity matrix when both technician and month are explicit", () => {
    const plan = planFor("Productividad por tecnico por mes");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.dimensions).toEqual(["periodo", "tecnico"]);
    expect(plan.granularity).toBe("month");
  });

  it("does not inherit a previous technician axis for a complete productivity question", () => {
    const previous = planFor("Productividad por tecnico");
    const plan = planFor("Quiero saber cual fue mi mes mas productivo", {}, previous);

    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      dimensions: ["periodo"],
      granularity: "month",
      limit: 1,
    });
    expect(plan.dimensions).not.toContain("tecnico");
  });

  it("keeps an explicit productivity axis when repairing a model plan", () => {
    const modelPlan = planFor("Productividad por tecnico");
    const [plan] = enforceSemanticIntent("Quiero saber cual fue mi mes mas productivo", [modelPlan]);

    expect(plan.dimensions).toEqual(["periodo"]);
    expect(plan.granularity).toBe("month");
    expect(plan.limit).toBe(1);
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

  it("ranks service billing by month for natural comparative wording", () => {
    const plan = planFor("Cual fue el mes con mayor facturacion en servicios de este ano", {
      date_from: "2026-01-01",
      date_to: "2026-12-31",
    });
    expect(plan).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["periodo"],
      filters: {
        date_from: "2026-01-01",
        date_to: "2026-12-31",
        rubro: "Servicio",
      },
      granularity: "month",
      order_by: "total_usd",
      order_direction: "desc",
      limit: 1,
    });
    expect(shouldSortTemporalSeriesChronologically(
      "Cual fue el mes con mayor facturacion en servicios de este ano",
      plan.dimensions,
    )).toBe(false);
  });

  it("keeps period, category and metric in a short corrective follow-up", () => {
    const previous = planFor("Cual fue el mes con mayor facturacion en servicios de este ano", {
      date_from: "2026-01-01",
      date_to: "2026-12-31",
    });
    const followUp = planFor("Pero cual fue el mejor mes", {}, previous);

    expect(isSemanticFollowUpQuestion("Pero cual fue el mejor mes")).toBe(true);
    expect(followUp).toMatchObject({
      dataset: "facturacion",
      metrics: ["total_usd"],
      dimensions: ["periodo"],
      filters: {
        date_from: "2026-01-01",
        date_to: "2026-12-31",
        rubro: "Servicio",
      },
      granularity: "month",
      order_by: "total_usd",
      order_direction: "desc",
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

  it("does not treat a complete question with a current period as a follow-up", () => {
    const previous = planFor("Cuantas horas cerradas en OS tiene Juan Patino por mes este ano");
    const plan = planFor("Cuanto se facturo este mes", {
      date_from: "2026-07-01",
      date_to: "2026-07-31",
    }, previous);

    expect(isSemanticFollowUpQuestion("Cuanto se facturo este mes")).toBe(false);
    expect(isSemanticFollowUpQuestion("Y en el mes en curso?")).toBe(true);
    expect(plan.dataset).toBe("facturacion");
    expect(plan.metrics).toEqual(["total_usd"]);
    expect(plan.dimensions).not.toContain("tecnico");
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

  it("computes cycle time as median days between creation and closing for app jobs", () => {
    const plan = planFor("Cual es el tiempo promedio en dias en que se cierra un trabajo");
    expect(plan).toMatchObject({
      dataset: "trabajos",
      metrics: ["dias_ciclo"],
    });
    // Regresion: la palabra "trabajo" en la pregunta tambien matchea la
    // dimension "trabajo" (desglose por codigo individual). Combinada con el
    // patron "cual es" (limite 1), armaba sin querer un ranking del trabajo
    // con mayor tiempo de ciclo en vez de la mediana agregada.
    expect(plan.dimensions).toEqual([]);
  });

  it("computes closure rate for app jobs", () => {
    const plan = planFor("Que tasa de cierre tienen los trabajos");
    expect(plan).toMatchObject({
      dataset: "trabajos",
      metrics: ["tasa_cierre"],
    });
  });

  it("computes closure rate for service orders", () => {
    const plan = planFor("Que tasa de cierre tienen las OS este mes");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["tasa_cierre"],
    });
  });

  it("returns both average and median age for open app jobs", () => {
    const plan = planFor("Que antiguedad tienen los trabajos abiertos");
    expect(plan.dataset).toBe("trabajos");
    expect(plan.metrics).toEqual(expect.arrayContaining(["dias_abierto_promedio", "dias_abierto_mediana"]));
  });

  it("computes technician visit execution duration for service orders, not OS closing time", () => {
    const plan = planFor("Cuanto dura la visita de una OS");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["horas_ejecucion"],
    });
    expect(plan.dimensions).toEqual([]);
  });
});

describe("assistant OS vs app-job cycle time routing", () => {
  it("computes OS cycle time (open to close) when the question names OS, not app jobs", () => {
    const plan = planFor("Cual es el tiempo promedio en dias en que se cierra una OS");
    expect(plan).toMatchObject({
      dataset: "ordenes_servicio",
      metrics: ["dias_ciclo"],
    });
    // Misma regresion que con "trabajo": "OS" tambien matchea la dimension "os".
    expect(plan.dimensions).toEqual([]);
  });

  it("keeps app-job cycle time separate from OS cycle time when trabajo is named", () => {
    const plan = planFor("Cual es el tiempo promedio en dias en que se cierra un trabajo");
    expect(plan.dataset).toBe("trabajos");
    expect(plan.metrics).toEqual(["dias_ciclo"]);
  });

  it("does not confuse OS cycle time with technician visit execution duration", () => {
    const cycleTime = planFor("Cual es el tiempo promedio en dias en que se cierra una OS");
    const execution = planFor("Cuanto dura la visita de una OS");
    expect(cycleTime.metrics).toEqual(["dias_ciclo"]);
    expect(execution.metrics).toEqual(["horas_ejecucion"]);
  });

  it("does not misroute a plain closed-orders count question as a cycle-time question", () => {
    const plan = planFor("Cuantas OS cerradas hubo por mes");
    expect(plan.metrics).toEqual(["ordenes"]);
  });
});

describe("assistant metric-specificity confidence (Etapa 2 finding)", () => {
  // Antes de este fix, una parafrasis razonable de tiempo/tasa de cierre que
  // no matcheaba los intents canonicos caia en el conteo por defecto de
  // trabajos/ordenes_servicio con confianza >= 0.84 -- el umbral de
  // produccion que evita consultar a Groq -- devolviendo un conteo en vez de
  // la duracion/tasa pedida, con confianza alta y sin que Groq llegara a
  // intervenir nunca.
  const ambiguousParaphrases = [
    "Cuanto tiempo lleva completar un trabajo en promedio",
    "Que tan rapido cerramos los trabajos",
    "Que fraccion de los trabajos ya completamos",
    "En promedio cuanto tarda una OS desde que se abre hasta que se cierra",
    "Que tan rapido se resuelven las OS",
  ];

  it.each(ambiguousParaphrases)("keeps confidence below the auto-resolve threshold for '%s'", (question) => {
    const compiled = compileSemanticPlan(question);
    expect(compiled).not.toBeNull();
    expect(compiled!.confidence).toBeLessThan(0.84);
  });

  const plainCountQuestions = [
    "Cuantos trabajos hay",
    "Cuantos trabajos abiertos hay por sucursal",
    "Cuantas OS hay por marca",
  ];

  it.each(plainCountQuestions)("keeps a plain count question resolving locally with high confidence for '%s'", (question) => {
    const compiled = compileSemanticPlan(question);
    expect(compiled).not.toBeNull();
    expect(compiled!.confidence).toBeGreaterThanOrEqual(0.84);
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

  it("does not truncate a plural technician roster question to a single winner", () => {
    const plan = planFor("Que tecnicos tienen carga esta semana y quienes no?");
    expect(plan.dataset).toBe("tecnicos");
    expect(plan.dimensions).toEqual(["tecnico", "carga"]);
    expect(plan.limit).toBeGreaterThan(1);
  });

  it("still returns a single winner for the singular form of the same question", () => {
    const plan = planFor("Que tecnico tuvo mas horas este mes?");
    expect(plan.limit).toBe(1);
  });

  it("keeps other singular-noun ranking questions returning a single winner", () => {
    expect(planFor("Que sucursal facturo mas este mes").limit).toBe(1);
    expect(planFor("Que cliente facturo mas este mes").limit).toBe(1);
  });
});

describe("assistant unaddressed complement detection", () => {
  it("does not flag technicians grouped by carga, since it already answers both sides", () => {
    expect(asksUnaddressedComplement(
      "Que tecnicos tienen carga esta semana y quienes no?",
      "tecnicos",
      ["tecnico", "carga"],
    )).toBe(false);
  });

  it("flags a complement question when the dataset cannot compute the full universe", () => {
    expect(asksUnaddressedComplement(
      "Que clientes facturaron este mes y cuales no?",
      "facturacion",
      ["cliente"],
    )).toBe(true);
  });

  it("does not flag questions without a complement clause", () => {
    expect(asksUnaddressedComplement("Que tecnicos tienen carga esta semana?", "tecnicos", ["tecnico"])).toBe(false);
  });
});

describe("assistant superlative dimension pattern (generalized from periodo)", () => {
  // El patron "X con mayor/menor Y", "X que mas Y", "mejor/peor X" ya
  // funcionaba para nouns temporales (dia/semana/mes/ano) via
  // requestedTemporalGranularity, pero las demas dimensiones agrupables solo
  // tenian una lista de frases literales ("QUE TECNICO", "TECNICO MAS",
  // "MEJOR TECNICO") que no cubre "TECNICO CON MAYOR X" ni "TECNICO QUE MAS
  // X". Estos casos usan a proposito construcciones que esa lista no
  // contenia, para probar el patron generalizado y no solo re-confirmar lo
  // que ya andaba.
  it("groups by tecnico for 'el tecnico con mayor X' on a dataset that has that dimension", () => {
    const plan = planFor("El tecnico con mayor facturacion de OS este mes");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.dimensions).toContain("tecnico");
    expect(plan.limit).toBe(1);
  });

  it("groups by cliente for 'el cliente con mayor X'", () => {
    const plan = planFor("El cliente con mayor facturacion este ano");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.dimensions).toContain("cliente");
    expect(plan.limit).toBe(1);
  });

  it("groups by sucursal for 'la sucursal con mayor X' (SUCURSAL pluralizes irregularly as +ES, not +S)", () => {
    const plan = planFor("La sucursal con mayor facturacion este mes");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.dimensions).toContain("sucursal");
    expect(plan.limit).toBe(1);
  });

  it("groups by marca for 'la marca con mas X'", () => {
    const plan = planFor("La marca con mas facturacion este ano");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.dimensions).toContain("marca");
    expect(plan.limit).toBe(1);
  });

  it("groups by modelo for 'el modelo con mas X', without confusing it with a specific model filter", () => {
    const plan = planFor("El modelo con mas maquinas en el parque");
    expect(plan.dataset).toBe("parque");
    expect(plan.dimensions).toContain("modelo");
    expect(plan.limit).toBe(1);
  });

  it("groups by rubro for 'el rubro con mayor X'", () => {
    const plan = planFor("El rubro con mayor facturacion este mes");
    expect(plan.dataset).toBe("facturacion");
    expect(plan.dimensions).toContain("rubro");
    expect(plan.limit).toBe(1);
  });

  it("does not turn a regular grouped breakdown into a single winner", () => {
    const plan = planFor("Facturacion por cliente este ano");
    expect(plan.dimensions).toContain("cliente");
    expect(plan.limit).toBeGreaterThan(1);
  });

  it("keeps plural roster questions as lists", () => {
    const plan = planFor("Que tecnicos tuvieron actividad este mes");
    expect(plan.dimensions).toContain("tecnico");
    expect(plan.limit).toBeGreaterThan(1);
  });

  it("keeps an explicit Top N limit", () => {
    const plan = planFor("Top 5 clientes con mayor facturacion este ano");
    expect(plan.dimensions).toContain("cliente");
    expect(plan.limit).toBe(5);
  });
});

describe("assistant tecnico+facturacion routes to ordenes_servicio (facturacion has no tecnico attribution)", () => {
  // facturacion no tiene dimension tecnico en el catalogo: las lineas
  // facturadas son de cliente/producto/fecha, nunca de tecnico. Antes de
  // este fix, "que tecnico produjo la mayor facturacion" ganaba el dataset
  // facturacion (el score de "FACTUR" le gana a cualquier otro), y como
  // facturacion no tiene esa dimension, el plan quedaba con dimensions: []
  // -- un total plano sin ningun nombre de tecnico.
  it("routes the exact reported question to ordenes_servicio with a real tecnico breakdown", () => {
    const plan = planFor("Que tecnico produjo la mayor facturacion en servicios");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.dimensions).toContain("tecnico");
    expect(plan.limit).toBe(1);
  });

  it("uses the servicio_usd metric specifically when the question names the Servicio rubro, not the broader total_usd", () => {
    // facturacion tiene un filtro de rubro que se perdia al enrutar a
    // ordenes_servicio (que no tiene ese filtro); en vez de perderlo, la
    // metrica de rubro especifica lo reemplaza.
    const plan = planFor("Que tecnico produjo la mayor facturacion en servicios");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.metrics).toEqual(["servicio_usd"]);
  });

  it("falls back to total_usd when no specific rubro is named", () => {
    const plan = planFor("Que tecnico produjo la mayor facturacion");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.metrics).toEqual(["total_usd"]);
  });

  it("uses repuestos_usd when the question names the Repuestos rubro", () => {
    const plan = planFor("Que tecnico genero mas valor en repuestos");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.metrics).toEqual(["repuestos_usd"]);
  });

  it("also routes when the question says facturo instead of produjo", () => {
    const plan = planFor("Que tecnico factura mas");
    expect(plan.dataset).toBe("ordenes_servicio");
    expect(plan.dimensions).toContain("tecnico");
  });

  it("does not divert a plain technician roster question that has nothing to do with billing", () => {
    // Guarda contra el riesgo de que el bonus nuevo capture preguntas de
    // dotacion ("cuantos tecnicos activos hay") que no mencionan nada
    // monetario y deben seguir yendo al dataset tecnicos.
    const plan = planFor("Cuantos tecnicos activos hay");
    expect(plan.dataset).toBe("tecnicos");
  });
});
