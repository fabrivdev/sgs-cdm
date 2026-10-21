import { describe, expect, it } from 'vitest';
import { buildCampiComments } from './campiComments';
import type { PanoramaStory } from './panoramaStoryTypes';

const story = (id: PanoramaStory['id'], value: number, status: PanoramaStory['status'] = 'ready'): PanoramaStory => ({
  id, title: id, question: `¿Qué pasa con ${id}?`, status, message: '', scope: 'Área autorizada',
  sections: ['repuestos.ventas'], cutoff: '2026-10-20', periodLabel: 'Octubre', visitKey: id,
  primary: { label: 'Total', value, unit: 'USD' }, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente', route: '/repuestos/ventas',
});

describe('Campi comment cycle', () => {
  it('speaks about verified changes but does not read unchanged card totals aloud', () => {
    const billing = story('ventas_facturacion', 80);
    billing.primary!.comparison = { value: 100, label: 'Mismo tramo LY' };
    const comments = buildCampiComments([story('ventas_evolucion', 100), billing, story('maquinas_stock', 0, 'error')], null);
    expect(comments.map(comment => comment.topic)).toEqual(['ventas_facturacion', null]);
    expect(comments[0].evidence?.value).toBe(80);
    expect(comments[0].period).toBe('Octubre');
    expect(comments[1].text).toContain('no respondió');
  });
  it('stays serene when all verified cards have no meaningful change', () => {
    const comments = buildCampiComments([story('ventas_evolucion', 100)], null);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe('neutral');
    expect(comments[0].text).toContain('No encontré cambios relevantes');
  });
  it('reports a source limitation without inventing a numeric diagnosis', () => {
    const comments = buildCampiComments([story('ventas_evolucion', 0, 'error')], null);
    expect(comments).toHaveLength(1);
    expect(comments[0].topic).toBeNull();
    expect(comments[0].evidence).toBeNull();
    expect(comments[0].text).toContain('no pude verificar');
  });
});
