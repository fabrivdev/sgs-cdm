import { describe, expect, it } from 'vitest';
import type { PanoramaStory } from './panoramaStoryTypes';
import { storySummaryPercentage } from './storySummary';
const story = (value: number | null, previous?: number) => ({ id: 'ventas_facturacion', primary: { label: 'Facturación del mes', value, unit: 'USD', ...(previous !== undefined ? { comparison: { value: previous, label: 'Mismo tramo de 2025' } } : {}) }, supporting: [] } as PanoramaStory);
describe('compact story percentages', () => {
  it('uses a source-paired comparable period', () => {
    expect(storySummaryPercentage(story(448000, 400000))).toEqual({ value: 12, label: 'vs. mismo tramo de 2025', kind: 'variation' });
    expect(storySummaryPercentage(story(0, 400000))?.value).toBe(-100);
  });
  it('does not manufacture variation without a positive comparable base', () => {
    for (const s of [story(10), story(10, 0), story(10, -2), story(null, 10), story(Infinity, 10)]) expect(storySummaryPercentage(s)).toBeNull();
  });
  it('labels snapshot composition and validates its denominator and unit', () => {
    const s = { ...story(40), id: 'servicios_pendientes', primary: { label: 'OS abiertas', value: 40, unit: 'count' }, supporting: [{ label: 'Abiertas hace más de 30 días', value: 8, unit: 'count' }] } as PanoramaStory;
    expect(storySummaryPercentage(s)).toEqual({ value: 20, label: 'Abiertas hace más de 30 días / os abiertas', kind: 'composition' });
    expect(storySummaryPercentage({ ...s, primary: { ...s.primary!, value: 0 } })).toBeNull();
    expect(storySummaryPercentage({ ...s, primary: { ...s.primary!, value: 7 } })).toBeNull();
    expect(storySummaryPercentage({ ...s, primary: { ...s.primary!, unit: 'USD' } })).toBeNull();
  });
});
