import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSalesStories, salesChange, salesRanges } from './salesStories';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
const parts = 'ventas_repuestos_panorama_filtros_v1';
function response(name: string, args: Record<string, string>) {
  const amount = name === parts ? 'facturado' : 'total';
  const year = args.p_desde.slice(0, 4);
  const start = Number(args.p_desde.slice(5, 7)), end = Number(args.p_hasta.slice(5, 7));
  const value = year === '2025' ? 50 : name === parts ? 100 : name.includes('servicios') ? -20 : 200;
  const periodos = Array.from({ length: end - start + 1 }, (_, i) => ({ periodo: `${year}-${String(start + i).padStart(2, '0')}-01`, [amount]: value, clientes: 3 }));
  return { data: { resumen: { [amount]: value * periodos.length, clientes: 7 }, periodos }, error: null };
}
beforeEach(() => { rpc.mockReset(); rpc.mockImplementation(async (name, args) => response(name, args)); });
describe('sales story source contracts', () => {
  it('filters permissions before requests and hides inaccessible stories', async () => {
    expect(await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], [], '2026-10-16')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    const [story] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['servicios.ventas'], '2026-10-16');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(story.sections).toEqual(['servicios.ventas']);
    expect(story.primary?.value).toBe(-20);
  });
  it('sums authorized net billing and reuses periods with no duplicated client calls', async () => {
    const [billing, clients] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas', 'servicios.ventas', 'parque.ventas'], '2026-10-16');
    expect(rpc).toHaveBeenCalledTimes(6);
    expect(billing.primary).toMatchObject({ value: 280, unit: 'USD', comparison: { value: 150 } });
    expect(billing.supporting[1].value).toBe(280);
    expect(billing.supporting[2].value).toBe(2800);
    expect(billing.chart?.rows).toHaveLength(10);
    expect(billing.cutoff).toBeNull();
    expect(clients.primary?.value).toBe(3);
    expect(clients.supporting[2].value).toBe(7); // DISTINCT over YTD, never 3 * 10.
    expect(clients.details.join(' ')).toContain('No equivale a compradores positivos');
    expect(rpc).toHaveBeenCalledWith(parts, expect.objectContaining({ p_desde: '2025-01-01', p_hasta: '2025-10-16', p_agrupacion: 'mes' }));
  });
  it('invalidates consolidated totals on any source failure but keeps independent clients', async () => {
    rpc.mockImplementation(async (name, args) => name.includes('servicios') ? { data: null, error: { message: 'timeout' } } : response(name, args));
    const [billing, clients] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas', 'servicios.ventas'], '2026-10-16');
    expect(billing).toMatchObject({ status: 'error', primary: null, chart: null, breakdown: [] });
    expect(clients.status).toBe('ready');
  });
  it('rejects null, missing amounts and malformed or unreconciled periods', async () => {
    for (const data of [null, { resumen: { facturado: null }, periodos: [] }, { resumen: { facturado: 100 }, periodos: [] }]) {
      rpc.mockResolvedValue({ data, error: null });
      const [story] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-10-16');
      expect(story).toMatchObject({ status: 'error', primary: null });
    }
  });
  it('preserves explicit zero and does not divide by zero', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      result.data.resumen.facturado = 0;
      result.data.periodos.forEach(row => { row.facturado = 0; });
      return result;
    });
    const [story] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-10-16');
    expect(story.primary?.value).toBe(0);
    expect(story.supporting[0].value).toBeNull();
    expect(salesChange(10, 0)).toBeNull();
    expect(salesChange(0, -10)).toBe(100);
  });
  it('uses an explicit December query in January and clamps leap-day LY', async () => {
    expect(salesRanges('2024-02-29').previousTo).toBe('2023-02-28');
    expect(() => salesRanges('2026-02-30')).toThrow();
    await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-01-03');
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith(parts, expect.objectContaining({ p_desde: '2025-12-01', p_hasta: '2025-12-31' }));
  });
  it('caps requests at two in flight', async () => {
    let active = 0, peak = 0;
    rpc.mockImplementation(async (name, args) => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--; return response(name, args);
    });
    await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas', 'servicios.ventas', 'parque.ventas'], '2026-01-03');
    expect(peak).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(9);
  });
  it('does not fetch on invalid reference date', async () => {
    const [story] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-02-30');
    expect(story.status).toBe('error');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects missing generated months and repeated periods', async () => {
    for (const repeated of [false, true]) {
      rpc.mockImplementation(async (name, args) => {
        const result = response(name, args);
        result.data.periodos = repeated ? [result.data.periodos[0], result.data.periodos[0]] : [];
        result.data.resumen.facturado = repeated ? 200 : 0;
        return result;
      });
      const [story] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-10-16');
      expect(story.status).toBe('error');
      expect(story.primary).toBeNull();
    }
  });
  it('uses zero for absent machine groups only after reconciling a complete sparse aggregate', async () => {
    rpc.mockImplementation(async () => ({ data: { resumen: { total: 0 }, periodos: [] }, error: null }));
    const [story] = await loadSalesStories(['ventas_facturacion'], ['parque.ventas'], '2026-10-16');
    expect(story.status).toBe('ready');
    expect(story.primary?.value).toBe(0);
    expect(story.chart?.rows).toHaveLength(10);
  });
  it('rejects unavailable or negative client counts independently of known money', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      result.data.resumen.clientes = -1;
      return result;
    });
    const [billing, clients] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas'], '2026-10-16');
    expect(billing.status).toBe('ready');
    expect(clients).toMatchObject({ status: 'error', primary: null });
  });

});
