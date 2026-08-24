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

export interface TeamCapacityMetrics {
  technicians: number;
  hoursAvailable: number;
  hoursUsed: number;
  percentage: number;
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

function resolveParticipantTotals(
  participant: ServiceOrderParticipant,
  totalsByTechnician: ImportedTechnicianTotals,
  normalizedEntries: Map<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  // The canonical technician key is written by the historical backfill and is
  // the authoritative row. Raw aliases may still coexist in the imported JSON;
  // they represent the same technician and must never be added together.
  const exactCanonical = totalsByTechnician[participant.key];
  if (exactCanonical) return exactCanonical;

  for (const source of participant.sources) {
    const direct = totalsByTechnician[source];
    if (direct) return direct;
  }

  const normalizedCanonical = normalizedEntries.get(normalizeTechnicianName(participant.key));
  if (normalizedCanonical) return normalizedCanonical;

  for (const source of participant.sources) {
    const normalized = normalizedEntries.get(normalizeTechnicianName(source));
    if (normalized) return normalized;
  }

  return undefined;
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
    const individualTotals = resolveParticipantTotals(
      participant,
      totalsByTechnician,
      normalizedEntries,
    );
    const hasIndividualHours = Boolean(individualTotals && hasOwn(individualTotals, "horas"));
    const hasIndividualKilometers = Boolean(
      individualTotals && hasOwn(individualTotals, "kilometros"),
    );
    const hasIndividualValue = Boolean(
      individualTotals && individualValueKeys.some((key) => hasOwn(individualTotals, key)),
    );

    return {
      key: participant.key,
      hours: hasIndividualHours ? numeric(individualTotals?.horas) : orderTotals.hours,
      kilometers: hasIndividualKilometers
        ? numeric(individualTotals?.kilometros)
        : orderTotals.kilometers,
      value: hasIndividualValue ? importedValue(individualTotals ?? {}) : orderTotals.value,
      source: hasIndividualHours ? "individual" : "order",
    };
  });
}

export function calculateTeamCapacity(
  hoursUsed: number,
  individualTarget: number,
  technicians: number,
): TeamCapacityMetrics {
  const safeTechnicians = Math.max(Math.trunc(Number(technicians) || 0), 0);
  const safeTarget = Math.max(Number(individualTarget) || 0, 0);
  const safeHoursUsed = Math.max(Number(hoursUsed) || 0, 0);
  const hoursAvailable = safeTarget * safeTechnicians;

  return {
    technicians: safeTechnicians,
    hoursAvailable,
    hoursUsed: safeHoursUsed,
    percentage: hoursAvailable > 0 ? (safeHoursUsed / hoursAvailable) * 100 : 0,
  };
}
