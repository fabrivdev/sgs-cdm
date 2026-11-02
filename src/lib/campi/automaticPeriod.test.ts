import { beforeEach, expect, it } from 'vitest';
import { asuncionDay, factualVariants } from './factualRounds';
import { businessDayCount, requestedPeriod, readPeriodPreferences, savePeriodChoice, protectAutomaticPeriod, periodCaption } from './automaticPeriod';
import { planningStory } from './managerialStories';
import { resolutionWindowStory } from './resolutionWindow';
import { topicCopy } from './factualCopy';

beforeEach(() => localStorage.clear());
it('counts first five weekdays, sixth and weekends without inventing holidays', () => {
  expect(businessDayCount('2026-11-01')).toBe(0);
  expect(businessDayCount('2026-11-06')).toBe(5);
  expect(requestedPeriod('ventas_evolucion','auto','2026-11-08')).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion','auto','2026-11-09')).toBe('month');
  expect(requestedPeriod('ventas_evolucion','auto','2026-12-01')).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion','auto','2026-11-09',['2026-11-02'])).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion','auto','2026-11-10',['2026-11-02','2026-11-02'])).toBe('month');
});
it('uses Paraguay civil day on the UTC month boundary', () => {
  const day = asuncionDay(new Date('2026-11-01T01:00:00Z'));
  expect(day).toBe('2026-10-31');
  expect(requestedPeriod('ventas_evolucion','auto',day)).toBe('month');
});
it('manual choice persists across months, users remain isolated and auto removes only that override', () => {
  savePeriodChoice('a','ventas_evolucion','month');
  savePeriodChoice('a','servicios_pendientes','ytd');
  expect(requestedPeriod('ventas_evolucion',readPeriodPreferences('a').ventas_evolucion!,'2027-01-01')).toBe('month');
  expect(readPeriodPreferences('b')).toEqual({});
  savePeriodChoice('a','ventas_evolucion','auto');
  expect(readPeriodPreferences('a')).toEqual({servicios_pendientes:'ytd'});
});
it('does not accumulate snapshots even with an invalid persisted period', () => {
  for (const id of ['maquinas_pedidos','repuestos_stock','repuestos_alertas'] as const) {
    expect(requestedPeriod(id,'ytd','2026-11-02')).toBe('month');
    expect(savePeriodChoice('a',id,'ytd')).toBe(false);
  }
});
it('real zero is current data, not a signal to fall back to accumulated values', () => {
  const source = planningStory([{id:'1',fecha:'2026-11-09',estado:'Pendiente'}], '2026-11-09');
  expect(source.primary?.value).toBe(0);
  expect(protectAutomaticPeriod(source,'auto','2026-11-09')).toBe(source);
});
it('stale or unverified source never becomes verified from requested range or HTTP success', () => {
  const source = resolutionWindowStory([], '2026-11-09', 'month');
  expect(protectAutomaticPeriod(source,'auto','2026-11-09').status).toBe('empty');
  const stale = {...source,sourceFreshness:{through:'2026-10-31',complete:true}};
  const auto = protectAutomaticPeriod(stale,'auto','2026-11-09');
  expect(auto.periodMode).toBe('month');
  expect(auto.periodNotice).toContain('31/10/2026');
  expect(auto.primary).toEqual(source.primary);
  const manual = protectAutomaticPeriod(stale,'month','2026-11-09');
  expect(manual.status).toBe('empty');
  expect(manual.periodNotice).toBeTruthy();
  expect(factualVariants(manual,()=>true,'2026-11-09')).toEqual([]);
});
it('never replaces source failures or invents a zero while preserving successful unknown-freshness readings',()=>{
  const available = planningStory([{id:'1',fecha:'2026-11-09',estado:'Pendiente'}],'2026-11-09');
  const observed = protectAutomaticPeriod({...available,sourceFreshness:undefined},'auto','2026-11-09');
  expect(observed.primary?.value).toBe(0);
  expect(observed.status).toBe('ready');
  expect(observed.periodNotice).toContain('sin confirmar');
  const failed={...available,status:'error' as const,message:'Fuente inaccesible',primary:null};
  expect(protectAutomaticPeriod(failed,'auto','2026-11-09')).toBe(failed);
});
it('early accumulated source keeps its missing-freshness notice instead of concealing it', () => {
  const source = resolutionWindowStory([], '2026-11-02','ytd');
  const result = protectAutomaticPeriod(source,'auto','2026-11-02');
  expect(result.periodMode).toBe('ytd');
  expect(result.periodNotice).toContain('no está verificada');
  expect(periodCaption(result)).toBe('Desde julio de 2026 hasta hoy');
});
it('uses July wording only with the actual supported start date', () => {
  const source = planningStory([{id:'1',fecha:'2026-11-02',estado:'Completado'},{id:'2',fecha:'2026-11-01',estado:'Pendiente'}],'2026-11-02','ytd');
  expect(topicCopy(source)).toContain('En el acumulado disponible');
  expect(topicCopy({...source,time:{window:{from:'2026-07-01',to:'2026-11-02'}}})).toContain('Desde julio de 2026');
});
