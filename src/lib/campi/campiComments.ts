import { interpretCampi, type CampiFinding } from './campiInterpretation';
import { storyVisitComparison, type StoryVisitSnapshot } from './panoramaStoryVisits';
import { partsAlertVariants } from './partsAlertFocus';
import type { PanoramaStory, StoryTopicId, StoryUnit } from './panoramaStoryTypes';

export type CampiComment = {
  key: string;
  topic: StoryTopicId | null;
  kind: CampiFinding['kind'] | 'visit' | 'limit';
  urgency: CampiFinding['urgency'];
  text: string;
  route?: string;
  period: string;
  evidence: { value: number; unit: StoryUnit } | null;
};

const value = (n: number, unit: StoryUnit) => `${unit === 'USD' ? '$ ' : unit === 'PYG' ? '₲ ' : ''}${new Intl.NumberFormat('es-PY', { maximumFractionDigits: unit === 'USD' || unit === 'PYG' ? 0 : 2 }).format(n)}${unit === 'days' ? ' días' : unit === 'percent' ? '%' : ''}`;

/** Only speak when a verified relationship or actionable change adds to the card. */
export function buildCampiComments(stories: readonly PanoramaStory[], previous: StoryVisitSnapshot | null): CampiComment[] {
  const findings = interpretCampi(stories).findings;
  const comments = findings.filter(finding => finding.kind !== 'neutral').flatMap(finding => {
    const story = stories.find(item => item.id === finding.topic && item.status === 'ready' && item.primary?.value !== null);
    if (!story || !story.primary || story.primary.value === null) return [];
    if (story.id === 'repuestos_alertas' && finding.kind === 'attention') return partsAlertVariants(story).map(variant => ({
      key: `topic:repuestos_alertas:${variant.id}`, topic: story.id, kind: finding.kind, urgency: finding.urgency,
      text: variant.text, route: variant.route, period: story.periodLabel,
      evidence: { value: story.primary!.value!, unit: story.primary!.unit },
    } satisfies CampiComment));
    return [{ key: `topic:${story.id}`, topic: story.id, kind: finding.kind, urgency: finding.urgency,
      text: finding.text, route: finding.route, period: story.periodLabel, evidence: { value: story.primary.value, unit: story.primary.unit } } satisfies CampiComment];
  });
  const visits = stories.filter(story => story.id === 'maquinas_pedidos').flatMap(story => {
    const comparison = storyVisitComparison(story, previous);
    const complete = story.supporting.find(datum => datum.label === 'Pedidos con stock completo')?.value;
    if (!comparison?.change || !story.primary || story.status !== 'ready' || typeof complete !== 'number') return [];
    return [{ key: `visit:${story.id}`, topic: story.id, kind: 'visit' as const, urgency: 'none' as const,
      text: `${story.title}: ${value(comparison.before, comparison.unit)} → ${value(comparison.current, comparison.unit)} desde la última referencia comparable en este navegador.`,
      period: story.periodLabel, evidence: { value: comparison.current, unit: comparison.unit } } satisfies CampiComment];
  });
  const result: CampiComment[] = comments.some(comment => comment.urgency === 'confirmed')
    ? [...comments.filter(comment => comment.urgency === 'confirmed'), ...visits, ...comments.filter(comment => comment.urgency !== 'confirmed')]
    : [...visits, ...comments];
  if (stories.some(story => story.status === 'error') && result.length) result.push({
    key: 'source-error', topic: null, kind: 'limit', urgency: 'none', period: '', evidence: null,
    text: 'Una fuente seleccionada no respondió por completo. Abrí esa tarjeta para reintentar la consulta.',
  });
  if (result.length) return result;
  const failed = stories.some(story => story.status === 'error');
  const verified = stories.some(story => story.status === 'ready' && story.primary?.value !== null && story.primary?.value !== undefined);
  return [{ key: failed ? 'source-error' : 'no-evidence', topic: null, kind: verified && !failed ? 'neutral' : 'limit', urgency: 'none',
    text: failed ? 'Hay una fuente que no pude verificar. Abrí el tema afectado para reintentar.'
      : verified ? 'No encontré cambios relevantes comprobados en tus temas.' : 'Todavía no tengo cifras verificadas para interpretar estos temas.',
    period: '', evidence: null }];
}
