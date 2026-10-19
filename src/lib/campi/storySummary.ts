import type { PanoramaStory } from './panoramaStoryTypes';

export type StorySummaryPercentage = { value: number; label: string; kind: 'variation' | 'composition' };
/** Only compare values whose period/scope was paired by the source loader. */
export function storySummaryPercentage(story: PanoramaStory): StorySummaryPercentage | null {
  const primary = story.primary;
  if (!primary || primary.value === null || !Number.isFinite(primary.value)) return null;
  const previous = primary.comparison?.value;
  if (previous !== undefined && Number.isFinite(previous) && previous > 0) {
    return { value: (primary.value - previous) / previous * 100, label: `vs. ${primary.comparison!.label.toLowerCase()}`, kind: 'variation' };
  }
  // These are shares of the current snapshot, never historical variation.
  const partLabel = story.id === 'maquinas_stock' ? 'Nuevas'
    : story.id === 'repuestos_stock' ? 'Rojo · valor Kardex' : null;
  const part = story.supporting.find(datum => datum.label === partLabel && datum.unit === primary.unit);
  if (part?.value !== null && part?.value !== undefined && Number.isFinite(part.value) && primary.value > 0 && part.value >= 0 && part.value <= primary.value) {
    return { value: part.value / primary.value * 100, label: `${part.label} / ${primary.label.toLowerCase()}`, kind: 'composition' };
  }
  return null;
}
