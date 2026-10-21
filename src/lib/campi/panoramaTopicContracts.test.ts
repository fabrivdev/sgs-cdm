import { describe, expect, it } from 'vitest';
import { PANORAMA_TOPICS, panoramaTopicDefinition, reconcilePanoramaOrder } from './panoramaPreferences';
import { PANORAMA_CONTRACTS, topicContract } from './panoramaTopicContracts';

describe('reviewed topic registry', () => {
  it('requires an evidenced contract for every enabled topic without orphan contracts', () => {
    expect(PANORAMA_TOPICS.every(topic => topic.id in PANORAMA_CONTRACTS)).toBe(true);
    for (const topic of PANORAMA_TOPICS) {
      expect(topic.contract).toBe(topicContract(topic.id));
      expect(topic.sections.length).toBeGreaterThan(0);
      expect(topic.contract?.formula).toBeTruthy();
      expect(topic.contract?.population).toBeTruthy();
      expect(topic.contract?.period).toBeTruthy();
      expect(topic.contract?.comparison).toBeTruthy();
      expect(topic.contract?.chart).toBeTruthy();
      expect(topic.contract?.evidence.length).toBeGreaterThan(0);
      expect(topic.contract?.tests.length).toBeGreaterThan(0);
      expect(topic.title.trim()).toBeTruthy();
      expect(topic.question.trim()).toBeTruthy();
      expect(topic.definitionVersion.trim()).toBeTruthy();
      expect(panoramaTopicDefinition(topic.id)).toBe(topic);
    }
  });
  it('keeps distinct business questions even when they share a source', () => {
    expect(topicContract('ventas_evolucion')?.queryGroup).toBe('sales');
    expect(topicContract('ventas_facturacion')?.queryGroup).toBe('sales');
    expect(topicContract('ventas_evolucion')?.formula).not.toBe(topicContract('ventas_facturacion')?.formula);
    expect(topicContract('repuestos_alertas')?.queryGroup).toBe('parts-exposure');
    expect(topicContract('repuestos_stock')?.queryGroup).toBe('parts-exposure');
  });
  it('preserves selected order independently of catalog order', () => {
    const ids = ['repuestos_alertas', 'ventas_facturacion', 'maquinas_pedidos', 'servicios_os_facturadas'];
    expect(reconcilePanoramaOrder(ids, [...PANORAMA_TOPICS].reverse())).toEqual(ids);
  });
});
