import { describe, expect, it, vi } from "vitest";
import { operationsFilters, operationsFixture } from "@/test/serviceOrdersFixture";
import { demoWorkEntry, demoWorkLog } from "@/test/workLogFixture";
import { workedDays, loadWorkLog } from "./workLog";
import { workedProductivity } from "./workedProductivity";

const fixture = operationsFixture();
describe("productivity by actual work date", () => {
  it("counts only September work, regardless of opening, closing, invoicing or accumulated OS hours", () => {
    const log = demoWorkLog([demoWorkEntry(), demoWorkEntry({ id: "AUG", fecha_inicio: "2026-08-15", fecha_fin: "2026-08-15" })]);
    Object.assign(log.order_data, { fecha_abierta_os: "2025-01-01", fecha_cierre_os: "2026-10-01", fecha_emision_factura: "2026-11-01", servicios_cantidad: 9999 });
    const result = workedProductivity([log], fixture, operationsFilters);
    expect(result.horasPersona).toBe(10);
    expect(result.tecnicos[0]).toMatchObject({ totalOS: 1, horas: 10, horasDisponibles: 120 });
    expect(result.records.map(row => row.date)).toEqual(["2026-09-10"]);
    expect(result.evolucion[0]).toMatchObject({ horasOS: 10, horasPersona: 10 });
  });
  it("counts open orders with work in range and never falls back to their total", () => {
    const log = demoWorkLog(); log.order_data.situacion_os = "Abierta";
    expect(workedProductivity([log], fixture, operationsFilters).horasPersona).toBe(10);
    log.entries = [];
    const result = workedProductivity([log], fixture, operationsFilters);
    expect(result.horasPersona).toBe(0); expect(result.issues[0].reason).toBe("Sin jornadas importadas");
  });
  it("deduplicates repeated technician blocks without multiplying OS clock hours by crew", () => {
    const log = demoWorkLog([demoWorkEntry(), demoWorkEntry({ id: "duplicate" }), demoWorkEntry({ id: "TWO", tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2", heredado: true })]);
    const result = workedProductivity([log], fixture, operationsFilters);
    expect(result.horasPersona).toBe(20); expect(result.records).toHaveLength(2);
    expect(result.evolucion[0]).toMatchObject({ horasOS: 10, horasPersona: 20 });
    expect(result.tecnicos.find(row => row.profileId === "T2")).toMatchObject({ horas: 10, horasDesdeOS: 10 });
  });
  it("clips actual overnight intervals to each day/month, including inferred midnight", () => {
    for (const end of ["2026-08-31", "2026-09-01"]) {
      const log = demoWorkLog([demoWorkEntry({ fecha_inicio: "2026-08-31", fecha_fin: end, hora_inicio: "22:00", hora_fin: "02:00" })]);
      expect(workedProductivity([log], fixture, operationsFilters).horasPersona).toBe(2);
      expect(workedDays(log.entries[0])?.map(row => [row.date, row.hours])).toEqual([["2026-08-31", 2], ["2026-09-01", 2]]);
    }
  });
  it.each([
    { fecha_inicio: null }, { hora_inicio: null }, { fecha_inicio: "2026-02-30" },
    { hora_fin: "08:00" }, { fecha_fin: "2026-09-11" }, { estado_validacion: "INVALIDA" },
  ])("flags invalid clocks without lifecycle or quantity substitution: %j", extra => {
    const result = workedProductivity([demoWorkLog([demoWorkEntry(extra)])], fixture, operationsFilters);
    expect(result.horasPersona).toBe(0); expect(result.issues).toHaveLength(1);
  });
  it("applies day, technician, status, branch, equipment and time-type filters to the same records", () => {
    const log = demoWorkLog([demoWorkEntry(), demoWorkEntry({ id: "INTERNAL", fecha_inicio: "2026-09-12", fecha_fin: "2026-09-12", tipo_tiempo: "Interno" }),
      demoWorkEntry({ id: "TWO", tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2" })]);
    const filters = { ...operationsFilters, dateFrom: "2026-09-10", dateTo: "2026-09-10", fTiposTiempo: ["Cliente"], fMarcas: ["CLAAS"], fSucursales: ["Santa Rita"] };
    expect(workedProductivity([log], fixture, filters, "activos").horasPersona).toBe(10);
    expect(workedProductivity([log], fixture, filters, "inactivos").records[0].technician).toBe("TECNICO DOS");
    expect(workedProductivity([log], fixture, { ...filters, q: "NOT FOUND" }).horasPersona).toBe(0);
    expect(workedProductivity([log], fixture, { ...filters, fResponsablesOS: ["TECNICO DOS"] }).tecnicos).toHaveLength(1);
  });
  it("retains the configured capacity and subtracts unavailable days once", () => {
    const data = operationsFixture(); data.metaHorasMensual = 132;
    data.disponibilidades = [{ id: "A", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "Ausencia", observacion: null, bloquea_agenda: true }];
    data.disponibilidades.push(data.disponibilidades[0]);
    const result = workedProductivity([demoWorkLog()], data, operationsFilters);
    expect(result.capacidad.horasDisponibles).toBeCloseTo(123.2);
    expect(result.capacidad.porcentaje).toBeCloseTo(10 / 123.2 * 100);
    expect(workedProductivity([], data, operationsFilters).capacidad.horasDisponibles).toBeCloseTo(123.2);
  });
  it("counts multiple blocks on the same day and distinct OS prefixes", () => {
    const logs = [demoWorkLog([demoWorkEntry({ hora_fin: "10:00" }), demoWorkEntry({ id: "PM", hora_inicio: "13:00", hora_fin: "16:00" })]),
      demoWorkLog([demoWorkEntry({ hora_inicio: "17:00", hora_fin: "18:00" })], "02-00000001")];
    const result = workedProductivity(logs, fixture, operationsFilters);
    expect(result.horasPersona).toBe(6); expect(result.tecnicos[0].totalOS).toBe(2);
  });
  it("flags overlapping intervals and contradictory types instead of legitimizing double-booked hours", () => {
    const logs = [demoWorkLog(), demoWorkLog([demoWorkEntry({ id: "OVERLAP", hora_inicio: "09:00", hora_fin: "10:00" })], "02-00000001")];
    expect(workedProductivity(logs, fixture, operationsFilters).issues[0].reason).toBe("Horarios superpuestos");
    expect(workedProductivity([demoWorkLog([demoWorkEntry(), demoWorkEntry({ id: "CONFLICT", tipo_tiempo: "Interno" })])], fixture, operationsFilters).issues[0].reason).toBe("Tipo de tiempo contradictorio");
  });
});
describe("work log loader", () => {
  it("cancels hanging requests and enforces its timeout", async () => {
    const client = { rpc: () => ({ range: () => ({ abortSignal: () => new Promise(() => {}) }) }) };
    const controller = new AbortController();
    const request = loadWorkLog(client, "2026-09-01", "2026-09-30", null, controller.signal);
    controller.abort(new Error("Cancelado"));
    await expect(request).rejects.toThrow("Cancelado");
    vi.useFakeTimers();
    try {
      const timeout = expect(loadWorkLog(client, "2026-09-01", "2026-09-30", null)).rejects.toThrow("demorando");
      await vi.advanceTimersByTimeAsync(25_000);
      await timeout;
    } finally { vi.useRealTimers(); }
  });
  it("rejects a late page failure and a detail returned for another OS", async () => {
    const client = { rpc: () => ({ range: (from: number) => ({ abortSignal: async () => from === 0
      ? { data: Array.from({ length: 500 }, (_, i) => demoWorkLog([], String(i))), error: null }
      : { data: null, error: new Error("Página fallida") } }) }) };
    await expect(loadWorkLog(client, "2026-09-01", "2026-09-30", null)).rejects.toThrow("Página fallida");
    await expect(loadWorkLog(client, "2026-09-01", "2026-09-30", "OTHER")).rejects.toThrow("inconsistente");
  });
  it("paginates all records and stops on source errors, never returning a partial snapshot", async () => {
    let requests = 0;
    const client = { rpc: (_name: string, args: unknown) => ({ range: (from: number) => ({ abortSignal: async () => {
      requests++; expect(args).toMatchObject({ p_desde: "2026-09-01", p_hasta: "2026-09-30", p_os: null });
      return { data: from === 0 ? Array.from({ length: 500 }, (_, i) => demoWorkLog([], String(i))) : [demoWorkLog()], error: null };
    } }) }) };
    expect(await loadWorkLog(client, "2026-09-01", "2026-09-30", null)).toHaveLength(501);
    expect(requests).toBe(2);
    const denied = { rpc: () => ({ range: () => ({ abortSignal: async () => ({ data: null, error: { code: "42501" } }) }) }) };
    await expect(loadWorkLog(denied, "2026-09-01", "2026-09-30", null)).rejects.toMatchObject({ code: "42501" });
    const incomplete = { rpc: () => ({ range: () => ({ abortSignal: async () => ({ data: [{ os: "A", order_data: null, entries: [] }], error: null }) }) }) };
    await expect(loadWorkLog(incomplete, "2026-09-01", "2026-09-30", null)).rejects.toThrow("incompleto");
  });
});
