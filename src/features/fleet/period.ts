import { activeReadings, dateDistanceInDays, type FleetOdometerReading } from "./model";

export type FleetPeriodMode = "week" | "month" | "year" | "custom";

export interface FleetDateRange {
  from: string;
  to: string;
  valid: boolean;
}

export interface FleetPeriodReading extends FleetOdometerReading {
  previousReadingDate: string | null;
  elapsedDays: number | null;
  travelledKm: number | null;
  countedKm: number | null;
  coverage: "initial" | "exact" | "partial";
  hasWeeklyGap: boolean;
}

export interface FleetPeriodMileage {
  rows: FleetPeriodReading[];
  exactKm: number;
  coverageFrom: string | null;
  coverageTo: string | null;
  hasPartialInterval: boolean;
}

const DAY_MS = 86_400_000;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function todayInParaguay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function defaultCustomFrom(to: string) {
  return shiftDays(to, -63);
}

export function resolveFleetPeriod(mode: FleetPeriodMode, anchor: string, customFrom: string, customTo: string): FleetDateRange {
  if (mode === "custom") return { from: customFrom, to: customTo, valid: Boolean(customFrom && customTo && customFrom <= customTo) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return { from: "", to: "", valid: false };

  if (mode === "week") {
    const day = parseDate(anchor).getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const from = shiftDays(anchor, mondayOffset);
    return { from, to: shiftDays(from, 6), valid: true };
  }
  if (mode === "month") {
    const from = `${anchor.slice(0, 7)}-01`;
    const date = parseDate(from);
    date.setUTCMonth(date.getUTCMonth() + 1);
    date.setUTCDate(0);
    return { from, to: formatDate(date), valid: true };
  }
  return { from: `${anchor.slice(0, 4)}-01-01`, to: `${anchor.slice(0, 4)}-12-31`, valid: true };
}

/**
 * Usa una lectura previa solo como frontera. Si el intervalo cruza `from`,
 * conserva su distancia real pero no la suma al total exacto del período.
 */
export function periodMileage(readings: readonly FleetOdometerReading[], range: FleetDateRange): FleetPeriodMileage {
  if (!range.valid) return { rows: [], exactKm: 0, coverageFrom: null, coverageTo: null, hasPartialInterval: false };
  const valid = activeReadings(readings);
  const rows: FleetPeriodReading[] = [];
  let exactKm = 0;

  valid.forEach((reading, index) => {
    if (reading.reading_date < range.from || reading.reading_date > range.to) return;
    const previous = index > 0 ? valid[index - 1] : null;
    const elapsedDays = previous ? dateDistanceInDays(previous.reading_date, reading.reading_date) : null;
    const travelledKm = previous ? reading.odometer_km - previous.odometer_km : null;
    const coverage: FleetPeriodReading["coverage"] = !previous
      ? "initial"
      : previous.reading_date < range.from ? "partial" : "exact";
    const countedKm = coverage === "exact" ? travelledKm : null;
    if (countedKm !== null) exactKm += countedKm;
    rows.push({
      ...reading,
      previousReadingDate: previous?.reading_date ?? null,
      elapsedDays,
      travelledKm,
      countedKm,
      coverage,
      hasWeeklyGap: elapsedDays !== null && elapsedDays > 8,
    });
  });

  const exactRows = rows.filter((row) => row.coverage === "exact" && row.previousReadingDate);
  return {
    rows,
    exactKm,
    coverageFrom: exactRows[0]?.previousReadingDate ?? null,
    coverageTo: exactRows[exactRows.length - 1]?.reading_date ?? null,
    hasPartialInterval: rows.some((row) => row.coverage === "partial"),
  };
}

export function periodDays(range: FleetDateRange) {
  if (!range.valid) return 0;
  return Math.round((parseDate(range.to).getTime() - parseDate(range.from).getTime()) / DAY_MS) + 1;
}
