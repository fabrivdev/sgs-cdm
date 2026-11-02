import { validDay } from './panoramaDates';
import type { PanoramaStory, StoryPeriod, StoryTopicId } from './panoramaStoryTypes';

export type PeriodChoice = StoryPeriod | 'auto';
export const PERIOD_TOPICS: readonly StoryTopicId[] = ['ventas_evolucion', 'ventas_facturacion', 'servicios_pendientes', 'servicios_os_facturadas', 'agenda_cumplimiento', 'servicios_productividad', 'servicios_eficiencia', 'clientes_retencion', 'clientes_cobertura_posventa'];
export type PeriodPreferences = Partial<Record<StoryTopicId, StoryPeriod>>;
export const periodStorageKey = (user: string) => `sig-cdm:panorama:periods:v1:${user}`;
export function readPeriodPreferences(user: string): PeriodPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(periodStorageKey(user)) ?? '{}');
    if (!user || !value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, period]) => PERIOD_TOPICS.includes(id as StoryTopicId) && (period === 'month' || period === 'ytd')));
  } catch { return {}; }
}
export function savePeriodChoice(user: string, id: StoryTopicId, choice: PeriodChoice): boolean {
  if (!user || !PERIOD_TOPICS.includes(id)) return false;
  const values = readPeriodPreferences(user);
  if (choice === 'auto') delete values[id]; else values[id] = choice;
  try { localStorage.setItem(periodStorageKey(user), JSON.stringify(values)); return true; } catch { return false; }
}
/** Civil dates in Paraguay, inclusive. Only configured closures are excluded; no invented holidays. */
export function businessDayCount(day: string, closures: readonly string[] = []): number {
  if (!validDay(day)) throw new Error('Fecha de análisis inválida.');
  const excluded = new Set(closures.filter(validDay));
  const date = new Date(day.slice(0, 7) + '-01T00:00:00Z');
  let count = 0;
  while (date.toISOString().slice(0, 10) <= day) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !excluded.has(date.toISOString().slice(0, 10))) count++;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return count;
}
export function requestedPeriod(id: StoryTopicId, choice: PeriodChoice, day: string, closures: readonly string[] = []): StoryPeriod {
  if (!PERIOD_TOPICS.includes(id)) return 'month'; // Snapshot loaders keep their own cut, never summed.
  return choice === 'auto' ? businessDayCount(day, closures) <= 5 ? 'ytd' : 'month' : choice;
}
export function periodCaption(story: PanoramaStory): string {
  const window = story.time?.window ?? story.navigationPeriod;
  if (story.periodMode === 'ytd') return window?.from === '2026-07-01' ? 'Desde julio de 2026 hasta hoy' : 'Acumulado disponible hasta hoy';
  return 'Este mes hasta hoy';
}
/** A requested cutoff, last invoice, successful HTTP response or zero are NOT source freshness. */
export function protectAutomaticPeriod(story: PanoramaStory, choice: PeriodChoice, day: string): PanoramaStory {
  if (!PERIOD_TOPICS.includes(story.id) || story.status === 'error') return story;
  const proof = story.sourceFreshness;
  const fresh = proof?.complete === true && validDay(proof.through) && proof.through === day;
  if (fresh) return story;
  const notice = proof && validDay(proof.through) && proof.through < day
    ? `La fuente está actualizada hasta ${proof.through.slice(8)}/${proof.through.slice(5,7)}/${proof.through.slice(0,4)}; no cubre el corte solicitado.`
    : 'La actualización de la fuente al corte solicitado no está verificada.';
  // Missing freshness is not a query error. Keep the actual requested period and
  // its observed values visible; never hide it behind an accumulated fallback.
  return { ...story, periodNotice: choice === 'auto' && story.periodMode === 'month'
    ? `${notice} Se muestran los datos disponibles del mes, sin confirmar su actualización.` : notice };
}
