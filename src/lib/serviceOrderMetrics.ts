import { normalizeTechnicianName } from "./technicianMatching";

export interface ServiceOrderMetricTotals {
  hours: number;
  kilometers: number;
  value: number;
}

export interface ServiceOrderParticipant {
  key: string;
  sources: string[];
}

export interface ServiceOrderParticipantMetrics extends ServiceOrderMetricTotals {
  key: string;
  source: "individual" | "order";
}

type ImportedTechnicianTotals = Record<string, Record<string, unknown>>;

const individualValueKeys = [
  "valor_servicio",
  "valor_repuestos",
  "valor_kilometraje",
  "valor_terceros",
] as const;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasOwn(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function importedValue(row: Record<string, unknown>): number {
  return (
    numeric(row.valor_servicio) +
    numeric(row.valor_repuestos) +
    numeric(row.valor_kilometraje) +
    numeric(row.valor_terceros)
  );
}

/**
 * Attributes a service order to every participant.
 *
 * TOTVS individual totals take precedence when they exist for that participant.
 * Otherwise, the participant inherits the complete OS totals: two technicians
 * working together on a 10-hour OS each receive 10 person-hours.
 */
export function attributeServiceOrderMetrics(
  participants: ServiceOrderParticipant[],
  totalsByTechnician: ImportedTechnicianTotals,
  orderTotals: ServiceOrderMetricTotals,
): ServiceOrderParticipantMetrics[] {
  const normalizedEntries = new Map<string, Record<string, unknown>>();

  for (const [source, totals] of Object.entries(totalsByTechnician)) {
    normalizedEntries.set(normalizeTechnicianName(source), totals);
  }

  return participants.map((participant) => {
    let hasIndividualHours = false;
    let hasIndividualKilometers = false;
    let hasIndividualValue = false;
    const individualTotals = participant.sources.reduce<ServiceOrderMetricTotals>(
      (sum, source) => {
        const direct = totalsByTechnician[source];
        const normalized = normalizedEntries.get(normalizeTechnicianName(source));
        const sourceTotals = direct ?? normalized;

        if (!sourceTotals) return sum;

        if (hasOwn(sourceTotals, "horas")) {
          hasIndividualHours = true;
          sum.hours += numeric(sourceTotals.horas);
        }
        if (hasOwn(sourceTotals, "kilometros")) {
          hasIndividualKilometers = true;
          sum.kilometers += numeric(sourceTotals.kilometros);
        }
        if (individualValueKeys.some((key) => hasOwn(sourceTotals, key))) {
          hasIndividualValue = true;
          sum.value += importedValue(sourceTotals);
        }
        return sum;
      },
      { hours: 0, kilometers: 0, value: 0 },
    );

    return {
      key: participant.key,
      hours: hasIndividualHours ? individualTotals.hours : orderTotals.hours,
      kilometers: hasIndividualKilometers ? individualTotals.kilometers : orderTotals.kilometers,
      value: hasIndividualValue ? individualTotals.value : orderTotals.value,
      source: hasIndividualHours ? "individual" : "order",
    };
  });
}
