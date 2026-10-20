import type { PanoramaStory } from './panoramaStoryTypes';

export type StorySummaryPercentage = { value: number; label: string; kind: 'variation' | 'composition' };
/** Only compare values whose period/scope was paired by the source loader. */
export function storySummaryPercentage(story: PanoramaStory): StorySummaryPercentage | null {
  const primary = story.primary;
  if (!primary || primary.value === null || !Number.isFinite(primary.value)) return null;
  if (story.id === 'repuestos_stock') {
    const total = story.supporting.find(datum => datum.label === 'Valor positivo valorizado')?.value;
    return typeof total === 'number' && Number.isFinite(total) && total > 0 && primary.value >= 0 && primary.value <= total
      ? { value: primary.value / total * 100, label: 'del valor positivo valorizado', kind: 'composition' }
      : null;
  }
  if (story.id === 'maquinas_pedidos') {
    const ready = story.supporting.find(datum => datum.label === 'Pedidos con stock')?.value;
    return typeof ready === 'number' && Number.isFinite(ready) && primary.value > 0 && ready >= 0 && ready <= primary.value
      ? { value: ready / primary.value * 100, label: 'con stock para facturar', kind: 'composition' }
      : null;
  }
  const shares: Partial<Record<PanoramaStory['id'], { denominator: string; label: string }>> = {
    maquinas_pedidos_stock: { denominator: 'Pedidos pendientes', label: 'de pedidos pendientes' },
    servicios_os_antiguas: { denominator: 'OS abiertas', label: 'de OS abiertas' },
    repuestos_rojo: { denominator: 'Valor positivo valorizado', label: 'del stock positivo' },
    ventas_nc_impacto: { denominator: 'Ventas antes de NC', label: 'de ventas' },
  };
  const share = shares[story.id];
  if (share) {
    const denominator = story.supporting.find(datum => datum.label === share.denominator)?.value;
    return typeof denominator === 'number' && Number.isFinite(denominator) && denominator > 0 && primary.value >= 0 && primary.value <= denominator
      ? { value: primary.value / denominator * 100, label: share.label, kind: 'composition' } : null;
  }
  const previous = primary.comparison?.value;
  if (previous !== undefined && Number.isFinite(previous) && previous > 0) {
    return { value: (primary.value - previous) / previous * 100, label: `vs. ${primary.comparison!.label.toLowerCase()}`, kind: 'variation' };
  }
  // These are shares of the current snapshot, never historical variation.
  const partLabel = story.id === 'maquinas_stock' ? 'Nuevas'
    : null;
  const part = story.supporting.find(datum => datum.label === partLabel && datum.unit === primary.unit);
  if (part?.value !== null && part?.value !== undefined && Number.isFinite(part.value) && primary.value > 0 && part.value >= 0 && part.value <= primary.value) {
    return { value: part.value / primary.value * 100, label: `${part.label} / ${primary.label.toLowerCase()}`, kind: 'composition' };
  }
  return null;
}
