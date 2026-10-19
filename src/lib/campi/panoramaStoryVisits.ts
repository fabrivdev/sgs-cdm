import type { PanoramaStory, StoryTopicId, StoryUnit } from './panoramaStoryTypes';

export type StoryVisitSnapshot = { at: string; values: { id: StoryTopicId; value: number; unit: StoryUnit; fingerprint: string }[] };
export type StoryVisitComparison = { before: number; current: number; change: number; at: string; unit: StoryUnit };
const key = (userId: string) => `sig-cdm:panorama:alternativa:visita:v1:${userId}`;
const sessionKey = (userId: string) => `sig-cdm:panorama:alternativa:base-sesion:v1:${userId}`;
const fingerprint = (story: PanoramaStory) => JSON.stringify([story.sections.slice().sort(), story.scope, story.visitKey ?? story.periodLabel, story.source]);
export function readStoryVisit(userId: string): StoryVisitSnapshot | null {
  if (!userId) return null;
  let sessionBaseline: string | null = null;
  try { sessionBaseline = sessionStorage.getItem(sessionKey(userId)); } catch { /* Browser storage is optional. */ }
  try {
    const data: unknown = JSON.parse(sessionBaseline ?? localStorage.getItem(key(userId)) ?? 'null');
    if (!data || typeof data !== 'object' || !('at' in data) || typeof data.at !== 'string' || !Number.isFinite(Date.parse(data.at)) || !('values' in data) || !Array.isArray(data.values)) return null;
    if (!data.values.every(row => row && typeof row.id === 'string' && typeof row.fingerprint === 'string' && typeof row.unit === 'string' && typeof row.value === 'number' && Number.isFinite(row.value))) return null;
    return data as StoryVisitSnapshot;
  } catch { return null; }
}
export function storyVisitComparison(story: PanoramaStory, snapshot: StoryVisitSnapshot | null): StoryVisitComparison | null {
  if (!['ready', 'empty'].includes(story.status) || story.primary?.value == null || !Number.isFinite(story.primary.value)) return null;
  const old = snapshot?.values.find(row => row.id === story.id && row.unit === story.primary?.unit && row.fingerprint === fingerprint(story));
  return old && snapshot ? { before: old.value, current: story.primary.value, change: story.primary.value - old.value, at: snapshot.at, unit: story.primary.unit } : null;
}
export function storyVisitChange(story: PanoramaStory, snapshot: StoryVisitSnapshot | null): number | null {
  return storyVisitComparison(story, snapshot)?.change ?? null;
}
export function saveStoryVisit(userId: string, stories: readonly PanoramaStory[], at = new Date().toISOString()): void {
  if (!userId || !stories.length || stories.some(story => story.status === 'error')) return;
  const values = stories.flatMap(story => ['ready', 'empty'].includes(story.status) && story.primary?.value != null && Number.isFinite(story.primary.value)
    ? [{ id: story.id, value: story.primary.value, unit: story.primary.unit, fingerprint: fingerprint(story) }] : []);
  if (!values.length) return;
  try { if (sessionStorage.getItem(sessionKey(userId)) === null) sessionStorage.setItem(sessionKey(userId), localStorage.getItem(key(userId)) ?? 'null'); } catch { /* Browser storage is optional. */ }
  try { localStorage.setItem(key(userId), JSON.stringify({ at, values })); } catch { /* Optional local reference; the report remains usable. */ }
}
