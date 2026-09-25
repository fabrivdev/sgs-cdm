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
    data.ordenesServicio.push(demoOrder({ id: "outside", fecha_abierta_os: "2026-09-01", fecha_cierre_os: "2026-10-01", fecha_emision_factura: "2026-09-20" }));
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData).toMatchObject({ totalOS: 2, cerradas: 1, abiertas: 1, horas: 10, horasPersona: 10 });
    expect(result.current.serviciosDashboardData.ordenes.map(r => r.key)).toEqual(["O2", "O1"]);
  });
  it("does not merge source identities with the same OS number", () => {
    const data = operationsFixture(); data.ordenesServicio = [demoOrder(), demoOrder({ id: "OTHER-BRANCH" })];
    const { result } = renderHook(() => useOperationsModel(data, operationsFilters, "trabajos", today));
    expect(result.current.serviciosDashboardData.totalOS).toBe(2);
    expect(new Set(result.current.serviciosDashboardData.ordenes.map(r => r.key)).size).toBe(2);
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
