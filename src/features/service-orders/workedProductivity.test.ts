import { describe, expect, it, vi } from "vitest";
import { operationsFilters, operationsFixture } from "@/test/serviceOrdersFixture";
import { demoWorkEntry, demoWorkLog } from "@/test/workLogFixture";
import { workedDays, loadWorkLog, inspectWorkInterval } from "./workLog";
import { workedProductivity } from "./workedProductivity";

const fixture = operationsFixture();
describe("legacy and dated-work eras", () => {
  it("uses the same July boundary for hours, capacity, periods and incidents without mutating inputs", () => {
    const legacy = demoWorkLog([], "LEGACY");
    Object.assign(legacy.order_data, { fecha_abierta_os: "2026-02-01", fecha_cierre_os: null, servicios_cantidad: 500 });
    const modern = demoWorkLog([demoWorkEntry(), demoWorkEntry({ id: "JUL", fecha_inicio: "2026-07-10", fecha_fin: "2026-07-10" }),
      demoWorkEntry({ id: "OLD_BAD", fecha_inicio: "2026-06-10", fecha_fin: "2026-06-10", hora_inicio: null }),
      demoWorkEntry({ id: "NEW_BAD", fecha_inicio: "2026-08-10", fecha_fin: "2026-08-10", hora_inicio: null })]);
    const filters = { ...operationsFilters, dateFrom: "2026-01-01" };
    const before = JSON.stringify({ filters, legacy, modern, fixture });
    const year = workedProductivity([legacy, modern], fixture, filters);
    const july = workedProductivity([modern], fixture, { ...filters, dateFrom: "2026-07-01" });
    expect(year).toEqual({ ...july, period: { ...july.period, requestedFrom: "2026-01-01", includesLegacy: true } });
    expect(year.period).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
    expect(year.horasPersona).toBe(20);
    expect(year.capacidad.horasDisponibles).toBe(360);
    expect(year.issues).toHaveLength(1);
    expect(year.evolucion.map(row => row.dateFrom)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(year.evolucion.reduce((total, row) => total + row.horasDisponibles, 0)).toBe(360);
    expect(JSON.stringify({ filters, legacy, modern, fixture })).toBe(before);
  });
  it("returns no measurable productivity or false incidents for a legacy-only range", () => {
    const result = workedProductivity([demoWorkLog([])], fixture, { ...operationsFilters, dateFrom: "2026-01-01", dateTo: "2026-06-30" });
    expect(result).toMatchObject({ period: { from: null, to: null, includesLegacy: true }, records: [], issues: [], tecnicos: [], evolucion: [], horasPersona: 0 });
    expect(result.capacidad.horasDisponibles).toBe(0);
  });
  it("retains post-cutover work on OS opened before July and clips overnight work to July only", () => {
    const log = demoWorkLog([demoWorkEntry({ fecha_inicio: "2026-06-30", fecha_fin: "2026-07-01", hora_inicio: "22:00", hora_fin: "02:00" })]);
    Object.assign(log.order_data, { fecha_abierta_os: "2026-04-01", fecha_cierre_os: null });
    const result = workedProductivity([log], fixture, { ...operationsFilters, dateFrom: "2026-06-30", dateTo: "2026-07-01", periodMode: "anio" });
    expect(result.horasPersona).toBe(2);
    expect(result.capacidad.horasDisponibles).toBeCloseTo(120 / 31);
    expect(result.evolucion[0]).toMatchObject({ dateFrom: "2026-07-01", dateTo: "2026-07-01", horasPersona: 2 });
  });
  it("does not shorten coverage to the last observed work or remove absence/deactivation rules", () => {
    const data = operationsFixture();
    data.metaHorasMensual = 132;
    const absence = { id: "ABS", tecnico_id: "T1", fecha_inicio: "2026-06-29", fecha_fin: "2026-07-02", tipo: "Ausencia", observacion: null, bloquea_agenda: true };
    data.disponibilidades = [absence, absence];
    const log = demoWorkLog([demoWorkEntry({ fecha_inicio: "2026-07-10", fecha_fin: "2026-07-10" }),
      demoWorkEntry({ id: "T2", fecha_inicio: "2026-09-10", fecha_fin: "2026-09-10", tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2" })]);
    const result = workedProductivity([log], data, { ...operationsFilters, dateFrom: "2026-01-01", dateTo: "2026-09-27" });
    expect(result.tecnicos.find(row => row.profileId === "T1")?.horasDisponibles).toBeCloseTo(132 * (2 + 27 / 30 - 2 / 31));
    expect(result.tecnicos.find(row => row.profileId === "T2")?.horasDisponibles).toBeCloseTo(132 * 2.5);
    expect(result.period.to).toBe("2026-09-27");
  });
  it("keeps genuine new-system missing journals as incidents, including unknown-era records", () => {
    const missing = demoWorkLog([]);
    const unknown = demoWorkLog([], "UNKNOWN");
    Object.assign(unknown.order_data, { fecha_abierta_os: null, fecha_cierre_os: null });
    const invalidDate = demoWorkLog([], "INVALID_DATE");
    Object.assign(invalidDate.order_data, { fecha_abierta_os: "2026-02-30", fecha_cierre_os: null });
    const result = workedProductivity([missing, unknown, invalidDate], fixture, { ...operationsFilters, dateFrom: "2026-01-01" });
    expect(result.issues).toHaveLength(3);
    expect(result.capacidad.horasDisponibles).toBe(360);
  });
  it("does not reset the boundary to July in future years", () => {
    const log = demoWorkLog([demoWorkEntry({ fecha_inicio: "2027-01-10", fecha_fin: "2027-01-10" })]);
    const result = workedProductivity([log], fixture, { ...operationsFilters, dateFrom: "2027-01-01", dateTo: "2027-01-31" });
    expect(result.period).toMatchObject({ from: "2027-01-01", includesLegacy: false });
    expect(result.horasPersona).toBe(10);
    expect(result.capacidad.horasDisponibles).toBe(120);
  });
});
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
  it("keeps both original conflicting blocks, including their OS identities and types", () => {
    const first = demoWorkEntry(), second = demoWorkEntry({ id: "OVERLAP", hora_inicio: "09:00", hora_fin: "10:00" });
    const logs = [demoWorkLog([first]), demoWorkLog([second], "02-00000001")];
    const before = JSON.stringify(logs);
    const result = workedProductivity(logs, fixture, operationsFilters);
    expect(result.issues[0].sources).toEqual([{ os: "01-00000001", entry: first }, { os: "02-00000001", entry: second }]);
    expect(result.tecnicos[0]).toMatchObject({ incomplete: true, issueCount: 1 });
    expect(JSON.stringify(logs)).toBe(before);
    const conflict = workedProductivity([demoWorkLog([first, { ...first, id: "TYPE", tipo_tiempo: "Interno" }])], fixture, operationsFilters);
    expect(conflict.issues[0].sources.map(source => source.entry.tipo_tiempo)).toEqual(["Cliente", "Interno"]);
  });
  it("calculates valid hours despite a missing clock, with unchanged capacity and independent payment fields", () => {
    const data = operationsFixture();
    data.disponibilidades = [{ id: "ABS", tecnico_id: "T1", fecha_inicio: "2026-09-02", fecha_fin: "2026-09-03", tipo: "Ausencia", observacion: null, bloquea_agenda: true }];
    const entry = { ...demoWorkEntry({ id: "BAD", hora_inicio: null }), horas_validas: 500, horas_reportadas: 100 };
    const base = workedProductivity([demoWorkLog()], data, operationsFilters);
    const logs = [demoWorkLog([demoWorkEntry(), entry])];
    const before = JSON.stringify(logs);
    const partial = workedProductivity(logs, data, operationsFilters);
    expect(partial.horasPersona).toBe(10);
    expect(partial.capacidad).toEqual(base.capacidad);
    expect(partial.tecnicos[0]).toMatchObject({ horas: 10, incomplete: true, issueCount: 1 });
    expect(partial.evolucion[0]).toMatchObject({ horasPersona: 10, incomplete: true });
    expect(partial.records.map(row => row.source.id)).toEqual(["J1"]);
    expect(JSON.stringify(logs)).toBe(before);
  });
  it("excludes all conflicting blocks from every numerator, independent of source order", () => {
    const entries = [demoWorkEntry({ hora_inicio: "08:00", hora_fin: "10:00" }),
      demoWorkEntry({ id: "B", hora_inicio: "09:00", hora_fin: "12:00" }),
      demoWorkEntry({ id: "C", hora_inicio: "11:00", hora_fin: "13:00" }),
      demoWorkEntry({ id: "VALID", hora_inicio: "13:00", hora_fin: "15:00", heredado: true })];
    for (const ordered of [entries, [...entries].reverse()]) {
      const result = workedProductivity(ordered.map((entry, i) => demoWorkLog([entry], `OS-${i}`)), fixture, operationsFilters);
      expect(result.horasPersona).toBe(2);
      expect(result.records.map(row => row.source.id)).toEqual(["VALID"]);
      expect(result.tecnicos[0]).toMatchObject({ horas: 2, horasDesdeDetalle: 0, horasDesdeOS: 2, horasDisponibles: 120, totalOS: 4, incomplete: true });
      expect(result.evolucion[0]).toMatchObject({ horasOS: 2, horasPersona: 2, horasDisponibles: 120, incomplete: true });
      expect(result.capacidad.porcentaje).toBeCloseTo(2 / 120 * 100);
    }
  });
  it("excludes contradictory types but retains reliable blocks and their participants", () => {
    const entries = [demoWorkEntry(), demoWorkEntry({ id: "TYPE", tipo_tiempo: "Interno" }),
      demoWorkEntry({ id: "NEXT", fecha_inicio: "2026-09-11", fecha_fin: "2026-09-11" })];
    const result = workedProductivity([demoWorkLog(entries)], fixture, operationsFilters);
    expect(result.horasPersona).toBe(10);
    expect(result.records.map(row => row.source.id)).toEqual(["NEXT"]);
    expect(result.tecnicos[0].evolucion[0].horas).toBe(10);
  });
  it("retains the unaffected day of an overnight interval in both detail and totals", () => {
    const log = demoWorkLog([demoWorkEntry({ hora_inicio: "22:00", hora_fin: "02:00", fecha_fin: "2026-09-11" }),
      demoWorkEntry({ id: "OVERLAP", hora_inicio: "23:00", hora_fin: "23:30" })]);
    const result = workedProductivity([log], fixture, { ...operationsFilters, periodMode: "dia" });
    expect(result.records.map(row => [row.date, row.hours])).toEqual([["2026-09-11", 2]]);
    expect(result.horasPersona).toBe(2);
    expect(result.evolucion.find(row => row.dateFrom === "2026-09-10")).toMatchObject({ horasPersona: 0, incomplete: true });
    expect(result.evolucion.find(row => row.dateFrom === "2026-09-11")).toMatchObject({ horasPersona: 2, incomplete: false });
  });
  it("does not exclude a reliable clock merely because commission validation is REVISAR", () => {
    const result = workedProductivity([demoWorkLog([demoWorkEntry({ estado_validacion: "REVISAR" })])], fixture, operationsFilters);
    expect(result.horasPersona).toBe(10); expect(result.issues).toEqual([]);
  });
  it("retains capacity and explicit partial status even when no hours can be counted", () => {
    const result = workedProductivity([demoWorkLog([demoWorkEntry({ hora_inicio: null })])], fixture, operationsFilters);
    expect(result.horasPersona).toBe(0);
    expect(result.capacidad).toEqual({ horasDisponibles: 120, porcentaje: 0 });
    expect(result.tecnicos[0]).toMatchObject({ horas: 0, productividad: 0, incomplete: true });
    expect(result.evolucion[0]).toMatchObject({ horasPersona: 0, utilizacion: 0, incomplete: true });
  });
  it("isolates incomplete technicians and retains invalid-only inactive participants", () => {
    const entry = demoWorkEntry({ id: "BAD", tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2", hora_inicio: null });
    const result = workedProductivity([demoWorkLog([demoWorkEntry(), entry])], fixture, operationsFilters);
    expect(result.tecnicos.find(row => row.profileId === "T1")).toMatchObject({ incomplete: false, horas: 10, issueCount: 0 });
    expect(result.tecnicos.find(row => row.profileId === "T2")).toMatchObject({ incomplete: true, totalOS: 1, issueCount: 1 });
    expect(result.issues[0]).toMatchObject({ reason: "Falta hora de inicio", sources: [{ entry }] });
    expect(workedProductivity([demoWorkLog([entry])], fixture, operationsFilters, "inactivos").tecnicos).toHaveLength(1);
  });
  it("does not attribute an unidentified participant's missing work to one arbitrary technician", () => {
    const entry = demoWorkEntry({ tecnico_nombre: "", tecnico_profile_id: null });
    const result = workedProductivity([demoWorkLog([demoWorkEntry(), { ...entry, id: "UNKNOWN" }])], fixture, operationsFilters);
    expect(result.issues[0].reason).toBe("Sin técnico identificado");
    expect(result.tecnicos.every(row => row.incomplete)).toBe(true);
  });
  it("scopes known incident dates to their period and clears them when the affected technician is filtered out", () => {
    const entries = [demoWorkEntry(), demoWorkEntry({ id: "BAD", fecha_inicio: "2026-08-10", fecha_fin: "2026-08-10", hora_fin: null,
      tecnico_nombre: "TECNICO DOS", tecnico_profile_id: "T2" })];
    const result = workedProductivity([demoWorkLog(entries)], fixture, { ...operationsFilters, dateFrom: "2026-08-01" });
    expect(result.evolucion.map(row => row.incomplete)).toEqual([true, false]);
    const filtered = workedProductivity([demoWorkLog(entries)], fixture, { ...operationsFilters, dateFrom: "2026-08-01", fResponsablesOS: ["TECNICO UNO"] });
    expect(filtered.issues).toHaveLength(0);
    expect(filtered.tecnicos[0].incomplete).toBe(false);
    expect(workedProductivity([demoWorkLog(entries)], fixture, operationsFilters).issues).toHaveLength(0);
  });
  it.each([
    [{ fecha_inicio: null }, "Falta fecha de inicio"], [{ fecha_fin: null }, "Falta fecha de fin"],
    [{ hora_inicio: null }, "Falta hora de inicio"], [{ hora_fin: null }, "Falta hora de fin"],
    [{ fecha_inicio: "2026-02-30" }, "Fecha de inicio inválida"], [{ hora_fin: "25:00" }, "Hora de fin inválida"],
    [{ hora_fin: "08:00" }, "Inicio y fin iguales"], [{ fecha_fin: "2026-09-09" }, "Fin anterior al inicio"],
    [{ fecha_fin: "2026-09-11" }, "Duración mayor a 16 horas"], [{ estado_validacion: "INVALIDA" }, "Registro marcado como inválido en origen"],
  ])("describes the exact clock validation failure without erasing its source: %j", (extra, reason) => {
    const entry = demoWorkEntry(extra);
    expect(inspectWorkInterval(entry).reason).toBe(reason);
    expect(workedDays(entry)).toBeNull();
  });
});
describe("work log loader", () => {
  it("bounds only list queries, never the complete OS detail", async () => {
    const rpc = vi.fn(() => ({ range: () => ({ abortSignal: async () => ({ data: [], error: null }) }) }));
    const client = { rpc };
    expect(await loadWorkLog(client, "2026-01-01", "2026-06-30", null)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    await loadWorkLog(client, "2026-01-01", "2026-09-27", null);
    expect(rpc).toHaveBeenLastCalledWith("service_orders_work_log_v1", expect.objectContaining({ p_desde: "2026-07-01", p_hasta: "2026-09-27", p_os: null }));
    await loadWorkLog(client, "2026-01-01", "2026-06-30", "01-A");
    expect(rpc).toHaveBeenLastCalledWith("service_orders_work_log_v1", expect.objectContaining({ p_desde: "2026-01-01", p_hasta: "2026-06-30", p_os: "01-A" }));
  });
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
