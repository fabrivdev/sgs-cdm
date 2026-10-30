import { formatDateText } from './panoramaDates';
import type { SectionKey } from '@/lib/permissions';
import { PANORAMA_TOPICS, panoramaTopicDefinition, type PanoramaTopicId } from './panoramaPreferences';
import type { PanoramaStory, StoryPeriod, StoryTopicId } from './panoramaStoryTypes';
import { loadSalesStories } from './salesStories';
import { loadOperationsStories } from './operationsStories';
import { loadManagerialStories } from './managerialStories';

export function storySectionsForTopics(topics: readonly PanoramaTopicId[], hasAccess: (section: SectionKey) => boolean): SectionKey[] {
  const sections=PANORAMA_TOPICS.filter(topic => topics.includes(topic.id)).flatMap(topic => topic.sections.filter(hasAccess));
  if(topics.some(id=>['ventas_evolucion','ventas_facturacion','ventas_neto_anual','ventas_nc_impacto'].includes(id))&&hasAccess('servicios.dashboard'))sections.push('servicios.dashboard');
  return [...new Set(sections)];
}

export async function loadPanoramaStories(topics: readonly PanoramaTopicId[], granted: readonly SectionKey[], asOf: string, period: StoryPeriod = 'month'): Promise<PanoramaStory[]> {
  const ids = topics.filter((id): id is StoryTopicId => PANORAMA_TOPICS.some(topic => topic.id === id &&
    (topic.requiresAllSections ? topic.sections.every(section => granted.includes(section)) : topic.sections.some(section => granted.includes(section)))));
  const results = (await Promise.all([loadSalesStories(ids, granted, asOf, period, true), loadOperationsStories(ids, granted, asOf, period), loadManagerialStories(ids, granted, asOf, period)])).flat();
  return ids.flatMap(id => {
    const story = results.find(item => item.id === id);
    const topic = panoramaTopicDefinition(id);
    return story && topic ? [{ ...story, title: topic.title, question: topic.question, details: story.details.map(formatDateText), message: formatDateText(story.message) }] : [];
  });
}
