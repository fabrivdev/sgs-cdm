import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseISO } from "date-fns";
import { demoOrder, operationsFilters, operationsFixture } from "@/test/serviceOrdersFixture";
import { useOperationsModel, technicianGoalForRange } from "./useOperationsModel";
afterEach(cleanup);
const today = new Date("2026-09-25T12:00:00");
describe("operational extraction", () => {
  it("uses closure for closed OS and opening for open OS, never invoice dates", () => {
    const data = operationsFixture();
    data.ordenesServicio.push(demoOrder({ os_numero: "01-00000003", fecha_abierta_os: "2026-09-01", fecha_cierre_os: "2026-10-01", fecha_emision_factura: "2026-09-20" }));
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData).toMatchObject({ totalOS: 2, cerradas: 1, abiertas: 1, horas: 10, horasPersona: 10 });
    expect(result.current.serviciosDashboardData.ordenes.map(r => r.key)).toEqual(["01-00000002", "01-00000001"]);
  });
  it("preserves complete source OS keys, including branch prefixes and leading zeros", () => {
    const data = operationsFixture(); data.ordenesServicio = [demoOrder(), demoOrder({ os_numero: "02-00000001" })];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData.totalOS).toBe(2);
    expect(new Set(result.current.serviciosDashboardData.ordenes.map(r => r.key)).size).toBe(2);
    expect(result.current.serviciosDashboardData.ordenes.map(r => r.key)).toEqual(["01-00000001", "02-00000001"]);
  });
  it("uses individual hours and retains inactive participants without duplicating OS", () => {
    const data = operationsFixture(); data.ordenesServicio = [demoOrder({ raw_data: { tecnicos_participantes: ["TECNICO UNO", "TECNICO DOS"], totales_por_tecnico: { "TECNICO UNO": { horas: 6 }, "TECNICO DOS": { horas: 4 } } } })];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    const summary = result.current.serviciosDashboardData;
    expect(summary).toMatchObject({ totalOS: 1, horas: 10, horasPersona: 10 });
    expect(summary.tecnicos.find(r => r.tecnico === "TECNICO DOS")).toMatchObject({ activo: false, horas: 4, horasDisponibles: 60 });
  });
  it("keeps full hours for each participant when individual detail is absent", () => {
    const data = operationsFixture(); data.ordenesServicio = [demoOrder({ raw_data: { tecnicos_participantes: ["TECNICO UNO", "TECNICO DOS"] } })];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData).toMatchObject({ totalOS: 1, horas: 10, horasPersona: 20 });
  });
  it("filters by chassis and preserves zero values", () => {
    const data = operationsFixture(); data.ordenesServicio[1].nro_chasis = "ZERO-DEMO";
    const { result } = renderHook(() => useOperationsModel(data, { ...operationsFilters, q: "zero-demo" }, "trabajos", today));
    expect(result.current.serviciosDashboardData.ordenes).toHaveLength(1);
    expect(result.current.serviciosDashboardData.ordenes[0]).toMatchObject({ horas: 0, valorOS: 0 });
  });
  it("retains equipment model and invoice date without changing operational filters or participant identity", () => {
    const data = operationsFixture();
    data.ordenesServicio[0] = demoOrder({ fecha_emision_factura: "2026-09-20", raw_data: { canonical_model: "TRION 740", tecnicos_participantes: ["TECNICO UNO", "TECNICO UNO", "TECNICO DOS"] } });
    const { result } = renderHook(() => useOperationsModel(data, { ...operationsFilters, q: "trion 740" }, "trabajos", today));
    expect(result.current.serviciosDashboardData.ordenes).toHaveLength(1);
    expect(result.current.serviciosDashboardData.ordenes[0]).toMatchObject({ modelo: "TRION 740", fechaFacturacion: "2026-09-20", fechaCierre: "2026-09-10", tecnicos: ["TECNICO UNO", "TECNICO DOS"] });
  });
  it("does not count a missing technician or invent a model", () => {
    const data = operationsFixture(); data.ordenesServicio = [demoOrder({ responsable: null })];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData.ordenes[0]).toMatchObject({ modelo: null, tecnicos: [], fechaFacturacion: null });
  });
  it("counts journeys without an imported OS and keeps pending distinct from cancelled", () => {
    const data = operationsFixture(); data.ordenesServicio = [];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.jornadasResultadoResumen).toMatchObject({ realizadas: 1, noRealizadas: 1, pendientes: 1, programadas: 3 });
    expect(result.current.tecnicosNoRealizados[0]).toMatchObject({ id: "T2", activo: false, noRealizadas: 1 });
  });
  it("prorates calendar goals, clips deactivation and does not double subtract overlapping absence", () => {
    const absence = { id: "A", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "Ausencia", observacion: null, bloquea_agenda: true };
    expect(technicianGoalForRange(parseISO("2026-09-01"), parseISO("2026-09-30"), 120, "T1", false, "2026-09-16", [absence, absence])).toBe(52);
  });
  it("uses the agreed 132-hour monthly base and subtracts unavailable calendar days once", () => {
    const from = parseISO("2026-09-01"), to = parseISO("2026-09-30");
    const absence = { id: "A", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "No disponible", observacion: null, bloquea_agenda: true };
    expect(technicianGoalForRange(from, to, 132, "T1", true, null, [])).toBe(132);
    // Septiembre tiene 30 días: 132 - (132 / 30 × 2) = 123,2.
    expect(technicianGoalForRange(from, to, 132, "T1", true, null, [absence, absence])).toBeCloseTo(123.2);
    expect(technicianGoalForRange(from, to, 132, "T1", true, null, [{ ...absence, bloquea_agenda: false }])).toBe(132);
    expect(technicianGoalForRange(from, parseISO("2026-09-15"), 132, "T1", true, null, [absence])).toBeCloseTo(57.2);
    expect(technicianGoalForRange(from, to, 132, "T1", true, null, [{ ...absence, fecha_inicio: "2026-08-01", fecha_fin: "2026-10-01" }])).toBeCloseTo(0);
  });
  it("applies availability deductions to technician, KPI and period targets with a 132-hour base", () => {
    const data = operationsFixture(); data.metaHorasMensual = 132;
    data.disponibilidades = [{ id: "A", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "No disponible", observacion: null, bloquea_agenda: true }];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today, "activos"));
    const summary = result.current.serviciosDashboardData;
    expect(summary.tecnicos).toHaveLength(1);
    expect(summary.tecnicos[0].horasDisponibles).toBeCloseTo(123.2);
    expect(summary.capacidad.horasDisponibles).toBeCloseTo(123.2);
    expect(summary.evolucion[0].horasDisponibles).toBeCloseTo(123.2);
    expect(summary.tecnicos[0].productividad).toBeCloseTo(10 / 123.2 * 100);
  });
  it("keeps an inactive technician's journey when explicitly filtering historical compliance", () => {
    const { result } = renderHook(() => useOperationsModel(operationsFixture(), { ...operationsFilters, fTécnicos: ["T2"] }, "trabajos", today));
    expect(result.current.jornadasResultadoResumen).toMatchObject({ programadas: 1, noRealizadas: 1 });
    expect(result.current.matrizTécnicosDías.blocks.flatMap(b => b.técnicos).map(t => t.id)).toEqual(["T2"]);
  });
  it("never invents a goal if unavailable", () => {
    const { result } = renderHook(() => useOperationsModel({ ...operationsFixture(), metaHorasMensual: 0 }, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData.capacidad.horasDisponibles).toBe(0);
    expect(result.current.serviciosDashboardData.horas).toBe(10);
  });
});
