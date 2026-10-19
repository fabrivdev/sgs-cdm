import { beforeEach, describe, expect, it } from 'vitest';
import type { PanoramaStory } from './panoramaStoryTypes';
import { readStoryVisit, saveStoryVisit, storyVisitChange } from './panoramaStoryVisits';
const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo va?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 1–16', visitKey: '2026-10:v1', primary: { label: 'Mes', value: 10, unit: 'USD' }, supporting: [], chart: null, breakdown: [], details: [], source: 'ventas:v1', route: '/repuestos/ventas' };
beforeEach(() => localStorage.clear());
describe('local visit reference', () => {
  it('isolates users and compares the same month even when requested end date advances', () => {
    saveStoryVisit('a', [story]);
    expect(readStoryVisit('b')).toBeNull();
    expect(storyVisitChange({ ...story, periodLabel: 'Octubre 1–17', primary: { ...story.primary!, value: 12 } }, readStoryVisit('a'))).toBe(2);
  });
  it('never compares different scope, definition, month or missing values', () => {
    saveStoryVisit('a', [story]); const old = readStoryVisit('a');
    expect(storyVisitChange({ ...story, sections: ['servicios.ventas'] }, old)).toBeNull();
    expect(storyVisitChange({ ...story, visitKey: '2026-11:v1' }, old)).toBeNull();
    expect(storyVisitChange({ ...story, source: 'ventas:v2' }, old)).toBeNull();
    expect(storyVisitChange({ ...story, primary: { ...story.primary!, value: null } }, old)).toBeNull();
  });
  it('does not replace a complete baseline with failed or empty data', () => {
    saveStoryVisit('a', [story]);
    saveStoryVisit('a', [{ ...story, status: 'error' }]);
    saveStoryVisit('a', []);
    expect(readStoryVisit('a')?.values[0].value).toBe(10);
  });
  it('records a verified empty zero and compares a later nonzero value', () => {
    saveStoryVisit('a', [{ ...story, status: 'empty', primary: { ...story.primary!, value: 0 } }]);
    expect(storyVisitChange(story, readStoryVisit('a'))).toBe(10);
  });
  it('rejects malformed saved data', () => {
    localStorage.setItem('sig-cdm:panorama:alternativa:visita:v1:a', '{"at":"bad","values":[]}');
    expect(readStoryVisit('a')).toBeNull();
  });
});
