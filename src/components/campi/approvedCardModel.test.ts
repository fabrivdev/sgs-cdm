import { describe, expect, it } from 'vitest';
import type { PanoramaStory } from '@/lib/campi/panoramaStoryTypes';
import { APPROVED_CARD_IDS, approvedAssessment, approvedBadge, approvedContext, approvedPeriodEnabled, isApprovedCard } from './approvedCardModel';

const story = (id: PanoramaStory['id'], overrides: Partial<PanoramaStory> = {}): PanoramaStory => ({
  id, title: 'Tema', question: '', status: 'ready', message: '', scope: '', sections: [], cutoff: null,
  periodLabel: '', primary: null, supporting: [], chart: null, breakdown: [], details: [], source: '', route: '', ...overrides,
});

describe('approved Panorama card contracts', () => {
  it('selects all 12 approved topics through the same renderer', () => {
    expect(APPROVED_CARD_IDS).toHaveLength(12);
    expect(isApprovedCard('servicios_os_facturadas')).toBe(true);
    expect(isApprovedCard('clientes_cobertura_posventa')).toBe(true);
    expect(isApprovedCard('servicios_pendientes')).toBe(true);
  });

  it('only enables the selector when both real period aggregations are offered', () => {
    expect(approvedPeriodEnabled(story('repuestos_stock'))).toBe(false);
    expect(approvedPeriodEnabled(story('servicios_eficiencia', { periodOptions: ['month', 'ytd'] }))).toBe(true);
  });

  it('describes Resolution as a median and compares absolute days, not percentages', () => {
    const item = story('servicios_pendientes', { primary: { label: 'Mediana de resolución', value: 14, unit: 'days', comparison: { value: 16.5, label: 'mes anterior' } },
      supporting: [{ label: 'OS cerradas en Oct', value: 84, unit: 'count' }] });
    expect(approvedContext(item)).toContain('Mediana de cierre · 84 OS cerradas');
    expect(approvedBadge(item)).toMatchObject({ text: '↓ 2,5 días', direction: 'down' });
    expect(approvedBadge({ ...item, primary: { label: 'Mediana de resolución', value: 14, unit: 'days' } })).toBeNull();
  });

  it('states the billed OS numerator rather than conflating it with all Cliente-type OS', () => {
    const item = story('servicios_os_facturadas', { primary: { label: 'OS facturadas', value: 24.1, unit: 'percent' }, supporting: [
      { label: 'Facturadas a cliente', value: 7, unit: 'count' }, { label: 'OS cerradas', value: 29, unit: 'count' },
      { label: 'Tipo Cliente', value: 11, unit: 'count' },
    ] });
    expect(approvedContext(item)).toBe('De 29 órdenes cerradas, 7 se facturaron a clientes');
  });

  it('only describes the NC share when gross plus signed credit equals the displayed net', () => {
    const base = story('ventas_facturacion', { periodMode: 'month', primary: { label: 'Neto', value: 900, unit: 'USD' }, supporting: [
      { label: 'Ventas antes de NC del mes', value: 1000, unit: 'USD' }, { label: 'Notas de crédito del mes', value: -100, unit: 'USD' },
    ] });
    expect(approvedContext(base)).toContain('10% en NC');
    expect(approvedContext({ ...base, primary: { label: 'Neto', value: 950, unit: 'USD' } })).toBeNull();
  });

  it('shows a real partial-month movement in pp with its unequal-window qualification', () => {
    const item = story('servicios_os_facturadas', { periodMode: 'month', primary: { label: 'Tasa', value: 24.1, unit: 'percent' },
      time: { window: { from: '2026-10-01', to: '2026-10-21' } }, series: [
        { from: '2026-09-01', to: '2026-09-30', value: 28.7, numerator: 8, denominator: 28, ids: [], cutoff: '2026-10-21', complete: true },
        { from: '2026-10-01', to: '2026-10-21', value: 24.1, numerator: 7, denominator: 29, ids: [], cutoff: '2026-10-21', complete: true },
      ] });
    expect(approvedBadge(item)).toMatchObject({ text: '↓ −4,6 pp', direction: 'down' });
    expect(approvedBadge(item)?.description).toContain('Mes parcial');
    expect(approvedBadge({ ...item, series: item.series!.map((point, index) => index ? { ...point, denominator: null } : point) })).toBeNull();
  });
});

it('valora menor mediana como favorable solo con contrato de mes cerrado',()=>{
 const s=story('servicios_pendientes',{time:{closedMonth:true,window:{from:'2026-09-01',to:'2026-09-30'}},primary:{label:'Mediana',value:14,unit:'days',comparison:{value:16.5,label:'mes anterior'}}});
 expect(approvedAssessment(s)).toBe('favorable');
 expect(approvedAssessment({...s,time:undefined})).toBe('neutral');
 expect(approvedAssessment({...s,primary:{...s.primary!,value:20}})).toBe('unfavorable');
});
it('sin base o con dirección ambigua no inventa valoración',()=>{
 for(const id of ['maquinas_pedidos','repuestos_stock','repuestos_alertas','clientes_cobertura_posventa','clientes_retencion','servicios_os_facturadas','servicios_productividad','servicios_eficiencia'] as const){
  expect(approvedAssessment(story(id,{primary:{label:'KPI',value:10,unit:'percent',comparison:{value:20,label:'anterior'}}}))).toBe('neutral');
 }
 const s=story('ventas_evolucion',{time:{window:{from:'2026-10-01',to:'2026-10-29'}},primary:{label:'Ventas',value:10,unit:'USD',comparison:{value:20,label:'Mismo tramo'}}});
 expect(approvedAssessment(s)).toBe('unfavorable');expect(approvedAssessment({...s,time:undefined,navigationPeriod:s.time!.window})).toBe('unfavorable');expect(approvedAssessment({...s,primary:{...s.primary!,value:30}})).toBe('favorable');expect(approvedAssessment({...s,primary:{...s.primary!,comparison:undefined}})).toBe('neutral');
});
