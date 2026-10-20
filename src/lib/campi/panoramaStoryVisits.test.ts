import { beforeEach, describe, expect, it } from 'vitest';
import type { PanoramaStory } from './panoramaStoryTypes';
import { readStoryVisit, saveStoryVisit, storyVisitChange, storyVisitComparison } from './panoramaStoryVisits';
const story: PanoramaStory = { id: 'ventas_facturacion', title: 'Facturación', question: '¿Cómo va?', status: 'ready', message: '', scope: 'Repuestos', sections: ['repuestos.ventas'], cutoff: null, periodLabel: 'Octubre 1–16', visitKey: '2026-10:v1', primary: { label: 'Mes', value: 10, unit: 'USD' }, supporting: [], chart: null, breakdown: [], details: [], source: 'ventas:v1', route: '/repuestos/ventas' };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe('local visit reference', () => {
  it('compares daily snapshots across dates while preserving definition and authorized scope', () => {
    const snapshot: PanoramaStory = { ...story, id: 'servicios_abiertas', visitKey: 'servicios_abiertas:cola-v1:2026-10-19', primary: { label: 'OS abiertas', value: 76, unit: 'count' }, sections: ['servicios.ordenes'] };
    saveStoryVisit('a', [snapshot]);
    sessionStorage.clear();
    const next = { ...snapshot, visitKey: 'servicios_abiertas:cola-v1:2026-10-20', periodLabel: 'Lectura 20/10', primary: { ...snapshot.primary!, value: 81 } };
    expect(storyVisitChange(next, readStoryVisit('a'))).toBe(5);
    expect(storyVisitChange({ ...next, scope: 'Solo Santa Rita' }, readStoryVisit('a'))).toBeNull();
    expect(storyVisitChange({ ...next, visitKey: 'servicios_abiertas:cola-v2:2026-10-20' }, readStoryVisit('a'))).toBeNull();
  });
  it('isolates users and compares the same month even when requested end date advances', () => {
    saveStoryVisit('a', [story]);
    expect(readStoryVisit('b')).toBeNull();
    sessionStorage.clear();
    expect(storyVisitChange({ ...story, periodLabel: 'Octubre 1–17', primary: { ...story.primary!, value: 12 } }, readStoryVisit('a'))).toBe(2);
    expect(storyVisitComparison({ ...story, primary: { ...story.primary!, value: 12 } }, readStoryVisit('a'))).toMatchObject({ before: 10, current: 12, change: 2, unit: 'USD' });
  });
  it('never compares different scope, definition, month or missing values', () => {
    saveStoryVisit('a', [story]); const old = readStoryVisit('a');
    sessionStorage.clear();
    const prior = readStoryVisit('a');
    expect(old).toBeNull();
    expect(storyVisitChange({ ...story, sections: ['servicios.ventas'] }, prior)).toBeNull();
    expect(storyVisitChange({ ...story, visitKey: '2026-11:v1' }, prior)).toBeNull();
    expect(storyVisitChange({ ...story, source: 'ventas:v2' }, prior)).toBeNull();
    expect(storyVisitChange({ ...story, primary: { ...story.primary!, value: null } }, prior)).toBeNull();
  });
  it('does not replace a complete baseline with failed or empty data', () => {
    saveStoryVisit('a', [story]);
    saveStoryVisit('a', [{ ...story, status: 'error' }]);
    saveStoryVisit('a', []);
    sessionStorage.clear();
    expect(readStoryVisit('a')?.values[0].value).toBe(10);
  });
  it('records a verified empty zero and compares a later nonzero value', () => {
    saveStoryVisit('a', [{ ...story, status: 'empty', primary: { ...story.primary!, value: 0 } }]);
    sessionStorage.clear();
    expect(storyVisitChange(story, readStoryVisit('a'))).toBe(10);
  });
  it('keeps the previous visit fixed across reloads within one browser session', () => {
    saveStoryVisit('a', [{ ...story, primary: { ...story.primary!, value: 8 } }]);
    sessionStorage.clear();
    expect(storyVisitChange(story, readStoryVisit('a'))).toBe(2);
    saveStoryVisit('a', [story]);
    expect(storyVisitChange(story, readStoryVisit('a'))).toBe(2);
    saveStoryVisit('a', [{ ...story, primary: { ...story.primary!, value: 12 } }]);
    expect(storyVisitChange({ ...story, primary: { ...story.primary!, value: 12 } }, readStoryVisit('a'))).toBe(4);
    sessionStorage.clear();
    expect(storyVisitChange({ ...story, primary: { ...story.primary!, value: 12 } }, readStoryVisit('a'))).toBe(0);
  });
  it('does not compare old primary definitions with the new branch and projection KPIs', () => {
    for (const id of ['repuestos_sucursales', 'maquinas_proyeccion'] as const) {
      const unit = id === 'maquinas_proyeccion' ? 'count' as const : 'days' as const;
      const current = { ...story, id, primary: { ...story.primary!, unit } };
      const legacy = { at: '2026-10-15T10:00:00Z', values: [{ id, value: 100, unit, fingerprint: JSON.stringify([['repuestos.ventas'], 'Repuestos', '2026-10:v1', 'ventas:v1']) }] };
      expect(storyVisitComparison(current, legacy)).toBeNull();
      saveStoryVisit(id, [current]);
      sessionStorage.clear();
      expect(storyVisitComparison(current, readStoryVisit(id))).not.toBeNull();
    }
  });
  it('rejects malformed saved data', () => {
    localStorage.setItem('sig-cdm:panorama:alternativa:visita:v1:a', '{"at":"bad","values":[]}');
    expect(readStoryVisit('a')).toBeNull();
  });
});
