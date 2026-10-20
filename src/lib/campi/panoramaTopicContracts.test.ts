import { describe, expect, it } from 'vitest';
import { PANORAMA_TOPICS, panoramaTopicDefinition, reconcilePanoramaOrder } from './panoramaPreferences';
import { PANORAMA_CONTRACTS, topicContract } from './panoramaTopicContracts';

describe('reviewed topic registry', () => {
  it('requires an evidenced contract for every enabled topic without orphan contracts', () => {
    expect(PANORAMA_TOPICS.map(topic => topic.id).sort()).toEqual(Object.keys(PANORAMA_CONTRACTS).sort());
    for (const topic of PANORAMA_TOPICS) {
      expect(topic.contract).toBe(topicContract(topic.id));
      expect(topic.sections.length).toBeGreaterThan(0);
      expect(topic.contract?.formula).toBeTruthy();
      expect(topic.contract?.population).toBeTruthy();
      expect(topic.contract?.evidence.length).toBeGreaterThan(0);
      expect(topic.contract?.tests.length).toBeGreaterThan(0);
      expect(topic.title.trim()).toBeTruthy();
      expect(topic.question.trim()).toBeTruthy();
      expect(topic.definitionVersion.trim()).toBeTruthy();
      expect(panoramaTopicDefinition(topic.id)).toBe(topic);
    }
  });
  it('groups shared sources without grouping distinct accounting and inventory populations', () => {
    expect(topicContract('ventas_evolucion')?.queryGroup).toBe(topicContract('ventas_facturacion')?.queryGroup);
    expect(topicContract('repuestos_stock')?.queryGroup).toBe(topicContract('repuestos_alertas')?.queryGroup);
    expect(topicContract('repuestos_stock')?.queryGroup).not.toBe(topicContract('repuestos_sucursales')?.queryGroup);
    expect(topicContract('maquinas_proyeccion')).toBeUndefined();
  });
  it('preserves selected order independently of catalog order', () => {
    const ids = ['repuestos_alertas', 'ventas_facturacion', 'maquinas_stock', 'servicios_abiertas'];
    expect(reconcilePanoramaOrder(ids, [...PANORAMA_TOPICS].reverse())).toEqual(ids);
  });
});
