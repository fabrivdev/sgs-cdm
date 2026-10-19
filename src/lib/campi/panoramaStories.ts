import type { SectionKey } from '@/lib/permissions';
import { PANORAMA_TOPICS, type PanoramaTopicId } from './panoramaPreferences';
import type { PanoramaStory, StoryTopicId } from './panoramaStoryTypes';
import { loadSalesStories } from './salesStories';
import { loadOperationsStories } from './operationsStories';

export function storySectionsForTopics(topics: readonly PanoramaTopicId[], hasAccess: (section: SectionKey) => boolean): SectionKey[] {
  return [...new Set(PANORAMA_TOPICS.filter(topic => topics.includes(topic.id)).flatMap(topic => topic.sections.filter(hasAccess)))];
}

export async function loadPanoramaStories(topics: readonly PanoramaTopicId[], granted: readonly SectionKey[], asOf: string): Promise<PanoramaStory[]> {
  const ids = topics.filter((id): id is StoryTopicId => PANORAMA_TOPICS.some(topic => topic.id === id && topic.sections.some(section => granted.includes(section))));
  const results = (await Promise.all([loadSalesStories(ids, granted, asOf), loadOperationsStories(ids, granted, asOf)])).flat();
  return ids.flatMap(id => {
    const story = results.find(item => item.id === id);
    return story ? [story] : [];
  });
}
