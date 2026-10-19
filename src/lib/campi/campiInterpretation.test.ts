import { describe, expect, it } from 'vitest';
import { answerCampi, interpretCampi } from './campiInterpretation';
import type { PanoramaStory } from './panoramaStoryTypes';
const story = (overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({ id: 'maquinas_pedidos', title: 'Pedidos', question: '¿Cuántos pedidos hay?', status: 'ready', message: '', scope: 'Autorizado', sections: ['parque.operaciones'], cutoff: null, periodLabel: 'Foto vigente', primary: { label: 'Unidades pendientes', value: 23, unit: 'count' }, supporting: [], chart: null, breakdown: [], details: [], source: 'Fuente comprobada', route: '', ...overrides });
const billing = story({ id: 'ventas_facturacion', title: 'Facturación', primary: { label: 'Facturación del mes', value: 448000, unit: 'USD', comparison: { value: 400000, label: 'Mismo tramo de 2025' } } });
const orders = story({ id: 'servicios_pendientes', title: 'OS', primary: { label: 'OS abiertas', value: 37, unit: 'count' }, supporting: [{ label: 'Abiertas hace más de 30 días', value: 8, unit: 'count' }] });
describe('deterministic Campi interpretation', () => {
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
  it('uses the selected topic order for equal comparable sales movements', () => {
    const clients = { ...billing, id: 'repuestos_clientes' as const, title: 'Ventas de repuestos' };
    expect(interpretCampi([clients, billing]).suggestions.map(s => s.topic)).toEqual(['repuestos_clientes', 'ventas_facturacion']);
    expect(interpretCampi([clients, billing]).findings.find(f => f.topic === 'repuestos_clientes')?.kind).toBe('change');
    const stock = story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] });
    expect(interpretCampi([billing, stock, orders]).suggestions.map(s => s.topic)).toEqual(['ventas_facturacion', 'repuestos_stock']);
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
      expect(answer).toContain('Fuente comprobada');
      expect(answer).toContain('Corte: no informado');
    }
  });
  it('responds explicitly when asked for unavailable causes or deadlines', () => {
    expect(answerCampi('¿Por qué bajaron las ventas?', [billing])).toContain('No puedo responder');
    expect(answerCampi('¿Qué pedidos están vencidos?', [story()])).toContain('No puedo responder');
    expect(answerCampi('¿Qué mejoró?', [billing])).toContain('No puedo determinar una mejora');
    expect(answerCampi('¿Qué cambió?', [billing])).toContain('subió 12%');
  });
  it('removes answers when the associated authorized story disappears', () => {
    const q = interpretCampi([billing]).suggestions[0].question;
    expect(answerCampi(q, [orders])).toContain('No puedo responder');
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
    const matching = { ...previous, values: [{ ...previous.values[0], fingerprint: JSON.stringify([['parque.operaciones'], 'Autorizado', 'Foto vigente', 'Fuente comprobada', 'ventas-brutas-nc-separadas-v2']) }] };
    const comparable = story({ id: 'ventas_facturacion', primary: { label: 'Facturación', value: 448000, unit: 'USD' } });
    expect(answerCampi('¿Qué cambió desde mi última visita?', [comparable], matching)).toContain('400.000 → USD 448.000');
  });
});
