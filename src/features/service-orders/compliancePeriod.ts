import { differenceInCalendarDays, parseISO } from "date-fns";
import type { PeriodMode } from "@/components/dashboard/types";
import { quickPeriodPresets } from "@/components/filters/quickPeriodPresets";
import { validOperationsRange } from "./data";

/** Choose readable matrix columns from the selected inclusive date range. */
export function compliancePeriodMode(from: string, to: string, today = new Date()): PeriodMode {
  if (!validOperationsRange(from, to)) return "mes";
  const preset = quickPeriodPresets(today, true).find(row => row.from === from && row.to === to);
  if (preset) return preset.mode;
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
  // Two complete adjacent weeks must remain comparable day by day.
  if (days <= 14) return "dia";
  if (days <= 42) return "semana";
  if (days <= 366) return "mes";
  return "anio";
}
