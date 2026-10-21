import { describe, it, expect, vi } from 'vitest';
import { storySectionsForTopics, loadPanoramaStories } from './panoramaStories';
import { PANORAMA_TOPICS } from './panoramaPreferences';
import { loadSalesStories } from './salesStories';
import { loadOperationsStories } from './operationsStories';
import { loadManagerialStories } from './managerialStories';
vi.mock('./salesStories', () => ({ loadSalesStories: vi.fn(async () => []) }));
vi.mock('./operationsStories', () => ({ loadOperationsStories: vi.fn(async () => []) }));
vi.mock('./managerialStories', () => ({ loadManagerialStories: vi.fn(async () => []) }));
describe('catalog to source contract', () => {
  it('grants the exact analysis permission for the distribution topic alone', () => {
    expect(storySectionsForTopics(['repuestos_stock'], () => true)).toEqual(['repuestos.analisis']);
    expect(storySectionsForTopics(['repuestos_stock'], section => section === 'repuestos.stock')).toEqual([]);
  });
  it('consolidates all authorized sales sectors, without expanding permissions', () => {
    expect(storySectionsForTopics(['ventas_facturacion'], () => true).sort()).toEqual(['servicios.ventas','repuestos.ventas','parque.ventas'].sort());
    expect(storySectionsForTopics(['ventas_facturacion'], section => section === 'servicios.ventas')).toEqual(['servicios.ventas']);
  });
  it('does not load billed-hours efficiency without both service permissions', async () => {
    await loadPanoramaStories(['servicios_eficiencia'], ['servicios.ordenes'], '2026-10-16');
    expect(loadManagerialStories).toHaveBeenLastCalledWith([], ['servicios.ordenes'], '2026-10-16', 'month');
    await loadPanoramaStories(['servicios_eficiencia'], ['servicios.ordenes', 'servicios.ventas'], '2026-10-16');
    expect(loadManagerialStories).toHaveBeenLastCalledWith(['servicios_eficiencia'], ['servicios.ordenes', 'servicios.ventas'], '2026-10-16', 'month');
  });
  it('passes all selected topics without capping the fourth', async () => {
    const ids = PANORAMA_TOPICS.map(topic => topic.id);
    await loadPanoramaStories(ids, storySectionsForTopics(ids, () => true), '2026-10-16');
    expect(loadSalesStories).toHaveBeenLastCalledWith(ids, expect.any(Array), '2026-10-16', 'month');
    expect(loadOperationsStories).toHaveBeenLastCalledWith(ids, expect.any(Array), '2026-10-16', 'month');
    expect(loadManagerialStories).toHaveBeenLastCalledWith(ids, expect.any(Array), '2026-10-16', 'month');
  });
  it('uses the shared topic title and question in the returned story', async () => {
    vi.mocked(loadSalesStories).mockResolvedValueOnce([{
      id: 'ventas_facturacion', title: 'Old title', question: 'Old question', status: 'ready', message: '', scope: 'Servicios',
      sections: ['servicios.ventas'], cutoff: null, periodLabel: 'Octubre', primary: null,
      supporting: [], chart: null, breakdown: [], details: [], source: 'test', route: '',
    }]);
    const [story] = await loadPanoramaStories(['ventas_facturacion'], ['servicios.ventas'], '2026-10-16');
    expect(story.title).toBe('Facturación neta');
    expect(story.question).toBe(PANORAMA_TOPICS.find(topic => topic.id === story.id)?.question);
  });
});
