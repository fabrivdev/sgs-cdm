import { describe, expect, it } from 'vitest';
import { PANORAMA_CATALOG_TARGETS } from './panoramaCatalogTargets';
import { PANORAMA_TOPICS } from './panoramaPreferences';

describe('Panorama business-question catalog', () => {
  it('keeps the 20 agreed questions distinct and offers only mapped topics', () => {
    const ids = PANORAMA_CATALOG_TARGETS.map(target => target.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids).size).toBe(20);
    expect(PANORAMA_TOPICS).toHaveLength(12);
    expect(ids).toContain('ventas_evolucion');
    expect(ids).toContain('facturacion_neta_nc');
    expect(ids).toContain('parque_instalado_crecimiento');
  });

  it('maps implemented or partial questions to actual stories and keeps pending ones out of the selector', () => {
    const working = new Set<string>(PANORAMA_TOPICS.map(topic => topic.id));
    const mapped = new Set<string>(PANORAMA_CATALOG_TARGETS.flatMap(target => 'currentTopicId' in target ? [target.currentTopicId] : []));
    expect([...working].every(id => mapped.has(id))).toBe(true);
    for (const target of PANORAMA_CATALOG_TARGETS) {
      expect(target.question).not.toBe('');
      expect(target.kpi).not.toBe('');
      expect(target.source).not.toBe('');
      expect(target.campiSignal).not.toBe('');
      if (target.gate === 'implemented' || target.gate === 'partial') {
        expect(target.currentTopicId).toBeDefined();
        expect(working.has(target.currentTopicId!)).toBe(true);
      } else {
        expect('currentTopicId' in target).toBe(false);
        expect(target.nextCheck).toBeTruthy();
      }
    }
  });
});
