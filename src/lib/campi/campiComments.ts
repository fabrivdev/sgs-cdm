import { interpretCampi, type CampiFinding } from './campiInterpretation';
import { storyVisitComparison, type StoryVisitSnapshot } from './panoramaStoryVisits';
import type { PanoramaStory, StoryTopicId, StoryUnit } from './panoramaStoryTypes';

export type CampiComment = {
  key: string;
  topic: StoryTopicId | null;
  kind: CampiFinding['kind'] | 'visit' | 'limit';
  urgency: CampiFinding['urgency'];
  text: string;
  period: string;
  evidence: { value: number; unit: StoryUnit } | null;
};

const number = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 });
const value = (n: number, unit: StoryUnit) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${number.format(n)}${unit === 'days' ? ' días' : unit === 'percent' ? '%' : ''}`;

/** One comment per verified topic, plus an independently comparable visit observation. */
export function buildCampiComments(stories: readonly PanoramaStory[], previous: StoryVisitSnapshot | null): CampiComment[] {
  const findings = interpretCampi(stories).findings;
  const comments = findings.flatMap(finding => {
    const story = stories.find(item => item.id === finding.topic && item.status === 'ready' && item.primary?.value !== null);
    if (!story || !story.primary || story.primary.value === null) return [];
    return [{ key: `topic:${story.id}`, topic: story.id, kind: finding.kind, urgency: finding.urgency,
      text: finding.text, period: story.periodLabel, evidence: { value: story.primary.value, unit: story.primary.unit } } satisfies CampiComment];
  });
  const visits = stories.flatMap(story => {
    const comparison = storyVisitComparison(story, previous);
    if (!comparison?.change || !story.primary || story.status !== 'ready') return [];
    return [{ key: `visit:${story.id}`, topic: story.id, kind: 'visit' as const, urgency: 'none' as const,
      text: `${story.title}: ${value(comparison.before, comparison.unit)} → ${value(comparison.current, comparison.unit)} desde la última referencia comparable en este navegador.`,
      period: story.periodLabel, evidence: { value: comparison.current, unit: comparison.unit } } satisfies CampiComment];
  });
  const result = comments.some(comment => comment.urgency === 'confirmed')
    ? [...comments.filter(comment => comment.urgency === 'confirmed'), ...visits, ...comments.filter(comment => comment.urgency !== 'confirmed')]
    : [...visits, ...comments];
  if (stories.some(story => story.status === 'error') && result.length) result.push({
    key: 'source-error', topic: null, kind: 'limit', urgency: 'none', period: '', evidence: null,
    text: 'Una fuente seleccionada no respondió por completo. Abrí esa tarjeta para reintentar la consulta.',
  });
  if (result.length) return result;
  const failed = stories.some(story => story.status === 'error');
  return [{ key: failed ? 'source-error' : 'no-evidence', topic: null, kind: 'limit', urgency: 'none',
    text: failed ? 'Hay una fuente que no pude verificar. Abrí el tema afectado para reintentar.' : 'Todavía no tengo cifras verificadas para interpretar estos temas.',
    period: '', evidence: null }];
}
