const roundHours = (value: number) => Math.round(value * 10_000) / 10_000;

export type WorkDurationStatus = "VALIDA" | "REVISAR" | "INVALIDA";

export interface WorkDurationResult {
  calculatedHours: number | null;
  validHours: number | null;
  status: WorkDurationStatus;
  reasons: string[];
}

export function normalizeCommissionTime(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const colon = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    const second = Number(colon[3] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits || digits.length > 6) return null;
  const padded = digits.padStart(4, "0");
  const hour = Number(padded.slice(0, padded.length - 2));
  const minute = Number(padded.slice(-2));
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function utcDay(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp / 86_400_000 : null;
}

function timeMinutes(value: unknown) {
  const normalized = normalizeCommissionTime(value);
  if (!normalized) return null;
  const [hour, minute, second] = normalized.split(":").map(Number);
  if (![hour, minute, second].every(Number.isFinite)) return null;
  return hour * 60 + minute + second / 60;
}

export function calculateCommissionDuration(args: {
  startDate: string | null;
  startTime: unknown;
  endDate: string | null;
  endTime: unknown;
  reportedHours: number | null;
}): WorkDurationResult {
  const reasons: string[] = [];
  const startDay = utcDay(args.startDate);
  const endDay = utcDay(args.endDate);
  const startMinutes = timeMinutes(args.startTime);
  const endMinutes = timeMinutes(args.endTime);

  if (startDay == null || endDay == null || startMinutes == null || endMinutes == null) {
    return {
      calculatedHours: null,
      validHours: null,
      status: "INVALIDA",
      reasons: ["MARCAS_DE_TIEMPO_INCOMPLETAS"],
    };
  }

  let durationMinutes = (endDay - startDay) * 1_440 + endMinutes - startMinutes;
  if (durationMinutes <= 0 && startDay === endDay && endMinutes < startMinutes) {
    durationMinutes += 1_440;
    reasons.push("CRUCE_DE_MEDIANOCHE_INFERIDO");
  }

  if (durationMinutes <= 0) {
    return {
      calculatedHours: null,
      validHours: null,
      status: "INVALIDA",
      reasons: ["DURACION_NO_POSITIVA"],
    };
  }

  if (durationMinutes > 16 * 60) {
    return {
      calculatedHours: roundHours(durationMinutes / 60),
      validHours: null,
      status: "INVALIDA",
      reasons: ["DURACION_MAYOR_A_16_HORAS"],
    };
  }

  const calculatedHours = roundHours(durationMinutes / 60);
  const reported = args.reportedHours;
  if (reported == null || reported <= 0) {
    reasons.push("CANTIDAD_REPORTADA_AUSENTE");
    return { calculatedHours, validHours: calculatedHours, status: "REVISAR", reasons };
  }

  if (Math.abs(calculatedHours - reported) > 0.25) {
    reasons.push("DIFERENCIA_MAYOR_A_15_MINUTOS");
    return { calculatedHours, validHours: calculatedHours, status: "REVISAR", reasons };
  }

  return { calculatedHours, validHours: calculatedHours, status: "VALIDA", reasons };
}
