import { describe, expect, it } from "vitest";
import { summarizeReport, yearWindow, type ReportBilling, type ReportOrder } from "./model";

function order(os: string, date: string, customer: string, overrides: Partial<ReportOrder> = {}): ReportOrder {
  return { os_numero: os, fecha_abierta_os: date, cliente_nombre: customer, nro_chasis: "A550001",
    situacion_os: "Cerrada", responsable: "Ana Vera", tipo_tiempo: "Cliente", servicios_cantidad: 3,
    servicios_valor: 200, kilometro_valor: 25, raw_data: null, ...overrides };
}
const bill = (periodo: string, mo: number, km = 0) => ({ periodo, mo, km });

describe("Informe de Servicios", () => {
  it("suma solo el interno de Dolphin al total, conserva notas de crédito y separa la garantía", () => {
    const billing: ReportBilling = { months: [bill("2026-01-01", 90, 10), bill("2026-07-01", 80, 20), bill("2026-08-01", -10)],
      byType: { 2026: [{ tipo_tiempo: "Interno", mo: 20, km: 5 } as ReportBilling["byType"][number][number],
        { tipo_tiempo: "Cliente", mo: 60, km: 5 } as ReportBilling["byType"][number][number]] } };
    const { current } = summarizeReport([
      order("1", "2026-01-12", "Campos del Mañana S.A.", { tipo_tiempo: null }),
      order("2", "2026-02-01", "Alfa", { tipo_tiempo: "Garantía" }),
      order("3", "2026-07-02", "Campos del Mañana S.A.", { tipo_tiempo: "Interno" }),
      order("4", "2026-01-03", "Alfa", { tipo_tiempo: "Interno", situacion_os: "Abierta" }),
    ], billing, 2026, 8);
    expect(current).toMatchObject({ invoiced: 190, internal: 225, warranty: 225, total: 415, totalHours: 9 });
    expect(current.billedType).toMatchObject({ Cliente: 165, Interno: 25, "Sin tipo": 0 });
  });

  it("suma las horas de una OS mixta una vez y usa el año previo completo para determinar clientes nuevos", () => {
    const { current } = summarizeReport([
      order("1", "2025-12-21", "ALFA S.A."),
      order("2", "2026-01-03", "Alfa"),
      order("3", "2026-01-15", "Beta", { raw_data: { Nombre: "Beta", totales_por_tipo: {
        Cliente: { horas: 2 }, Garantia: { horas: 4 },
      } }, servicios_cantidad: 6, cliente_nombre: "Campos del Mañana S.A." }),
      order("4", "2026-02-05", "Beta", { nro_chasis: "A-550001" }),
    ], undefined, 2026, 2);
    expect(current).toMatchObject({ customers: 2, machines: 1, newCustomers: 1, totalHours: 12 });
    expect(current.hours).toMatchObject({ Cliente: 8, Garantia: 4 });
    expect(current.monthly.map(row => row.newCustomers)).toEqual([1, 0]);
  });

  it("cierra el acumulado en el último día del mes seleccionado", () => {
    expect(yearWindow(2028, 2)).toEqual({ from: "2028-01-01", to: "2028-02-29" });
  });
});
