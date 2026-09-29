import { endOfISOWeek, endOfMonth, endOfYear, format, startOfMonth, startOfWeek, startOfYear, subMonths, subWeeks } from "date-fns";

export type QuickPeriodPreset = { key: string; label: string; from: string; to: string; mode: "dia" | "semana" | "mes" };

export function quickPeriodPresets(today: Date, endAtToday = false): QuickPeriodPreset[] {
  const week = startOfWeek(today, { weekStartsOn: 1 });
  const previous = subWeeks(week, 1);
  const iso = (date: Date) => format(date, "yyyy-MM-dd");
  const currentEnd = (date: Date) => iso(endAtToday ? today : date);
  return [
    { key: "current-week", label: "Semana actual", from: iso(week), to: currentEnd(endOfISOWeek(week)), mode: "dia" },
    { key: "previous-week", label: "Semana anterior", from: iso(previous), to: iso(endOfISOWeek(previous)), mode: "dia" },
    { key: "previous-current-week", label: "Semana anterior + actual", from: iso(previous), to: currentEnd(endOfISOWeek(week)), mode: "dia" },
    { key: "current-month", label: "Este mes", from: iso(startOfMonth(today)), to: currentEnd(endOfMonth(today)), mode: "semana" },
    { key: "last-6-months", label: "Últimos 6 meses", from: iso(startOfMonth(subMonths(today, 5))), to: iso(today), mode: "mes" },
    { key: "last-12-months", label: "Últimos 12 meses", from: iso(startOfMonth(subMonths(today, 11))), to: iso(today), mode: "mes" },
    { key: "current-year", label: "Este año", from: iso(startOfYear(today)), to: currentEnd(endOfYear(today)), mode: "mes" },
  ];
}
