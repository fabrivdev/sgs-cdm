export interface PaidCommissionSettlement {
  id: string;
  periodo_desde: string;
  periodo_hasta: string;
  estado: string;
  total_horas: number;
  observacion: string | null;
  creado_en: string;
  pagado_en: string | null;
}

export interface PaidCommissionDetail {
  id: string;
  liquidacion_id: string;
  jornada_id: string;
  horas_pagadas: number;
  creado_en: string;
}

export interface PaidCommissionJourneyCurrent {
  id: string;
  vigente: boolean;
  sucursal: string | null;
  os_numero: string;
  estado_os: string | null;
  fecha_cierre: string | null;
  fecha_inicio: string | null;
  hora_inicio: string | null;
  fecha_fin: string | null;
  hora_fin: string | null;
  tecnico_codigo: string | null;
  tecnico_nombre: string;
  rol_tecnico: "PRINCIPAL" | "AUXILIAR";
  tipo_tiempo: string;
  horas_reportadas: number | null;
  horas_calculadas: number | null;
  horas_validas: number | null;
  estado_validacion: string;
  motivos_validacion: string[];
  actualizado_en: string;
}

export type PaidCommissionAuditCell = string | number | null;
export type PaidCommissionAuditRow = Record<string, PaidCommissionAuditCell>;

const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const paymentIsEvidenced = (settlement: PaidCommissionSettlement) =>
  settlement.estado.trim().toUpperCase() === "PAGADA" && Boolean(settlement.pagado_en?.trim());

function rowEvidence(args: {
  detail: PaidCommissionDetail | null;
  journey: PaidCommissionJourneyCurrent | null;
  reconciles: boolean | null;
}) {
  if (!args.detail) return "Incompleta: liquidaci\u00f3n pagada sin detalle";
  if (finiteNumber(args.detail.horas_pagadas) == null || args.detail.horas_pagadas <= 0) {
    return "Incompleta: horas pagadas inv\u00e1lidas";
  }
  if (!args.journey) return "Incompleta: jornada no disponible";
  if (args.reconciles === false) return "Incompleta: total de liquidaci\u00f3n no concilia con el detalle";
  return "Completa para rastreo del pago";
}

export function buildPaidCommissionAuditRows(
  settlements: readonly PaidCommissionSettlement[],
  details: readonly PaidCommissionDetail[],
  journeys: readonly PaidCommissionJourneyCurrent[],
): PaidCommissionAuditRow[] {
  const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));
  const detailsBySettlement = new Map<string, PaidCommissionDetail[]>();
  for (const detail of details) {
    detailsBySettlement.set(detail.liquidacion_id, [...(detailsBySettlement.get(detail.liquidacion_id) ?? []), detail]);
  }

  const paidSettlements = settlements
    .filter(paymentIsEvidenced)
    .sort((a, b) => String(b.pagado_en).localeCompare(String(a.pagado_en)) || a.id.localeCompare(b.id));

  return paidSettlements.flatMap((settlement) => {
    const settlementDetails = [...(detailsBySettlement.get(settlement.id) ?? [])]
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en) || a.id.localeCompare(b.id));
    const validDetailHours = settlementDetails.map((detail) => finiteNumber(detail.horas_pagadas));
    const detailHoursTotal = validDetailHours.every((value) => value != null)
      ? validDetailHours.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
    const settlementTotal = finiteNumber(settlement.total_horas);
    const reconciliationDifference = settlementTotal != null && detailHoursTotal != null
      ? settlementTotal - detailHoursTotal
      : null;
    const reconciles = reconciliationDifference == null ? null : Math.abs(reconciliationDifference) <= 0.0001;
    const rows: Array<PaidCommissionDetail | null> = settlementDetails.length ? settlementDetails : [null];

    return rows.map((detail) => {
      const journey = detail ? journeyById.get(detail.jornada_id) ?? null : null;
      const paidHours = detail ? finiteNumber(detail.horas_pagadas) : null;
      const currentValidHours = journey ? finiteNumber(journey.horas_validas) : null;
      const currentDifference = paidHours != null && currentValidHours != null
        ? currentValidHours - paidHours
        : null;

      return {
        "Liquidaci\u00f3n ID": settlement.id,
        "Estado liquidaci\u00f3n": settlement.estado,
        "Fecha de pago": settlement.pagado_en,
        "Per\u00edodo desde": settlement.periodo_desde,
        "Per\u00edodo hasta": settlement.periodo_hasta,
        "Total horas liquidaci\u00f3n": settlementTotal,
        "Suma horas detalle": detailHoursTotal,
        "Diferencia liquidaci\u00f3n - detalle": reconciliationDifference,
        "Observaci\u00f3n liquidaci\u00f3n": settlement.observacion,
        "Liquidaci\u00f3n creada en": settlement.creado_en,
        "Detalle ID": detail?.id ?? null,
        "Detalle creado en": detail?.creado_en ?? null,
        "Jornada ID": detail?.jornada_id ?? null,
        "Horas pagadas (snapshot)": paidHours,
        "T\u00e9cnico actual de la jornada": journey?.tecnico_nombre ?? null,
        "C\u00f3digo t\u00e9cnico actual": journey?.tecnico_codigo ?? null,
        "Rol actual": journey?.rol_tecnico ?? null,
        "OS actual de la jornada": journey?.os_numero ?? null,
        "Sucursal actual": journey?.sucursal ?? null,
        "Estado OS actual": journey?.estado_os ?? null,
        "Cierre OS actual": journey?.fecha_cierre ?? null,
        "Tipo de tiempo actual": journey?.tipo_tiempo ?? null,
        "Inicio actual": journey?.fecha_inicio ?? null,
        "Hora inicio actual": journey?.hora_inicio ?? null,
        "Fin actual": journey?.fecha_fin ?? null,
        "Hora fin actual": journey?.hora_fin ?? null,
        "Horas reportadas actuales": journey ? finiteNumber(journey.horas_reportadas) : null,
        "Horas calculadas actuales": journey ? finiteNumber(journey.horas_calculadas) : null,
        "Horas v\u00e1lidas actuales": currentValidHours,
        "Diferencia actuales - pagadas": currentDifference,
        "Validaci\u00f3n actual": journey?.estado_validacion ?? null,
        "Motivos actuales": journey?.motivos_validacion?.join(", ") || null,
        "Jornada vigente actual": journey ? (journey.vigente ? "S\u00ed" : "No") : null,
        "Jornada actualizada en": journey?.actualizado_en ?? null,
        "Estado de evidencia": rowEvidence({ detail, journey, reconciles }),
        "Alcance de evidencia": "Horas pagadas: snapshot hist\u00f3rico; t\u00e9cnico, OS y dem\u00e1s horas: estado actual de la jornada",
      };
    });
  });
}
