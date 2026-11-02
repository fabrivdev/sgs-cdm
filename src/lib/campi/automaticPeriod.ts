import { validDay } from './panoramaDates';
import type { StoryPeriod, StoryTopicId } from './panoramaStoryTypes';

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
export function savePeriodChoice(user: string, id: StoryTopicId, choice: StoryPeriod): boolean {
  if (!user || !PERIOD_TOPICS.includes(id)) return false;
  const values = readPeriodPreferences(user);
  values[id] = choice;
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
export function requestedPeriod(id: StoryTopicId, choice: StoryPeriod | undefined, day: string, closures: readonly string[] = []): StoryPeriod {
  if (!PERIOD_TOPICS.includes(id)) return 'month'; // Snapshot loaders keep their own cut, never summed.
  return choice === undefined ? businessDayCount(day, closures) <= 5 ? 'ytd' : 'month' : choice;
}
