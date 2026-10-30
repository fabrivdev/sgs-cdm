import type { StoryTopicId } from './panoramaStoryTypes';
import { panoramaTopicDefinition, type PanoramaTopicGroup } from './panoramaPreferences';

// Same Tailwind 50/700 palette used by the topic picker; keep topic identity separate from result badges.
export const PANORAMA_GROUP_TONES: Record<PanoramaTopicGroup, { selectorClass: string; accent: string; tint: string }> = {
  Resultados: { selectorClass: 'bg-emerald-50 text-emerald-700', accent: '#047857', tint: '#ecfdf5' },
  Compromisos: { selectorClass: 'bg-amber-50 text-amber-700', accent: '#b45309', tint: '#fffbeb' },
  Disponibilidad: { selectorClass: 'bg-blue-50 text-blue-700', accent: '#1d4ed8', tint: '#eff6ff' },
  Operación: { selectorClass: 'bg-violet-50 text-violet-700', accent: '#6d28d9', tint: '#f5f3ff' },
  Abastecimiento: { selectorClass: 'bg-orange-50 text-orange-700', accent: '#c2410c', tint: '#fff7ed' },
};

export const panoramaTopicTone = (id: StoryTopicId) =>
  PANORAMA_GROUP_TONES[panoramaTopicDefinition(id)?.group ?? 'Resultados'];
