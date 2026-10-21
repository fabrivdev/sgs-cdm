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
  const credit = value < 0 ? 20 : name === parts ? 20 : 0;
  const gross = value + credit;
  const components = name === parts ? { ventas: gross, notas_credito: -credit } : { venta_bruta: gross, notas_credito_monto: credit };
  const periodos = Array.from({ length: end - start + 1 }, (_, i) => ({ periodo: `${year}-${String(start + i).padStart(2, '0')}-01`, [amount]: value, ...components }));
  const summaryComponents = Object.fromEntries(Object.entries(components).map(([key, item]) => [key, item * periodos.length]));
  return { data: { resumen: { [amount]: value * periodos.length, ...summaryComponents, ...(name.includes('servicios') ? { nc_sign_conflicts: 0 } : {}) }, periodos }, error: null } as { data: { resumen: Record<string, number>; periodos: Array<Record<string, number | string>> }; error: null };
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
  it('shows reconciled net billing first, with gross sales and credit notes separately', async () => {
    const [billing, clients] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas', 'servicios.ventas', 'parque.ventas'], '2026-10-16');
    expect(rpc).toHaveBeenCalledTimes(9);
    expect(billing.primary).toMatchObject({ value: 280, unit: 'USD', comparison: { value: 150 } });
    expect(billing.supporting[0].value).toBe(320);
    expect(billing.supporting[1].value).toBe(-40);
    expect(billing.supporting[2].value).toBe(2800);
    expect(billing.supporting[3].value).toBe(3200);
    expect(billing.supporting.find(item => item.label === 'NC acumuladas del año')?.value).toBe(-400);
    expect(billing.chart?.rows).toHaveLength(3);
    expect(billing.detailChart).toMatchObject({ kind: 'trend', rows: expect.arrayContaining([{ label: 'Oct', value: 280, previous: 150 }]) });
    expect(billing.breakdown.filter(row => row.group === 'Mes a mes')).toHaveLength(10);
    expect(billing.cutoff).toBeNull();
    expect(clients.primary?.value).toBe(120);
    expect(clients.supporting.find(item => item.label === 'Ventas acumuladas')?.value).toBe(1200);
    expect(clients.supporting.find(item => item.label === 'Notas de crédito del mes')?.value).toBe(-20);
    expect(clients.supporting.find(item => item.label === 'Facturación neta de repuestos')?.value).toBe(100);
    expect(clients.details.join(' ')).toContain('compradores efectivos');
    expect(rpc).toHaveBeenCalledWith(parts, expect.objectContaining({ p_desde: '2025-01-01', p_hasta: '2025-10-16', p_agrupacion: 'mes' }));
  });
  it('invalidates consolidated totals on any source failure but keeps independent repuestos composition', async () => {
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
      result.data.resumen.ventas = 0;
      result.data.resumen.notas_credito = 0;
      result.data.periodos.forEach(row => { row.facturado = 0; row.ventas = 0; row.notas_credito = 0; });
      return result;
    });
    const [story] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas'], '2026-10-16');
    expect(story.primary?.value).toBe(0);
    expect(story.supporting[2].value).toBe(0);
    expect(salesChange(10, 0)).toBeNull();
    expect(salesChange(0, -10)).toBe(100);
  });
  it('keeps the sales question visible without inventing a percentage when LY gross sales are zero', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      if (args.p_desde.startsWith('2025')) {
        result.data.resumen = Object.fromEntries(Object.keys(result.data.resumen).map(key => [key, 0]));
        result.data.periodos.forEach(row => {
          for (const key of Object.keys(row)) if (key !== 'periodo') row[key] = 0;
        });
      }
      return result;
    });
    const [sales] = await loadSalesStories(['ventas_evolucion'], ['repuestos.ventas'], '2026-10-16');
    expect(sales.status).toBe('ready');
    expect(sales.primary).toMatchObject({ value: 120, unit: 'USD', comparison: { value: 0 }, note: 'Sin base comparable de ventas antes de NC.' });
    expect(sales.supporting[0]).toMatchObject({ value: 120, comparison: { value: 0 } });
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
    rpc.mockImplementation(async () => ({ data: { resumen: { total: 0, venta_bruta: 0, notas_credito_monto: 0 }, periodos: [] }, error: null }));
    const [story] = await loadSalesStories(['ventas_facturacion'], ['parque.ventas'], '2026-10-16');
    expect(story.status).toBe('ready');
    expect(story.primary?.value).toBe(0);
    expect(story.chart?.rows).toHaveLength(1);
  });
  it('rejects unbalanced sales and credit notes independently of known net billing', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      result.data.resumen.ventas = 999;
      return result;
    });
    const [billing, clients] = await loadSalesStories(['ventas_facturacion', 'repuestos_clientes'], ['repuestos.ventas'], '2026-10-16');
    expect(billing.status).toBe('error');
    expect(clients).toMatchObject({ status: 'error', primary: null });
  });
  it('makes a large machine credit note visible in the headline without discounting it twice', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      if (args.p_desde.startsWith('2026-') && args.p_hasta.startsWith('2026-10')) {
        const net = name === parts ? 110483.09 : name.includes('servicios') ? 32264.06 : -140000.30;
        const gross = name === parts ? 182886.19 : name.includes('servicios') ? 32264.06 : 0;
        const credit = gross - net;
        const october = result.data.periodos.find(row => row.periodo === '2026-10-01')!;
        for (const [field, value] of Object.entries({ [parts === name ? 'facturado' : 'total']: net, [parts === name ? 'ventas' : 'venta_bruta']: gross, [parts === name ? 'notas_credito' : 'notas_credito_monto']: parts === name ? -credit : credit })) {
          result.data.resumen[field] += value - Number(october[field]);
          october[field] = value;
        }
      }
      return result;
    });
    const [billing] = await loadSalesStories(['ventas_facturacion'], ['repuestos.ventas', 'servicios.ventas', 'parque.ventas'], '2026-10-16');
    expect(billing.status).toBe('ready');
    expect(billing.primary?.value).toBeCloseTo(2746.85, 2);
    expect(billing.supporting[0].value).toBeCloseTo(215150.25, 2);
    expect(billing.supporting[1].value).toBeCloseTo(-212403.40, 2);
    expect(billing.chart?.rows.reduce((sum, row) => sum + row.value, 0)).toBeCloseTo(2746.85, 2);
  });
  it('refuses gross service sales when credit-note signs contradict their document type', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      if (name.includes('servicios')) result.data.resumen.nc_sign_conflicts = 1;
      return result;
    });
    const [billing] = await loadSalesStories(['ventas_facturacion'], ['servicios.ventas'], '2026-10-16');
    expect(billing).toMatchObject({ status: 'error', primary: null });
  });

  it('shares reconciled machine lines between Ventas and Facturación without extra monthly requests', async () => {
    rpc.mockImplementation(async (name, args) => {
      const result = response(name, args);
      return { data: { ...result.data, lineas: result.data.periodos.flatMap(row => [
        { fecha: row.periodo, facturado: Number(row.total) + 20 },
        { fecha: row.periodo, facturado: -20 },
      ]), resumen: { ...result.data.resumen, venta_bruta: result.data.periodos.reduce((sum, row) => sum + Number(row.total) + 20, 0), notas_credito_monto: result.data.periodos.length * 20 } }, error: null };
    });
    const [sales, net] = await loadSalesStories(['ventas_evolucion', 'ventas_facturacion'], ['parque.ventas'], '2026-10-16');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(sales.status).toBe('ready');
    expect(net.status).toBe('ready');
    expect(sales.primary).toMatchObject({ value: 220, unit: 'USD', comparison: { value: 70 } });
    expect(sales.supporting[0]).toMatchObject({ value: 220, unit: 'USD', comparison: { value: 70 } });
    expect(net.primary?.value).toBe(200);
    expect(sales.chart?.kind).toBe('trend');
  });

  it('answers annual net, credit impact and sector questions independently from the same reconciled sources', async () => {
    const stories = await loadSalesStories(['ventas_neto_anual', 'ventas_nc_impacto', 'ventas_repuestos', 'ventas_servicios', 'ventas_maquinas'], ['repuestos.ventas', 'servicios.ventas', 'parque.ventas'], '2026-10-16');
    expect(stories.map(story => story.status)).toEqual(['ready', 'ready', 'ready', 'ready', 'ready']);
    expect(stories.map(story => story.primary?.value)).toEqual([2800, 40, 120, 0, 200]);
    expect(stories[0].chart).toMatchObject({ kind: 'trend', rows: expect.arrayContaining([{ label: 'Oct', value: 280, previous: 150 }]) });
    expect(stories[0].navigationPeriod).toEqual({ from: '2026-01-01', to: '2026-10-16' });
    expect(stories[1].supporting.find(row => row.label === 'Participación sobre ventas')?.value).toBe(12.5);
    expect(stories[2].sections).toEqual(['repuestos.ventas']);
    expect(stories[3].sections).toEqual(['servicios.ventas']);
    expect(stories[4].sections).toEqual(['parque.ventas']);
    expect(rpc).toHaveBeenCalledTimes(9);
  });

});
