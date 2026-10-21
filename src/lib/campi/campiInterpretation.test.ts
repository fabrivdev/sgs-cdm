import { describe, expect, it } from 'vitest';
import { interpretCampi } from './campiInterpretation';
import type { PanoramaStory } from './panoramaStoryTypes';
const story = (overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({ id: 'maquinas_stock', title: 'Stock', question: '¿Cuánto stock hay?', status: 'ready', message: '', scope: 'Autorizado', sections: ['parque.operaciones'], cutoff: null, periodLabel: 'Foto vigente', primary: { label: 'Unidades', value: 23, unit: 'count' }, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente comprobada', route: '', ...overrides });
const billing = story({ id: 'ventas_facturacion', title: 'Facturación', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } } });
const orders = story({ id: 'servicios_pendientes', title: 'OS', primary: { label: 'OS abiertas', value: 37, unit: 'count' }, supporting: [{ label: 'Abiertas hace más de 30 días', value: 8, unit: 'count' }] });
describe('deterministic Campi interpretation', () => {
  it('links orders with assigned stock to an operational action', () => {
    const supply = story({ id: 'maquinas_pedidos', title: 'Pedidos pendientes',
      primary: { label: 'Pedidos pendientes', value: 12, unit: 'count' },
      supporting: [{ label: 'Pedidos con stock completo', value: 3, unit: 'count' }],
    });
    const text = interpretCampi([supply]).findings[0].text;
    expect(text).toContain('De 12 pedidos pendientes, 3 tienen stock vinculado para todas sus unidades');
  });
  it('does not turn raw counts or an attention flag into alerts', () => {
    const result = interpretCampi([story({ attention: true }), { ...orders, supporting: [] }]);
    expect(result.findings.every(f => f.kind === 'neutral')).toBe(true);
    expect(result.attention).toBe(false);
  });
  it('describes comparable sales movement without promoting age buckets to alerts', () => {
    const a = interpretCampi([story(), orders, billing]);
    const b = interpretCampi([billing, story(), orders]);
    expect(a.sentences[0]).toContain('12%');
    expect(b.sentences[0]).toContain('12%');
    expect(a.attention).toBe(false);
    expect(a.findings.find(f => f.topic === 'ventas_facturacion')?.kind).toBe('change');
  });
  it('uses the selected topic order instead of the largest percentage', () => {
    const clients = { ...billing, id: 'repuestos_clientes' as const, title: 'Ventas de repuestos', primary: { ...billing.primary!, value: 408000 } };
    expect(interpretCampi([clients, billing]).findings.map(f => f.topic)).toEqual(['repuestos_clientes', 'ventas_facturacion']);
    expect(interpretCampi([clients, billing]).findings.find(f => f.topic === 'repuestos_clientes')?.kind).toBe('change');
    const stock = story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] });
    expect(interpretCampi([billing, stock, orders]).findings.map(f => f.topic)).toEqual(['ventas_facturacion', 'repuestos_stock', 'servicios_pendientes']);
  });
  it('names the largest arithmetic area difference only when the area totals reconcile', () => {
    const input = story({ id: 'ventas_facturacion', title: 'Facturación', primary: { label: 'Ventas antes de NC del mes', value: 215150.25, unit: 'USD', comparison: { value: 793694.64, label: 'Mismo tramo de 2025' } }, chart: { kind: 'bars', title: 'Ventas por área', unit: 'USD', rows: [{ label: 'Repuestos', value: 182886.19, previous: 398983.19 }, { label: 'Servicios', value: 32264.06, previous: 5211.45 }, { label: 'Máquinas', value: 0, previous: 389500 }] } });
    const text = interpretCampi([input]).sentences[0];
    expect(text).toContain('Mayor diferencia entre áreas: Máquinas ($ 389.500 → $ 0)');
    expect(text).toContain('NC');
    expect(interpretCampi([{ ...input, chart: { ...input.chart!, rows: [{ label: 'Máquinas', value: 0, previous: 389500 }] } }]).sentences[0]).not.toContain('Mayor diferencia');
  });
  it('explains the monthly sales variation with gross amounts and a reconciled sector difference', () => {
    const sales = story({
      id: 'ventas_evolucion', title: 'Evolución de ventas',
      primary: { label: 'Ventas antes de NC', value: 150, unit: 'USD', comparison: { value: 200, label: 'Mismo tramo LY' } },
      supporting: [{ label: 'Ventas antes de NC del mes', value: 150, unit: 'USD', comparison: { value: 200, label: 'Mismo tramo LY' } }],
      breakdown: [{ label: 'Repuestos', value: 100, previous: 180, unit: 'USD' }, { label: 'Servicios', value: 50, previous: 20, unit: 'USD' }],
    });
    const interpretation = interpretCampi([sales]);
    expect(interpretation.findings[0].kind).toBe('change');
    expect(interpretation.sentences[0]).toContain('bajaron 25%');
    expect(interpretation.sentences[0]).toContain('diferencia $ 50');
    expect(interpretation.sentences[0]).toContain('Mayor diferencia entre áreas: Repuestos');
    expect(interpretCampi([{ ...sales, breakdown: sales.breakdown.slice(0, 1) }]).sentences[0]).not.toContain('Mayor diferencia');
  });
  it('rejects absent, nonfinite or zero comparison bases', () => {
    for (const value of [0, -5, Infinity, NaN]) {
      const result = interpretCampi([{ ...billing, primary: { ...billing.primary!, comparison: { value, label: 'Anterior' } } }]);
      expect(result.findings[0].kind).toBe('neutral');
    }
  });
  it('never includes error or empty payloads as verified figures', () => {
    expect(interpretCampi([story({ status: 'error' }), story({ status: 'empty' })]).findings).toEqual([]);
  });
  it('keeps a negative model, red stock and old OS as context rather than unqualified alerts', () => {
    const projection = story({ id: 'maquinas_proyeccion', breakdown: [{ label: 'A', value: -2, unit: 'count' }] });
    const stock = story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] });
    expect(interpretCampi([projection, stock, orders]).findings.every(f => f.kind === 'neutral')).toBe(true);
    expect(interpretCampi([projection, stock, orders]).attention).toBe(false);
  });
});
