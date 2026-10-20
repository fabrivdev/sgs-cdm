import { describe, it, expect } from 'vitest';
import { inPanoramaCohort } from './panoramaCohort';
const order = { situacion_os: 'Cerrada', fecha_abierta_os: '2026-08-01', fecha_cierre_os: '2026-09-05' };
describe('Panorama exact operational cohort', () => {
  it('uses actual closure and excludes missing and reversed dates', () => {
    const matches = (row: typeof order) => inPanoramaCohort(row, 'resolution', '2026-09-01', '2026-09-30');
    expect(matches(order)).toBe(true);
    expect(matches({ ...order, fecha_cierre_os: '' })).toBe(false);
    expect(matches({ ...order, fecha_abierta_os: '2026-10-01' })).toBe(false);
    expect(matches({ ...order, fecha_cierre_os: '2026-10-01' })).toBe(false);
  });
  it('requires explicit open state and includes old openings without an artificial year floor', () => {
    const open = { ...order, situacion_os: 'Abierta', fecha_abierta_os: '1999-01-01', fecha_cierre_os: null };
    expect(inPanoramaCohort(open, 'open', '2000-01-01', '2026-10-20')).toBe(true);
    for (const state of ['En proceso', 'Facturada', 'Sin estado', 'Cerrada']) {
      expect(inPanoramaCohort({ ...open, situacion_os: state }, 'open', '2000-01-01', '2026-10-20')).toBe(false);
    }
    expect(inPanoramaCohort({ ...open, fecha_abierta_os: '2026-10-21' }, 'open', '2000-01-01', '2026-10-20')).toBe(false);
  });
});
