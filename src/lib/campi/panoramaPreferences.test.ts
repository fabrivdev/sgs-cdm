import { beforeEach, describe, expect, it } from 'vitest';
import { SECTION_ROUTES } from '@/lib/permissions';
import {
  availablePanoramaTopics,
  PANORAMA_TOPICS,
  panoramaStorageKey,
  readPanoramaPreferences,
  reconcilePanoramaOrder,
  savePanoramaPreferences,
} from './panoramaPreferences';

beforeEach(() => localStorage.clear());

describe('Campi Panorama topics', () => {
  it('covers every business section and uses its actual route', () => {
    expect(PANORAMA_TOPICS).toHaveLength(19);
    expect(PANORAMA_TOPICS.map(topic => topic.id)).toEqual(SECTION_ROUTES.filter(route => !route.id.startsWith('admin.')).map(route => route.id));
    for (const topic of PANORAMA_TOPICS) {
      expect(topic.path).toBe(SECTION_ROUTES.find(route => route.id === topic.id)?.route);
    }
  });

  it('requires both module and section access and keeps commissions admin-only', () => {
    const allowed = availablePanoramaTopics(module => module === 'servicios', section =>
      ['servicios.ventas', 'servicios.comisiones'].includes(section), false);
    expect(allowed.map(topic => topic.id)).toEqual(['servicios.ventas']);
    expect(availablePanoramaTopics(() => false, () => true, true)).toEqual([]);
    expect(availablePanoramaTopics(() => true, () => true, true).some(topic => topic.id === 'servicios.comisiones')).toBe(true);
  });

  it('removes revoked topics, duplicates and any choice beyond three', () => {
    const available = availablePanoramaTopics(() => true, () => true, true);
    expect(reconcilePanoramaOrder([
      'servicios.ventas', 'repuestos.analisis', 'servicios.ventas', 'parque.stock', 'parque.ventas',
    ], available)).toEqual(['servicios.ventas', 'repuestos.analisis', 'parque.stock']);
    expect(reconcilePanoramaOrder(['parque.stock', 'repuestos.analisis'], available.filter(topic => topic.id !== 'parque.stock')))
      .toEqual(['repuestos.analisis']);
  });

  it('persists choices per user and ignores the obsolete five-area preference', () => {
    localStorage.setItem('sig-cdm:panorama:v2:a', '["ventas","repuestos","parque"]');
    expect(readPanoramaPreferences('a')).toBeNull();
    savePanoramaPreferences('a', ['servicios.ventas', 'parque.stock']);
    savePanoramaPreferences('b', ['repuestos.analisis']);
    expect(readPanoramaPreferences('a')).toEqual(['servicios.ventas', 'parque.stock']);
    expect(readPanoramaPreferences('b')).toEqual(['repuestos.analisis']);
    expect(localStorage.getItem(panoramaStorageKey('a'))).not.toBe(localStorage.getItem(panoramaStorageKey('b')));
  });
});
