import { describe, expect, it } from "vitest";
import {
  compileSemanticPlan,
  type BusinessDataset,
  type GenericQueryPlan,
} from "../../../supabase/functions/_shared/assistant-semantic";

type CoverageCase = {
  question: string;
  dataset: BusinessDataset;
  metrics?: string[];
  dimensions?: string[];
  filters?: Record<string, unknown>;
};

function compile(question: string, previousPlan?: GenericQueryPlan) {
  const result = compileSemanticPlan(question, {}, previousPlan);
  expect(result, `No se pudo compilar: ${question}`).not.toBeNull();
  return result!.plan;
}

const coverageCases: CoverageCase[] = [
  { question: "Cuanto se facturo por sucursal", dataset: "facturacion", metrics: ["total_usd"], dimensions: ["sucursal"] },
  { question: "Cuantas horas de servicio se facturaron por tipo de tiempo", dataset: "facturacion", metrics: ["horas"], dimensions: ["tipo_tiempo"], filters: { rubro: "Servicio" } },
  { question: "Top 10 clientes por facturacion", dataset: "facturacion", metrics: ["total_usd"], dimensions: ["cliente"] },
  { question: "Que repuestos se facturaron por codigo de fabricante", dataset: "facturacion", dimensions: ["codigo_producto"], filters: { rubro: "Repuestos" } },
  { question: "Cuantas OS cerradas hubo por mes", dataset: "ordenes_servicio", metrics: ["ordenes"], dimensions: ["periodo"], filters: { estado: "Cerrada" } },
  { question: "Que tecnico produjo mas horas segun las OS", dataset: "ordenes_servicio", metrics: ["horas", "ordenes"], dimensions: ["tecnico"] },
  { question: "Cuantos kilometros registraron las OS de garantia", dataset: "ordenes_servicio", metrics: ["km"], filters: { tipo_tiempo: "Garantia" } },
  { question: "Cuantos trabajos abiertos hay por sucursal", dataset: "trabajos", metrics: ["trabajos"], dimensions: ["sucursal"], filters: { estado: "Abierto" } },
  { question: "Cuantas jornadas no realizadas hubo por tecnico", dataset: "jornadas", metrics: ["jornadas"], dimensions: ["tecnico"], filters: { estado: "Cancelada" } },
  { question: "Cuantas horas de jornadas se cargaron por cliente", dataset: "jornadas", metrics: ["horas", "jornadas"], dimensions: ["cliente"] },
  { question: "Que tecnicos tienen carga y quienes estan sin carga", dataset: "tecnicos", metrics: ["jornadas", "horas"], dimensions: ["tecnico", "carga"] },
  { question: "Que tecnicos inactivos figuran en la base", dataset: "tecnicos", filters: { activo: "Inactivo" } },
  { question: "Quienes estan de vacaciones", dataset: "disponibilidades", metrics: ["tecnicos"], dimensions: ["tecnico"], filters: { tipo: "Vacaciones" } },
  { question: "Cuantos dias de capacitacion hubo por sucursal", dataset: "disponibilidades", metrics: ["dias"], dimensions: ["sucursal"], filters: { tipo: "Capacitacion" } },
  { question: "Cuantas maquinas activas hay por marca", dataset: "parque", metrics: ["maquinas"], dimensions: ["marca"] },
  { question: "Dame los chasis y modelos del cliente Ganadera El Fogon", dataset: "parque", dimensions: ["cliente", "serie", "modelo"] },
  { question: "Cuantos clientes fueron contactados por resultado", dataset: "agenda", metrics: ["clientes"], dimensions: ["resultado"] },
  { question: "Mostrame telefono y correo de los contactos principales", dataset: "contactos", dimensions: ["contacto", "telefono", "correo"], filters: { principal: "Si" } },
  { question: "Quien modifico el trabajo TR-000123", dataset: "historial_trabajos", metrics: ["eventos"], dimensions: ["usuario", "trabajo"], filters: { trabajo: "TR-000123" } },
  { question: "Cuantas filas y duplicados tuvo la ultima importacion", dataset: "importaciones", metrics: ["filas", "duplicados"], dimensions: ["fecha"] },
  { question: "Que feriados y asuetos hay por fecha", dataset: "dias_no_laborales", metrics: ["dias"], dimensions: ["fecha", "motivo"] },
];

describe("assistant business coverage contract", () => {
  it.each(coverageCases)("routes '$question' to $dataset", ({ question, dataset, metrics, dimensions, filters }) => {
    const plan = compile(question);
    expect(plan.dataset).toBe(dataset);
    if (metrics) expect(plan.metrics).toEqual(expect.arrayContaining(metrics));
    if (dimensions) expect(plan.dimensions).toEqual(expect.arrayContaining(dimensions));
    if (filters) expect(plan.filters).toMatchObject(filters);
  });

  it("keeps the source and changes only the period in a natural follow-up", () => {
    const first = compile("Cuantas horas de servicio se facturaron por tipo de tiempo");
    const followUp = compile("Y solamente este mes?", first);
    expect(followUp.dataset).toBe("facturacion");
    expect(followUp.metrics).toEqual(["horas"]);
    expect(followUp.dimensions).toContain("tipo_tiempo");
    expect(followUp.filters.rubro).toBe("Servicio");
  });
});
