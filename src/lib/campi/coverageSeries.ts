import { formatMonth, monthWindows } from './panoramaDates';
import type { SeriesPoint, StoryPeriod } from './panoramaStoryTypes';

type CoverageSeriesPayload = {
  version: number;
  cohort: string;
  mode: string;
  as_of: string;
  rows: { from: string; to: string; numerator: number; denominator: number }[];
};

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Current-owner fixed cohort. This is not an as-of historical park population. */
export function parseCurrentParkCoverageSeries(
  raw: unknown,
  asOf: string,
  period: StoryPeriod,
  current: { numerator: number; denominator: number },
): { points: SeriesPoint[]; rows: { label: string; value: number | null }[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as CoverageSeriesPayload;
  const windows = monthWindows(asOf, period === 'ytd' ? Number(asOf.slice(5, 7)) : 6);
  if (payload.version !== 1 || payload.cohort !== 'current_park' || payload.mode !== period || payload.as_of !== asOf
    || !Array.isArray(payload.rows) || payload.rows.length !== windows.length) return null;
  if (!whole(current.numerator) || !whole(current.denominator) || current.numerator > current.denominator) return null;
  const points: SeriesPoint[] = [];
  for (let index = 0; index < windows.length; index += 1) {
    const row = payload.rows[index];
    const window = windows[index];
    if (!row || row.from !== (period === 'ytd' ? `${window.from.slice(0, 4)}-01-01` : window.from)
      || row.to !== window.to || !whole(row.numerator) || !whole(row.denominator)
      || row.numerator > row.denominator || row.denominator !== current.denominator) return null;
    points.push({ from: row.from, to: row.to, value: row.denominator ? row.numerator / row.denominator * 100 : null,
      numerator: row.numerator, denominator: row.denominator, ids: [], cutoff: asOf, complete: true });
  }
  if (points.at(-1)?.numerator !== current.numerator || points.at(-1)?.denominator !== current.denominator) return null;
  return { points, rows: points.map((point, index) => ({ label: formatMonth(windows[index].from), value: point.value })) };
}
