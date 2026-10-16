import { describe, expect, it, vi } from 'vitest';
import { metricChange, visitMetrics } from './panoramaVisits';
import type { PanoramaMetric } from './panoramaData';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const metric: PanoramaMetric = {
  id: 'repuestos.facturado', topic: 'ventas_facturacion', label: 'Facturación de repuestos', value: 150,
  unit: 'PYG', section: 'repuestos.ventas', scope: 'Repuestos', period: '2026-10',
  cutoff: '2026-10-16', version: 'ventas_repuestos_panorama_v2', route: '/repuestos/ventas',
};

describe('Panorama visit comparisons', () => {
  it('compares the same indicator, period, scope and definition, including a zero baseline', () => {
    const previous = { captured_at: '2026-10-14T10:00:00Z', metrics: visitMetrics([{ ...metric, value: 0 }]) };
    expect(metricChange(metric, previous)).toBe(150);
    expect(metricChange(metric, { ...previous, metrics: [{ ...previous.metrics[0], period: '2026-09' }] })).toBeNull();
    expect(metricChange(metric, { ...previous, metrics: [{ ...previous.metrics[0], scope: 'Servicios' }] })).toBeNull();
    expect(metricChange(metric, { ...previous, metrics: [{ ...previous.metrics[0], version: 'old' }] })).toBeNull();
    expect(metricChange(metric, null)).toBeNull();
  });

  it('stores only finite display metrics and excludes descriptive customer data', () => {
    expect(visitMetrics([metric, { ...metric, id: 'bad', value: Number.NaN }])).toEqual([{
      id: 'repuestos.facturado', value: 150, unit: 'PYG', section: 'repuestos.ventas',
      scope: 'Repuestos', period: '2026-10', version: 'ventas_repuestos_panorama_v2',
    }]);
  });
});
