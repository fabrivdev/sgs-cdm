import { describe, expect, it, vi } from 'vitest';
import { comparisonWindow, loadPeriodComparisons, periodWindows, variation } from './salesPeriodComparison';
import { machinePeriodData } from './machinePeriodData';
import type { MaquinasDashboardResponse } from './MaquinasVentas';
import { comparisonExports, periodMoney } from './salesPeriodColumns';
import { createSalesWorkbook } from './salesTableExport';

describe('sales period contracts', () => {
  it.each([
    ['dia','2026-09-14','2026-09-15',2,'2026-09-14'],
    ['semana','2026-09-02','2026-09-08',2,'2026-08-31'],
    ['mes','2026-01-15','2026-03-04',3,'2026-01-01'],
    ['anio','2025-06-01','2026-02-10',2,'2025-01-01'],
  ] as const)('generates clipped %s periods including empty intervals', (mode,from,to,count,first) => {
    const rows=periodWindows(from,to,mode);
    expect(rows).toHaveLength(count); expect(rows[0]).toMatchObject({periodo:first,from}); expect(rows.at(-1)?.to).toBe(to);
  });
  it('compares partial months and weeks using their actual inclusive dates', () => {
    expect(comparisonWindow({from:'2026-09-03',to:'2026-09-14'},'mes','previous')).toEqual({from:'2026-08-03',to:'2026-08-14'});
    expect(comparisonWindow({from:'2026-09-02',to:'2026-09-06'},'semana','previous')).toEqual({from:'2026-08-26',to:'2026-08-30'});
    expect(comparisonWindow({from:'2026-08-31',to:'2026-09-06'},'semana','ly')).toEqual({from:'2025-08-31',to:'2025-09-06'});
    expect(comparisonWindow({from:'2026-01-01',to:'2026-01-01'},'dia','previous')).toEqual({from:'2025-12-31',to:'2025-12-31'});
  });
  it('preserves full month/year ends across leap years but not partial ends', () => {
    expect(comparisonWindow({from:'2025-02-01',to:'2025-02-28'},'mes','ly')).toEqual({from:'2024-02-01',to:'2024-02-29'});
    expect(comparisonWindow({from:'2024-02-01',to:'2024-02-29'},'mes','ly')).toEqual({from:'2023-02-01',to:'2023-02-28'});
    expect(comparisonWindow({from:'2025-02-01',to:'2025-02-14'},'mes','ly').to).toBe('2024-02-14');
    expect(comparisonWindow({from:'2025-01-01',to:'2025-12-31'},'anio','ly')).toEqual({from:'2024-01-01',to:'2024-12-31'});
  });
  it('loads coverage for each clipped month and recalculates total from the overall comparable range', async () => {
    const fetch=vi.fn(async ({from}:{from:string})=>from.startsWith('2025') ? [{periodo:'2025-07-15',total:10.25}] : [{periodo:'2026-06-15',total:20.25},{periodo:'2026-07-01',total:40},{periodo:'2026-07-15',total:80}]);
    const result=await loadPeriodComparisons('2026-07-10','2026-08-05','mes',fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith({from:'2026-06-10',to:'2026-07-05'});
    expect(result.periods['2026-07-01'].previous).toBe(20.25);
    expect(result.periods['2026-08-01'].previous).toBe(40);
    expect(result.total.previous).toBe(60.25);
    expect(result.total.ly).toBe(10.25);
  });
  it('distinguishes denied/unavailable data from successful empty zero, without rejecting current data',async()=>{
    const result=await loadPeriodComparisons('2026-09-01','2026-09-14','mes',async({from})=>{if(from.startsWith('2025')) throw new Error('permission denied');return [];});
    expect(result.total).toEqual({previous:0,ly:null});
    const malformed=await loadPeriodComparisons('2026-09-01','2026-09-14','mes',async()=>[{periodo:'2025-09-01',total:null as unknown as number}]);
    expect(malformed.total).toEqual({previous:null,ly:null});
  });
  it('keeps undefined percentages for zero, negative and unknown bases',()=>{
    for(const base of [0,-100,null,NaN]) expect(variation(100,base)).toBeNull();
    expect(variation(125,100)).toBe(.25);expect(variation(-50,100)).toBe(-1.5);
  });
  it('exports raw numeric amounts and ratios separately while displaying whole dollars',()=>{
    const rows=[{current:125.75,prior:100.25},{current:10,prior:null},{current:0,prior:0}];
    const columns=comparisonExports<(typeof rows)[number]>('ly','LY',r=>r.prior,r=>r.current);
    const sheet=createSalesWorkbook(rows,columns,'Periods').Sheets.Periods;
    expect(sheet.A2.v).toBe(100.25);expect(sheet.A2.t).toBe('n');expect(sheet.B2.v).toBeCloseTo(25.5/100.25);
    expect(sheet.A3).toBeUndefined();expect(sheet.B3).toBeUndefined();expect(sheet.A4.v).toBe(0);expect(sheet.B4).toBeUndefined();
    expect(periodMoney(125.75)).toBe('$ 126');expect(periodMoney(null)).toBe('\u2014');
  });
  it('derives machine gross and NC money independently of units, keeps distinct counts, fills only successful empty periods',()=>{
    const resumen={total:99.75,facturas:1,clientes:1,vendidas:8,notas_credito:0,netas:8,promedio_unidad:0};
    const source={resumen,periodos:[{...resumen,periodo:'2026-08-01'}],lineas:[{fecha:'2026-08-05',facturado:125.5,unidades:8},{fecha:'2026-08-06',facturado:-25.75,unidades:0}]} as MaquinasDashboardResponse;
    const result=machinePeriodData(source,'2026-07-01','2026-08-31','mes');
    expect(result.resumen).toBe(resumen);
    expect(result.periodos[0]).toMatchObject({total:0,venta_bruta:0,notas_credito_monto:0});
    expect(result.periodos[1]).toMatchObject({total:99.75,venta_bruta:125.5,notas_credito_monto:25.75,facturas:1,clientes:1});
    expect(machinePeriodData({...source,lineas:[]},'2026-08-01','2026-08-31','mes').periodos[0].venta_bruta).toBeUndefined();
  });
});
