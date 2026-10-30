import type { SectionKey } from '@/lib/permissions';
import { loadSalesStories } from './salesStories';
import { loadOperationsStories } from './operationsStories';
import { CUSTOMER_COMPARISON_PERMISSIONS } from './customerComparison';
import { loadCustomerComparisonStories } from './customerComparisonSource';
import type { StoryTopicId, PanoramaStory } from './panoramaStoryTypes';
// Exact primary decision topic, not module membership or translated labels.
export const BUSINESS_SOURCE_TOPICS: Record<string, StoryTopicId> = {
  sales:'ventas_evolucion', orders:'maquinas_pedidos', customers:'clientes_cobertura_posventa',
};
export const selectedBusinessSources=(topics:readonly StoryTopicId[])=>BUSINESS_SOURCES.filter(s=>topics.includes(BUSINESS_SOURCE_TOPICS[s.id]));
export const selectedBusinessStories=(stories:readonly PanoramaStory[],topics:readonly StoryTopicId[])=>stories.filter(s=>topics.includes(s.id));
export const BUSINESS_SOURCES = [
  { id: 'sales', sections: ['repuestos.ventas','servicios.ventas','parque.ventas'] as SectionKey[] },
  { id: 'orders', sections: ['parque.operaciones'] as SectionKey[] },
  { id: 'customers', sections: CUSTOMER_COMPARISON_PERMISSIONS },
] as const;
export async function loadBusinessSources(family: string, granted: SectionKey[], asOf: string) {
  const definition = BUSINESS_SOURCES.find(s=>s.id===family);
  const sections = definition?.sections.filter(s=>granted.includes(s)) ?? [];
  if (!sections.length) return [];
  if (family === 'customers') return loadCustomerComparisonStories(sections,asOf);
  return family === 'sales' ? loadSalesStories(['ventas_evolucion'],sections,asOf,'month')
    : loadOperationsStories(family === 'orders' ? ['maquinas_pedidos'] : ['servicios_pendientes'],sections,asOf,'month');
}
