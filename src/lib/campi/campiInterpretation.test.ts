import { describe, expect, it } from 'vitest';
import { answerCampi, interpretCampi } from './campiInterpretation';
import type { PanoramaStory } from './panoramaStoryTypes';
const story = (overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({ id: 'maquinas_stock', title: 'Stock', question: '¿Cuánto stock hay?', status: 'ready', message: '', scope: 'Autorizado', sections: ['parque.operaciones'], cutoff: null, periodLabel: 'Foto vigente', primary: { label: 'Unidades', value: 23, unit: 'count' }, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente comprobada', route: '', ...overrides });
const billing = story({ id: 'ventas_facturacion', title: 'Facturación', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } } });
const orders = story({ id: 'servicios_pendientes', title: 'OS', primary: { label: 'OS abiertas', value: 37, unit: 'count' }, supporting: [{ label: 'Abiertas hace más de 30 días', value: 8, unit: 'count' }] });
describe('deterministic Campi interpretation', () => {
  it('distinguishes the 17 active units from the 7 without a valid link', () => {
    const supply = story({ id: 'maquinas_pedidos', title: 'Abastecimiento de pedidos activos',
      primary: { label: 'Unidades en pedidos activos', value: 17, unit: 'count' },
      supporting: [{ label: 'Unidades activas', value: 17, unit: 'count' }],
      chart: { kind: 'bars', title: 'Vínculos', unit: 'count', rows: [
        { label: 'Sin vínculo válido', value: 7 }, { label: 'Stock identificado', value: 6 },
        { label: 'Importación en tránsito', value: 1 }, { label: 'Importación arribada', value: 3 },
      ] },
    });
    const text = interpretCampi([supply]).findings[0].text;
    expect(text).toContain('17 unidades en pedidos activos; 7 sin vínculo válido (41,2%)');
    expect(text).not.toContain('17 de 17');
    expect(answerCampi(supply.question, [supply])).toContain('7 sin vínculo válido');
    expect(interpretCampi([{ ...supply, chart: { ...supply.chart!, rows: [{ label: 'Sin vínculo válido', value: 7 }] } }]).findings[0].text).toContain('no pude conciliar');
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
    expect(interpretCampi([clients, billing]).suggestions.map(s => s.topic)).toEqual(['repuestos_clientes', 'ventas_facturacion']);
    expect(interpretCampi([clients, billing]).findings.find(f => f.topic === 'repuestos_clientes')?.kind).toBe('change');
    const stock = story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] });
    expect(interpretCampi([billing, stock, orders]).suggestions.map(s => s.topic)).toEqual(['ventas_facturacion', 'repuestos_stock']);
  });
  it('names the largest arithmetic area difference only when the area totals reconcile', () => {
    const input = story({ id: 'ventas_facturacion', title: 'Facturación', primary: { label: 'Ventas antes de NC del mes', value: 215150.25, unit: 'USD', comparison: { value: 793694.64, label: 'Mismo tramo de 2025' } }, chart: { kind: 'bars', title: 'Ventas por área', unit: 'USD', rows: [{ label: 'Repuestos', value: 182886.19, previous: 398983.19 }, { label: 'Servicios', value: 32264.06, previous: 5211.45 }, { label: 'Máquinas', value: 0, previous: 389500 }] } });
    const text = interpretCampi([input]).sentences[0];
    expect(text).toContain('Mayor diferencia entre áreas: Máquinas ($ 389.500 → $ 0)');
    expect(text).toContain('NC');
    expect(interpretCampi([{ ...input, chart: { ...input.chart!, rows: [{ label: 'Máquinas', value: 0, previous: 389500 }] } }]).sentences[0]).not.toContain('Mayor diferencia');
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
  it('offers two answerable suggestions and cites context', () => {
    const input = [orders, billing]; const result = interpretCampi(input);
    expect(result.suggestions).toHaveLength(2);
    for (const suggestion of result.suggestions) {
      const answer = answerCampi(suggestion.question, input);
      expect(answer).toContain('Abrí el detalle');
      expect(answer).not.toContain('Fuente comprobada');
    }
  });
  it('responds explicitly when asked for unavailable causes or deadlines', () => {
    expect(answerCampi('¿Por qué bajaron las ventas?', [billing])).toContain('No tengo una respuesta verificada');
    expect(answerCampi('¿Qué pedidos están vencidos?', [story()])).toContain('No tengo una respuesta verificada');
    expect(answerCampi('¿Qué mejoró?', [billing])).toContain('No puedo determinar una mejora');
    expect(answerCampi('¿Qué cambió?', [billing])).toContain('subió 12%');
    expect(answerCampi('¿Qué merece atención?', [billing])).toContain('fecha comprometida');
  });
  it('answers sales evolution from reconciled components when net billing is the selected topic', () => {
    const net = { ...billing, supporting: [{ label: 'Ventas antes de NC del mes', value: 215150.25, unit: 'USD' as const, comparison: { value: 793694.64, label: 'Mismo tramo de 2025' } }] };
    const answer = answerCampi('¿Cómo evolucionaron las ventas antes de NC?', [net]);
    expect(answer).toContain('$ 215.150,25');
    expect(answer).toContain('$ 793.694,64');
    expect(answer).toContain('Facturación neta');
    expect(answer).not.toContain('RPC');
  });
  it('removes answers when the associated authorized story disappears', () => {
    const q = interpretCampi([billing]).suggestions[0].question;
    expect(answerCampi(q, [orders])).toContain('No tengo una respuesta verificada');
  });
  it('keeps a negative model, red stock and old OS as context rather than unqualified alerts', () => {
    const projection = story({ id: 'maquinas_proyeccion', breakdown: [{ label: 'A', value: -2, unit: 'count' }] });
    const stock = story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] });
    expect(interpretCampi([projection, stock, orders]).findings.every(f => f.kind === 'neutral')).toBe(true);
    expect(interpretCampi([projection, stock, orders]).attention).toBe(false);
  });
  it('explains last-visit changes only with a matching saved scope', () => {
    const previous = { at: '2026-10-15T10:00:00Z', values: [{ id: 'ventas_facturacion' as const, value: 400000, unit: 'USD' as const, fingerprint: JSON.stringify([['parque.operaciones'], 'Otro alcance', 'Foto vigente', 'Fuente comprobada']) }] };
    expect(answerCampi('¿Qué cambió desde mi última visita?', [billing], previous)).toContain('No hay un cambio comparable');
    const matching = { ...previous, values: [{ ...previous.values[0], fingerprint: JSON.stringify([['parque.operaciones'], 'Autorizado', 'Foto vigente', 'Fuente comprobada', 'ventas-netas-nc-separadas-v3']) }] };
    const comparable = story({ id: 'ventas_facturacion', primary: { label: 'Facturación', value: 448000, unit: 'USD' } });
    expect(answerCampi('¿Qué cambió desde mi última visita?', [comparable], matching)).toContain('$ 400.000 → $ 448.000');
  });
});
