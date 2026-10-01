import { describe, expect, it } from "vitest";
import {
  buildPaidCommissionAuditRows,
  type PaidCommissionDetail,
  type PaidCommissionJourneyCurrent,
  type PaidCommissionSettlement,
} from "./commissionPaidAuditExport";

const settlement = (overrides: Partial<PaidCommissionSettlement> = {}): PaidCommissionSettlement => ({
  id: "payment-1",
  periodo_desde: "2026-08-01",
  periodo_hasta: "2026-08-31",
  estado: "PAGADA",
  total_horas: 1,
  observacion: "Pago confirmado",
  creado_en: "2026-09-01T10:00:00Z",
  pagado_en: "2026-09-01T10:05:00Z",
  ...overrides,
});

const detail = (overrides: Partial<PaidCommissionDetail> = {}): PaidCommissionDetail => ({
  id: "detail-1",
  liquidacion_id: "payment-1",
  jornada_id: "journey-1",
  horas_pagadas: 1,
  creado_en: "2026-09-01T10:05:00Z",
  ...overrides,
});

const journey = (overrides: Partial<PaidCommissionJourneyCurrent> = {}): PaidCommissionJourneyCurrent => ({
  id: "journey-1",
  vigente: true,
  sucursal: "Santa Rita",
  os_numero: "01-00000001",
  estado_os: "Cerrada",
  fecha_cierre: "2026-08-20",
  fecha_inicio: "2026-08-20",
  hora_inicio: "08:00:00",
  fecha_fin: "2026-08-20",
  hora_fin: "09:00:00",
  tecnico_codigo: "TEC01",
  tecnico_nombre: "T\u00e9cnico Uno",
  rol_tecnico: "PRINCIPAL",
  tipo_tiempo: "Cliente",
  horas_reportadas: 1,
  horas_calculadas: 1,
  horas_validas: 1,
  estado_validacion: "VALIDA",
  motivos_validacion: [],
  actualizado_en: "2026-09-02T12:00:00Z",
  ...overrides,
});

describe("paid commission audit export", () => {
  it("exports only evidenced paid settlements and separates the paid snapshot from current journey hours", () => {
    const rows = buildPaidCommissionAuditRows(
      [
        settlement(),
        settlement({ id: "draft", estado: "BORRADOR" }),
        settlement({ id: "cancelled", estado: "ANULADA" }),
        settlement({ id: "missing-date", pagado_en: null }),
      ],
      [detail()],
      [journey({ horas_validas: 1.5, horas_calculadas: 1.5 })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      "Liquidaci\u00f3n ID": "payment-1",
      "Jornada ID": "journey-1",
      "Horas pagadas (snapshot)": 1,
      "Horas v\u00e1lidas actuales": 1.5,
      "Diferencia actuales - pagadas": 0.5,
      "Estado de evidencia": "Completa para rastreo del pago",
    });
    expect(rows[0]["Alcance de evidencia"]).toContain("snapshot hist\u00f3rico");
    expect(Object.keys(rows[0]).some((key) => /equival|reparto|deuda/i.test(key))).toBe(false);
  });

  it("keeps a paid settlement visible when its detail is absent", () => {
    const rows = buildPaidCommissionAuditRows([settlement({ total_horas: 4 })], [], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      "Liquidaci\u00f3n ID": "payment-1",
      "Detalle ID": null,
      "Jornada ID": null,
      "Total horas liquidaci\u00f3n": 4,
      "Suma horas detalle": 0,
      "Diferencia liquidaci\u00f3n - detalle": 4,
      "Estado de evidencia": "Incompleta: liquidaci\u00f3n pagada sin detalle",
    });
  });

  it("reports missing current journeys and settlement/detail reconciliation failures without dropping payment snapshots", () => {
    const rows = buildPaidCommissionAuditRows(
      [settlement({ total_horas: 3 })],
      [detail({ horas_pagadas: 1 }), detail({ id: "detail-2", jornada_id: "missing", horas_pagadas: 1 })],
      [journey()],
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row["Diferencia liquidaci\u00f3n - detalle"] === 1)).toBe(true);
    expect(rows[0]["Estado de evidencia"]).toBe("Incompleta: total de liquidaci\u00f3n no concilia con el detalle");
    expect(rows[1]).toMatchObject({
      "Jornada ID": "missing",
      "Horas pagadas (snapshot)": 1,
      "T\u00e9cnico actual de la jornada": null,
      "Estado de evidencia": "Incompleta: jornada no disponible",
    });
  });

  it("retains current inactive journeys because payment evidence is historical", () => {
    const rows = buildPaidCommissionAuditRows([settlement()], [detail()], [journey({ vigente: false })]);
    expect(rows[0]).toMatchObject({
      "Horas pagadas (snapshot)": 1,
      "Jornada vigente actual": "No",
      "Estado de evidencia": "Completa para rastreo del pago",
    });
  });
});
