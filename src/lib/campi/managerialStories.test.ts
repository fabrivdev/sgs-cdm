import { describe, expect, it } from 'vitest';
import { customerStories, planningStory } from './managerialStories';

describe('Panorama themes reused from managerial measures', () => {
  it('keeps future agenda items outside the denominator and exposes the components', () => {
    const story = planningStory([
      { id: 'a', fecha: '2026-10-02', estado: 'Completado' },
      { id: 'b', fecha: '2026-10-10', estado: 'Pendiente' },
      { id: 'c', fecha: '2026-10-25', estado: 'Pendiente' },
    ], '2026-10-21');
    expect(story.primary?.value).toBe(50);
    expect(story.supporting).toEqual(expect.arrayContaining([{ label: 'Evaluables', value: 2, unit: 'count' }]));
    expect(story.chart?.rows).toContainEqual({ label: 'Pendientes', value: 1 });
  });

  it('does not invent a compliance rate without evaluable commitments', () => {
    const story = planningStory([{ id: 'future', fecha: '2026-10-25', estado: 'Pendiente' }], '2026-10-21');
    expect(story.status).toBe('empty');
    expect(story.primary?.value).toBeNull();
  });

  it('uses distinct customer denominators and refuses impossible source totals', () => {
    const [retention, coverage] = customerStories({ compradores_base: 20, compradores_retenidos: 8,
      propietarios_elegibles: 100, propietarios_con_compra_actual: 25 }, '2026-10-21');
    expect(retention.primary?.value).toBe(40);
    expect(coverage.primary?.value).toBe(25);
    expect(retention.chart?.rows[1].value).toBe(12);
    expect(() => customerStories({ compradores_base: 2, compradores_retenidos: 3,
      propietarios_elegibles: 5, propietarios_con_compra_actual: 1 }, '2026-10-21')).toThrow();
  });
});
