import { describe, it, expect } from 'vitest';
import { resolutionDistribution, resolutionSeries, seriesChart } from './seriesData';
import { billedSeries } from './managerialStories';
import type { OrderBilling } from '@/features/service-orders/billing';
describe('monthly closing cohorts', () => {
 it('bins the exact eligible median cohort with nonoverlapping boundaries and a common total', () => {
   const days = [0, 7, 8, 15, 16, 30, 31];
   const rows = days.map((days, index) => ({ os_numero: String(index), situacion_os: 'Cerrada', fecha_abierta_os: '2026-09-01', fecha_cierre_os: `2026-09-${String(days + 1).padStart(2, '0')}` }));
   // Durations over 30 days need a previous-month opening date.
   rows[6].fecha_abierta_os = '2026-08-01';
   rows[6].fecha_cierre_os = '2026-09-01';
   rows[5].fecha_abierta_os = '2026-08-02';
   rows[5].fecha_cierre_os = '2026-09-01';
   rows[4].fecha_abierta_os = '2026-08-16';
   rows[4].fecha_cierre_os = '2026-09-01';
   rows[3].fecha_abierta_os = '2026-08-17';
   rows[3].fecha_cierre_os = '2026-09-01';
   rows[2].fecha_abierta_os = '2026-08-24';
   rows[2].fecha_cierre_os = '2026-09-01';
   expect(resolutionDistribution(rows, '2026-09-01', '2026-09-30')).toEqual({ total: 7, bins: [2, 2, 2, 1] });
   expect(resolutionSeries(rows, '2026-09-30', '2026-10-21').at(-1)).toMatchObject({ value: 15, denominator: 7, complete: true });
   expect(resolutionDistribution([...rows, { ...rows[0], os_numero: 'bad', fecha_abierta_os: null }], '2026-09-01', '2026-09-30')).toBeNull();
 });
 it('uses median, preserves empty months and rejects invalid durations as unknown', () => {
   const rows=[{os_numero:'1',situacion_os:'Cerrada',fecha_abierta_os:'2026-08-01',fecha_cierre_os:'2026-08-03'},
    {os_numero:'2',situacion_os:'Cerrada',fecha_abierta_os:'2026-08-01',fecha_cierre_os:'2026-08-05'},
    {os_numero:'3',situacion_os:'Cerrada',fecha_abierta_os:null,fecha_cierre_os:'2026-09-05'}];
   const series=resolutionSeries(rows,'2026-09-30','2026-10-21');
   expect(series[0].value).toBeNull(); expect(series[4].value).toBe(3);
   expect(series[5]).toMatchObject({value:null,complete:false,denominator:1});
   expect(seriesChart(series,'Resolution','days')!.rows[0].value).toBeNull();
   expect(()=>resolutionSeries([...rows,rows[0]],'2026-09-30','2026-10-21')).toThrow();
 });
 it('attributes late invoices to closing month using one documentary cutoff', () => {
   const rows=[{os_numero:'A',fecha_cierre_os:'2026-09-15',situacion_os:'Cerrada',tipo_tiempo:'Cliente'},
    {os_numero:'B',fecha_cierre_os:'2026-09-16',situacion_os:'Cerrada',tipo_tiempo:'Garantía'}];
   const bill:OrderBilling={os:'A',matched:true,ambiguous:false,documents:['f'],date:'2026-10-10',total:100,labor:100,parts:0,travel:0,thirdParty:0,laborLines:1,missingRates:0,billedHours:2};
   const series=billedSeries(rows,{A:bill},'2026-10-21');
   expect(series[4]).toMatchObject({value:50,numerator:1,denominator:2,cutoff:'2026-10-21',ids:['A','B']});
   expect(series[5].value).toBeNull();
   expect(billedSeries(rows,{A:{...bill,date:'2026-10-22'}},'2026-10-21')[4].value).toBe(0);
   expect(billedSeries(rows,{},'2026-10-21')[4]).toMatchObject({value:null,complete:false});
   expect(JSON.stringify(series)).not.toContain('Cliente sin factura');
 });
});
