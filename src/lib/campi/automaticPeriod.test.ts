import { beforeEach, expect, it } from 'vitest';
import { asuncionDay } from './factualRounds';
import { businessDayCount, requestedPeriod, readPeriodPreferences, savePeriodChoice } from './automaticPeriod';

beforeEach(() => localStorage.clear());
it('counts first five weekdays, sixth and weekends without inventing holidays', () => {
  expect(businessDayCount('2026-11-01')).toBe(0);
  expect(businessDayCount('2026-11-06')).toBe(5);
  expect(requestedPeriod('ventas_evolucion',undefined,'2026-11-08')).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion',undefined,'2026-11-09')).toBe('month');
  expect(requestedPeriod('ventas_evolucion',undefined,'2026-12-01')).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion',undefined,'2026-11-09',['2026-11-02'])).toBe('ytd');
  expect(requestedPeriod('ventas_evolucion',undefined,'2026-11-10',['2026-11-02','2026-11-02'])).toBe('month');
});
it('uses Paraguay civil day on the UTC month boundary', () => {
  const day = asuncionDay(new Date('2026-11-01T01:00:00Z'));
  expect(day).toBe('2026-10-31');
  expect(requestedPeriod('ventas_evolucion',undefined,day)).toBe('month');
});
it('manual choice persists across months, users remain isolated without requiring any automatic control', () => {
  savePeriodChoice('a','ventas_evolucion','month');
  savePeriodChoice('a','servicios_pendientes','ytd');
  expect(requestedPeriod('ventas_evolucion',readPeriodPreferences('a').ventas_evolucion!,'2027-01-01')).toBe('month');
  expect(readPeriodPreferences('b')).toEqual({});
  expect(readPeriodPreferences('a')).toEqual({ventas_evolucion:'month',servicios_pendientes:'ytd'});
});
it('does not accumulate snapshots even with an invalid persisted period', () => {
  for (const id of ['maquinas_pedidos','repuestos_stock','repuestos_alertas'] as const) {
    expect(requestedPeriod(id,'ytd','2026-11-02')).toBe('month');
    expect(savePeriodChoice('a',id,'ytd')).toBe(false);
  }
});
