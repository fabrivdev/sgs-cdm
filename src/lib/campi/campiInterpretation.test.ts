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
  it('ranks evidence independently of user topic order', () => {
    const a = interpretCampi([story(), orders, billing]);
    const b = interpretCampi([billing, story(), orders]);
    expect(a.sentences).toEqual(b.sentences);
    expect(a.sentences[0]).toContain('12%');
    expect(a.sentences[1]).toContain('8 de 37');
    expect(a.sentences[1]).toContain('no acredita vencimiento');
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
    expect(answerCampi('¿Qué mejoró?', [story()])).toContain('No hay evidencia');
  });
  it('removes answers when the associated authorized story disappears', () => {
    const q = interpretCampi([billing]).suggestions[0].question;
    expect(answerCampi(q, [orders])).toContain('No puedo responder');
  });
  it('handles only evidenced negative projected models and stock classification', () => {
    expect(interpretCampi([story({ id: 'maquinas_proyeccion', breakdown: [{ label: 'A', value: -2, unit: 'count' }] })]).attention).toBe(true);
    expect(interpretCampi([story({ id: 'repuestos_stock', supporting: [{ label: 'Rojo · valor Kardex', value: 120, unit: 'USD' }] })]).sentences[0]).toContain('sin ventas en tres años');
  });
});
