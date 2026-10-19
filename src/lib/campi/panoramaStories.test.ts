import { describe, it, expect, vi } from 'vitest';
import { storySectionsForTopics, loadPanoramaStories } from './panoramaStories';
import { PANORAMA_TOPICS } from './panoramaPreferences';
import { loadSalesStories } from './salesStories';
import { loadOperationsStories } from './operationsStories';
vi.mock('./salesStories', () => ({ loadSalesStories: vi.fn(async () => []) }));
vi.mock('./operationsStories', () => ({ loadOperationsStories: vi.fn(async () => []) }));
describe('catalog to source contract', () => {
  it('grants the exact analysis permission for the distribution topic alone', () => {
    expect(storySectionsForTopics(['repuestos_stock'], () => true)).toEqual(['repuestos.analisis']);
    expect(storySectionsForTopics(['repuestos_stock'], section => section === 'repuestos.stock')).toEqual([]);
  });
  it('consolidates all authorized sales sectors, without expanding permissions', () => {
    expect(storySectionsForTopics(['ventas_facturacion'], () => true).sort()).toEqual(['servicios.ventas','repuestos.ventas','parque.ventas'].sort());
    expect(storySectionsForTopics(['ventas_facturacion'], section => section === 'servicios.ventas')).toEqual(['servicios.ventas']);
  });
  it('passes all selected topics without capping the fourth', async () => {
    const ids = PANORAMA_TOPICS.map(topic => topic.id);
    await loadPanoramaStories(ids, storySectionsForTopics(ids, () => true), '2026-10-16');
    expect(loadSalesStories).toHaveBeenLastCalledWith(ids, expect.any(Array), '2026-10-16');
    expect(loadOperationsStories).toHaveBeenLastCalledWith(ids, expect.any(Array), '2026-10-16');
  });
});
