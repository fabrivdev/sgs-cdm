import { addDays, addMonths, addWeeks, addYears, endOfISOWeek, endOfMonth, endOfYear, format, parseISO, startOfISOWeek, startOfMonth, startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import type { PeriodMode } from '@/components/dashboard/types';
export type DateWindow = { from: string; to: string };
export type PeriodComparison = { previous: number | null; ly: number | null };
export type DailyAmount = { periodo: string; total: number };
const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const start = (d: Date, mode: PeriodMode) => mode === 'semana' ? startOfISOWeek(d) : mode === 'mes' ? startOfMonth(d) : mode === 'anio' ? startOfYear(d) : d;
const end = (d: Date, mode: PeriodMode) => mode === 'semana' ? endOfISOWeek(d) : mode === 'mes' ? endOfMonth(d) : mode === 'anio' ? endOfYear(d) : d;
const shift = (d: Date, mode: PeriodMode) => mode === 'dia' ? subDays(d, 1) : mode === 'semana' ? subWeeks(d, 1) : mode === 'mes' ? subMonths(d, 1) : subYears(d, 1);
export function periodWindows(from: string, to: string, mode: PeriodMode) {
  const rows: Array<DateWindow & { periodo: string }> = [];
  for (let d = start(parseISO(from), mode); iso(d) <= to;) {
    rows.push({ periodo: iso(d), from: iso(d) < from ? from : iso(d), to: iso(end(d, mode)) > to ? to : iso(end(d, mode)) });
    d = mode === 'dia' ? addDays(d, 1) : mode === 'semana' ? addWeeks(d, 1) : mode === 'mes' ? addMonths(d, 1) : addYears(d, 1);
  }
  return rows;
}
/** Shift the actual selected dates; preserve complete month/year endings (including leap years).
 * Weekly LY means the same calendar dates last year, not a lookup by last year's Monday key. */
export function comparisonWindow(window: DateWindow, mode: PeriodMode, kind: 'previous' | 'ly'): DateWindow {
  const move = (d: Date) => kind === 'ly' ? subYears(d, 1) : shift(d, mode);
  const last = parseISO(window.to);
  const shiftedEnd = move(last);
  const completeEnd = iso(end(last, mode)) === window.to;
  return { from: iso(move(parseISO(window.from))), to: iso(completeEnd && (mode === 'mes' || mode === 'anio') ? end(shiftedEnd, mode) : shiftedEnd) };
}
export function variation(current: number, previous: number | null): number | null {
  return previous == null || previous <= 0 || !Number.isFinite(previous) || !Number.isFinite(current) ? null : (current - previous) / previous;
}
export function sumWindow(rows: readonly DailyAmount[] | null, window: DateWindow): number | null {
  if (rows === null) return null;
  let total = 0;
  for (const row of rows) if (row.periodo >= window.from && row.periodo <= window.to) {
    if (row.total == null || !Number.isFinite(Number(row.total))) return null;
    total += Number(row.total);
  }
  return total;
}
export function compareWindow(window: DateWindow, mode: PeriodMode, previous: readonly DailyAmount[] | null, ly: readonly DailyAmount[] | null): PeriodComparison {
  return { previous: sumWindow(previous, comparisonWindow(window, mode, 'previous')), ly: sumWindow(ly, comparisonWindow(window, mode, 'ly')) };
}
export async function loadPeriodComparisons(from: string, to: string, mode: PeriodMode, fetchDaily: (window: DateWindow) => Promise<DailyAmount[]>) {
  const windows = periodWindows(from, to, mode);
  const get = async (kind: 'previous' | 'ly') => {
    const ranges = [...windows, { from, to }].map(w => comparisonWindow(w, mode, kind));
    try {
      const data = await fetchDaily({ from: ranges.map(w => w.from).sort()[0], to: ranges.map(w => w.to).sort().slice(-1)[0] });
      if (!Array.isArray(data) || data.some(row => !row || !/^\d{4}-\d{2}-\d{2}$/.test(row.periodo) || row.total == null || !Number.isFinite(Number(row.total)))) return null;
      return data;
    } catch { return null; }
  };
  const [previous, ly] = await Promise.all([get('previous'), get('ly')]);
  return { periods: Object.fromEntries(windows.map(w => [w.periodo, compareWindow(w, mode, previous, ly)])), total: compareWindow({ from, to }, mode, previous, ly) };
}
export type PeriodComparisons = Awaited<ReturnType<typeof loadPeriodComparisons>>;
