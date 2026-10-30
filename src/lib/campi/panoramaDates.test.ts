import { describe, it, expect } from 'vitest';
import { formatDateText, storyDetailDateLines, monthTick, formatDay, formatRange, formatMonth, monthWindows, storyDateLines } from './panoramaDates';
describe('shared Panorama dates', () => {
 it('keeps calendar dates timezone independent and validates leap days', () => {
   expect(formatDay('2024-02-29')).toBe('29/02/2024');
   expect(() => formatDay('2025-02-29')).toThrow();
   expect(() => formatDay('2026-13-01')).toThrow();
   expect(formatRange({from:'2025-12-01',to:'2026-01-21'})).toBe('01/12/2025–21/01/2026');
   expect(() => formatRange({from:'2026-02-01',to:'2026-01-21'})).toThrow();
 });
 it('keeps classification distinct from the inventory cutoff and both retention windows', () => {
   expect(storyDateLines({periodLabel:'',time:{classificationDate:'2026-10-21'}})).toEqual(['Clasificación 21/10/2026']);
   expect(storyDateLines({periodLabel:'',time:{window:{from:'2026-10-01',to:'2026-10-21'},comparison:{from:'2026-09-01',to:'2026-09-21'}}})).toEqual(['Base 01/09/2026–21/09/2026','Recompra 01/10/2026–21/10/2026']);
 });
 it('builds six bounded months across years without fixed dates', () => {
   const months=monthWindows('2027-02-15');
   expect(months).toHaveLength(6); expect(months[0].from).toBe('2026-09-01');
   expect(months[5]).toEqual({from:'2027-02-01',to:'2027-02-15'});
   expect(formatMonth('2026-09-01')).toBe('sep 2026');
 });
});
it('formats detail dates while retaining semantic labels and capitalized month ticks',()=>{
 expect(formatDateText('Corte 2026-10-21')).toBe('Corte 21/10/2026');
 expect(monthTick('oct 2026*')).toBe('Oct*'); expect(monthTick('ene 2025')).toBe('Ene');
 expect(storyDetailDateLines({id:'servicios_eficiencia',periodLabel:'',cutoff:'2026-10-21',time:{window:{from:'2026-10-01',to:'2026-10-21'}}} as never)).toEqual(['Período 01/10/2026–21/10/2026','Corte documental 21/10/2026']);
});
