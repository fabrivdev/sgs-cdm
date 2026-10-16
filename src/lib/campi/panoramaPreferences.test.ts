import { beforeEach, describe, expect, it } from 'vitest';
import {
  availablePanoramaAreas,
  panoramaStorageKey,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
} from './panoramaPreferences';

beforeEach(() => localStorage.clear());

describe('Campi Panorama preferences', () => {
  it('offers only routes covered by current section permissions', () => {
    const areas = availablePanoramaAreas(section => ['parque.ventas', 'repuestos.analisis'].includes(section));
    expect(areas.map(area => area.id)).toEqual(['ventas', 'repuestos']);
    expect(areas[0].routes.map(route => route.path)).toEqual(['/parque-ventas']);
    expect(areas[1].routes.map(route => route.path)).toEqual(['/repuestos/analisis']);
  });

  it('removes revoked priorities without adding other topics on behalf of the user', () => {
    const areas = availablePanoramaAreas(section => ['servicios.trabajos', 'parque.importaciones'].includes(section));
    expect(reconcilePanoramaOrder(['ventas', 'servicios'], areas)).toEqual(['servicios']);
  });

  it('limits saved priorities to three and migrates the older local order', () => {
    savePanoramaPreferences('a', ['ventas', 'repuestos', 'parque', 'servicios']);
    expect(readPanoramaPreferences('a')).toEqual(['ventas', 'repuestos', 'parque']);
    localStorage.setItem('sig-cdm:panorama:v1:b', '["servicios","parque","ventas","repuestos"]');
    expect(readPanoramaPreferences('b')).toEqual(['servicios', 'parque', 'ventas', 'repuestos']);
    expect(reconcilePanoramaOrder(readPanoramaPreferences('b'), availablePanoramaAreas(() => true))).toHaveLength(3);
  });

  it('keeps the order independent for each user in this browser', () => {
    savePanoramaPreferences('a', ['repuestos', 'ventas']);
    savePanoramaPreferences('b', ['servicios']);
    expect(readPanoramaPreferences('a')).toEqual(['repuestos', 'ventas']);
    expect(readPanoramaPreferences('b')).toEqual(['servicios']);
    expect(localStorage.getItem(panoramaStorageKey('a'))).not.toBe(localStorage.getItem(panoramaStorageKey('b')));
  });
});
