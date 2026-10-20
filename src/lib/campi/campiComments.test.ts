import { describe, expect, it } from 'vitest';
import { buildCampiComments } from './campiComments';
import type { PanoramaStory } from './panoramaStoryTypes';

const story = (id: PanoramaStory['id'], value: number, status: PanoramaStory['status'] = 'ready'): PanoramaStory => ({
  id, title: id, question: `¿Qué pasa con ${id}?`, status, message: '', scope: 'Área autorizada',
  sections: ['repuestos.ventas'], cutoff: '2026-10-20', periodLabel: 'Octubre', visitKey: id,
  primary: { label: 'Total', value, unit: 'USD' }, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente', route: '/repuestos/ventas',
});

describe('Campi comment cycle', () => {
  it('keeps different topics with their own evidence and excludes failed or empty sources', () => {
    const comments = buildCampiComments([story('ventas_evolucion', 100), story('ventas_facturacion', 80), story('maquinas_stock', 0, 'error')], null);
    expect(comments.map(comment => comment.topic)).toEqual(['ventas_evolucion', 'ventas_facturacion', null]);
    expect(comments.map(comment => comment.evidence?.value)).toEqual([100, 80, undefined]);
    expect(comments.slice(0, 2).every(comment => comment.period === 'Octubre')).toBe(true);
    expect(comments[2].text).toContain('no respondió');
  });
  it('reports a source limitation without inventing a numeric diagnosis', () => {
    const comments = buildCampiComments([story('ventas_evolucion', 0, 'error')], null);
    expect(comments).toHaveLength(1);
    expect(comments[0].topic).toBeNull();
    expect(comments[0].evidence).toBeNull();
    expect(comments[0].text).toContain('no pude verificar');
  });
});
