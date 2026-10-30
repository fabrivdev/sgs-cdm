import { expect,it,vi,beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from}}));
import { storyDestinations } from './storyNavigation';
import { resolutionWindow,resolutionWindowStory } from './resolutionWindow';
import { loadClosures,type ClosureRow } from './seriesData';
import { factualVariants,asuncionDay } from './factualRounds';
const row=(id:string,open:string|null,close:string):ClosureRow=>({os_numero:id,fecha_abierta_os:open,fecha_cierre_os:close,situacion_os:'Cerrada'});
beforeEach(()=>vi.resetAllMocks());
it('recalcula mes y acumulado desde julio con aperturas anteriores, cero y último día',()=>{
 const rows=[row('a','2026-06-01','2026-07-01'),row('b','2026-10-01','2026-10-01'),row('c','2026-09-30','2026-10-29T23:59:59Z'),row('d','2026-10-29','2026-10-30')];
 const month=resolutionWindowStory(rows,'2026-10-29','month'),all=resolutionWindowStory(rows,'2026-10-29','ytd');
 expect(month.primary?.value).toBe(14.5);expect(all.primary?.value).toBe(29);
 expect(month.closureDistribution).toEqual({total:2,bins:[1,0,1,0]});
 expect(all.closureDistribution).toEqual({total:3,bins:[1,0,2,0]});
 expect(all.navigationPeriod).toEqual({from:'2026-07-01',to:'2026-10-29'});
 expect(all.route).toContain('desde=2026-07-01&hasta=2026-10-29');expect(storyDestinations(all)).toEqual([{label:'OS cerradas del período',route:all.route}]);expect(month.primary?.comparison).toBeUndefined();
 expect(factualVariants(month,()=>true,'2026-10-29')[0].text).toContain('cerradas este mes');
 expect(factualVariants(all,()=>true,'2026-10-29')[0].text).toContain('Desde julio de 2026');
});
it('excluye abiertas y no convierte vacío ni fecha inválida en cero',()=>{
 expect(resolutionWindowStory([],'2026-10-29','month')).toMatchObject({status:'empty',primary:{value:null}});
 expect(resolutionWindowStory([{...row('x',null,'2026-10-02'),situacion_os:'Abierta'}],'2026-10-29','month').status).toBe('empty');
 for(const open of [null,'2026-02-30','2026-11-01'])expect(()=>resolutionWindowStory([row('x',open,'2026-10-02')],'2026-10-29','month')).toThrow();
 const a=row('A','2026-10-01','2026-10-02');expect(()=>resolutionWindowStory([a,{...a,os_numero:' a '}],'2026-10-29','month')).toThrow();
});
it('respeta día de Asunción y frontera de mes sin retroceder al mes cerrado',()=>{
 const day=asuncionDay(new Date('2026-11-01T01:00:00Z'));
 expect(resolutionWindow(day,'month')).toEqual({from:'2026-10-01',to:'2026-10-31'});
 expect(resolutionWindow('2026-11-01','month').from).toBe('2026-11-01');
});
function query(result:unknown){const q:Record<string,unknown>={};for(const k of ['select','gte','lte','order'])q[k]=vi.fn(()=>q);q.range=vi.fn(async()=>result);return q;}
it('lee todas las páginas y verifica total, duplicados y cobertura',async()=>{
 const rows=Array.from({length:501},(_,i)=>row(String(i),'2026-10-01','2026-10-02'));
 const q1=query({data:rows.slice(0,500),count:501,error:null}),q2=query({data:rows.slice(500),count:501,error:null});
 mocks.from.mockReturnValueOnce(q1).mockReturnValueOnce(q2);
 expect(await loadClosures('2026-07-01','2026-10-29')).toHaveLength(501);
 expect(q2.range).toHaveBeenCalledWith(500,999);expect(q1.lte).toHaveBeenCalledWith('fecha_cierre_os','2026-10-29T23:59:59.999Z');
 for(const result of [{data:[],count:1,error:null},{data:[rows[0],rows[0]],count:2,error:null},{data:null,count:null,error:new Error('denied')}]){
 mocks.from.mockReturnValue(query(result));await expect(loadClosures('2026-07-01','2026-10-29')).rejects.toThrow();}
 mocks.from.mockReturnValueOnce(query({data:rows.slice(0,500),count:501,error:null})).mockReturnValueOnce(query({data:rows.slice(500),count:502,error:null}));
 await expect(loadClosures('2026-07-01','2026-10-29')).rejects.toThrow('Cambió');
});
