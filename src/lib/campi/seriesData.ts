import { supabase } from '@/integrations/supabase/client';
import { validDay, monthWindows, formatMonth } from './panoramaDates';
import type { SeriesPoint, PanoramaStory } from './panoramaStoryTypes';

export type ClosureRow = { os_numero: string; fecha_abierta_os: string | null; fecha_cierre_os: string | null; situacion_os: string | null };
export type ClosureDistribution = { total: number; bins: [number, number, number, number] };
/** Stable, narrow pages with exact cardinality; errors never publish a truncated aggregate. */
export async function loadClosures(from: string, to: string): Promise<ClosureRow[]> {
  const rows: ClosureRow[] = []; let expected: number | null = null;
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from('ordenes_servicio_importadas')
      .select('os_numero,fecha_abierta_os,fecha_cierre_os,situacion_os', { count: 'exact' })
      .gte('fecha_cierre_os', from).lte('fecha_cierre_os', to + 'T23:59:59.999Z').order('os_numero').range(offset, offset + 499);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || result.count === null || (expected !== null && expected !== result.count)) throw new Error('Cambió el universo de cierres durante la lectura.');
    expected = result.count; rows.push(...result.data);
    if (rows.length === expected) break;
    if (result.data.length !== 500 || rows.length > expected) throw new Error('Cierres incompletos.');
  }
  if (new Set(rows.map(row => row.os_numero.trim().toUpperCase())).size !== rows.length) throw new Error('Identidades de OS duplicadas.');
  return rows;
}
export function resolutionSeries(rows: readonly ClosureRow[], lastClosedDay: string, cutoff: string): SeriesPoint[] {
  return monthWindows(lastClosedDay).map(window => {
    const cohort = closureCohort(rows, window.from, window.to);
    const ids = cohort.map(row => row.os_numero.trim().toUpperCase());
    if (new Set(ids).size !== ids.length) throw new Error('Identidades de OS duplicadas.');
    const durations = cohort.map(closureDuration);
    const complete = durations.every(value => value !== null);
    const sorted = durations.filter((v): v is number => v !== null).sort((a,b) => a-b), n = sorted.length;
    const value = complete && n ? (sorted[Math.floor((n-1)/2)] + sorted[Math.floor(n/2)]) / 2 : null;
    return { ...window, value, numerator: null, denominator: cohort.length, ids, cutoff, complete };
  });
}
export function closureCohort(rows: readonly ClosureRow[], from: string, to: string): ClosureRow[] {
  return rows.filter(row => (row.situacion_os ?? '').toLowerCase().includes('cerrad') &&
    row.fecha_cierre_os?.slice(0, 10) >= from && row.fecha_cierre_os.slice(0, 10) <= to);
}
export function closureDuration(row: ClosureRow): number | null {
  const open = row.fecha_abierta_os?.slice(0, 10), close = row.fecha_cierre_os?.slice(0, 10);
  return open && close && validDay(open) && validDay(close) && open <= close
    ? (Date.parse(close + 'T00:00:00Z') - Date.parse(open + 'T00:00:00Z')) / 86400000 : null;
}
/** Uses precisely the same closure cohort and duration rule as the median. */
export function resolutionDistribution(rows: readonly ClosureRow[], from: string, to: string): ClosureDistribution | null {
  const cohort = closureCohort(rows, from, to);
  const durations = cohort.map(closureDuration);
  if (durations.some(days => days === null)) return null;
  const bins: [number, number, number, number] = [0, 0, 0, 0];
  for (const days of durations) {
    const value = days!;
    bins[value <= 7 ? 0 : value <= 15 ? 1 : value <= 30 ? 2 : 3]++;
  }
  return { total: cohort.length, bins };
}
export function seriesChart(points: readonly SeriesPoint[], title: string, unit: 'days' | 'percent'): PanoramaStory['chart'] {
  return { kind: 'trend', title, unit, rows: points.map(point => ({ label: formatMonth(point.from) + (point.to.slice(8) !== new Date(Date.UTC(Number(point.to.slice(0,4)), Number(point.to.slice(5,7)), 0)).getUTCDate().toString().padStart(2,'0') ? '*' : ''), value: point.value })) };
}
