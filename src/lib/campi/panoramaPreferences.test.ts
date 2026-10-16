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
  it('offers business themes mapped to real sections, not a menu copy', () => {
    expect(PANORAMA_TOPICS.length).toBeGreaterThan(5);
    expect(PANORAMA_TOPICS.length).toBeLessThan(19);
    const known = new Set(SECTION_ROUTES.map(route => route.id));
    for (const topic of PANORAMA_TOPICS) {
      expect(topic.sections.length).toBeGreaterThan(0);
      expect(topic.sections.every(section => known.has(section))).toBe(true);
    }
  });

  it('requires module and section access and keeps commissions admin-only', () => {
    const allowed = availablePanoramaTopics(module => module === 'servicios', section =>
      ['servicios.ventas', 'servicios.comisiones'].includes(section), false);
    expect(allowed.map(topic => topic.id)).toEqual(['ventas_facturacion']);
    expect(availablePanoramaTopics(() => false, () => true, true)).toEqual([]);
    expect(availablePanoramaTopics(() => true, () => true, true).some(topic => topic.id === 'servicios_comisiones')).toBe(true);
  });

  it('removes revoked and duplicate topics without limiting the number or changing order', () => {
    const available = availablePanoramaTopics(() => true, () => true, true);
    expect(reconcilePanoramaOrder([
      'ventas_facturacion', 'repuestos_stock', 'ventas_facturacion', 'maquinas_stock', 'maquinas_pedidos',
    ], available)).toEqual(['ventas_facturacion', 'repuestos_stock', 'maquinas_stock', 'maquinas_pedidos']);
    expect(reconcilePanoramaOrder(['maquinas_stock', 'repuestos_stock'], available.filter(topic => topic.id !== 'maquinas_stock')))
      .toEqual(['repuestos_stock']);
  });

  it('persists order per user and ignores obsolete section-based preferences', () => {
    localStorage.setItem('sig-cdm:panorama:v3:a', '["servicios.ventas","parque.stock"]');
    expect(readPanoramaPreferences('a')).toBeNull();
    savePanoramaPreferences('a', ['ventas_facturacion', 'maquinas_stock', 'repuestos_stock', 'servicios_agenda']);
    savePanoramaPreferences('b', ['repuestos_stock']);
    expect(readPanoramaPreferences('a')).toEqual(['ventas_facturacion', 'maquinas_stock', 'repuestos_stock', 'servicios_agenda']);
    expect(readPanoramaPreferences('b')).toEqual(['repuestos_stock']);
    expect(localStorage.getItem(panoramaStorageKey('a'))).not.toBe(localStorage.getItem(panoramaStorageKey('b')));
  });
});
