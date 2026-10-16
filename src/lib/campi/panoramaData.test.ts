import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPanoramaData, sourceSectionsForTopics } from './panoramaData';

const { rpc, semaphore } = vi.hoisted(() => ({ rpc: vi.fn(), semaphore: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useSemaforoHistorico', () => ({ fetchSemaforoHistorico: semaphore }));

beforeEach(() => {
  rpc.mockReset(); semaphore.mockReset();
  rpc.mockImplementation(async (name: string) => {
    if (name === 'ventas_repuestos_panorama_v2') return { data: { resumen: { facturado: 123, unidades_netas: 8 } }, error: null };
    if (name === 'ventas_servicios_panorama_v2') return { data: { resumen: { total: 321 } }, error: null };
    return { data: null, error: { message: 'Unexpected source' } };
  });
});

describe('Panorama metric permissions and sources', () => {
  it('queries only the permitted source and never mixes ungranted sales', async () => {
    const topics = ['ventas_facturacion', 'repuestos_demanda'] as const;
    expect(sourceSectionsForTopics(topics, section => section === 'repuestos.ventas')).toEqual(['repuestos.ventas']);
    const result = await loadPanoramaData(topics, ['repuestos.ventas'], '2026-10-16');
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('ventas_repuestos_panorama_v2', expect.objectContaining({ p_desde: '2026-10-01', p_hasta: '2026-10-16' }));
    expect(result[0].metrics.map(metric => metric.id)).toEqual(['repuestos.facturado', 'repuestos.unidades_netas']);
    expect(result[0].metrics[0]).toMatchObject({ value: 123, unit: 'USD', scope: 'Repuestos' });
  });

  it('keeps failures separate from zero and returns no fabricated metric', async () => {
    rpc.mockResolvedValue({ data: { resumen: {} }, error: null });
    const result = await loadPanoramaData(['ventas_facturacion'], ['servicios.ventas'], '2026-10-16');
    expect(result[0].metrics).toEqual([]);
    expect(result[0].error).toMatch(/no devolvió facturación/);
  });

  it('uses the valued stock source only with Analysis access', async () => {
    semaphore.mockResolvedValue({ valor_kardex_usd: 4000, fecha_analisis: '2026-10-16', version: 'v1' });
    expect(await loadPanoramaData(['repuestos_stock'], ['repuestos.stock'], '2026-10-16')).toEqual([]);
    const result = await loadPanoramaData(['repuestos_stock'], ['repuestos.analisis'], '2026-10-16');
    expect(semaphore).toHaveBeenCalledOnce();
    expect(result[0].metrics[0]).toMatchObject({ id: 'repuestos.valor_stock', value: 4000, unit: 'USD' });
  });
});
