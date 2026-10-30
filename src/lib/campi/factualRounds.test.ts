import { expect,it,beforeEach,afterEach,vi } from 'vitest';
import { factualRounds,factualVariants,asuncionDay,readingDuration } from './factualRounds';
import type { PanoramaStory } from './panoramaStoryTypes';
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());
export const row=(id:PanoramaStory['id']='ventas_evolucion'):PanoramaStory=>({id,title:id,question:'',status:'ready',message:'',scope:'',sections:['repuestos.ventas'],cutoff:null,time:{window:{from:'2026-10-01',to:'2026-10-28'}},periodLabel:'01/10–28/10/2026',primary:{label:'Ventas antes de NC',value:100,unit:'USD',comparison:{value:80,label:'mismo tramo anterior'}},supporting:[{label:'Ventas acumuladas del año',value:500,unit:'USD',comparison:{value:400,label:'mismo corte anterior'}}],chart:null,breakdown:[],details:[],source:'fixture',route:''});
it('recorre una pregunta por tema antes de segunda ronda sin ranking ni cupo',()=>{
 const a=row(),b=row('ventas_servicios');b.primary!.value=99999;
 expect(factualRounds([a,b],()=>true).map(x=>x.topic)).toEqual([a.id,b.id,a.id,b.id]);
});
it('omite error, vacio, permiso parcial, ausencia de metrica y comparaciones sin variación',()=>{
 const a=row();a.primary!.value=80;a.supporting=[];
 expect(factualVariants(a,()=>true)).toEqual([]);
 for(const status of ['error','empty'] as const)expect(factualVariants({...row(),status},()=>true)).toEqual([]);
 expect(factualVariants({...row(),sections:['repuestos.ventas','servicios.ventas']},s=>s==='repuestos.ventas')).toEqual([]);
 expect(factualVariants({...row(),primary:null},()=>true)).toEqual([]);
});
it('no sustituye facturación neta por ventas brutas o NC',()=>{
 const a=row('ventas_facturacion');a.primary={label:'Facturación neta',value:-10,unit:'USD',comparison:{value:20,label:'anterior'}};
 expect(factualVariants(a,()=>true)).toHaveLength(1);
 expect(factualVariants(a,()=>true)[0].text).toContain('La facturación neta alcanza $ -10');
});
it('no recorre meses históricos y omite un corte viejo',()=>{
 const a=row('servicios_productividad');a.primary={label:'Productividad',value:50,unit:'percent',comparison:{value:20,label:'anterior'}};a.supporting=[];
 expect(factualVariants(a,()=>true)[0].text).toContain('La productividad técnica de este mes alcanza el 50%');
 a.time={window:{from:'2026-06-01',to:'2026-06-30'}};
 expect(factualVariants(a,()=>true)).toEqual([]);
});
it('dice este mes sin fechas y usa el calendario de Asunción',()=>{
 const a=row();a.supporting=[];
 const text=factualVariants(a,()=>true)[0].text;expect(text.toLowerCase()).toContain('este mes');expect(text).not.toMatch(/2026|28\/10|octubre/);
 expect(asuncionDay(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10-31');
 expect(factualVariants(a,()=>true,'2026-11-01')).toEqual([]);
 a.time=undefined;expect(factualVariants(a,()=>true)).toEqual([]);
});
it('etiqueta acumulados con su período real sin llamarlos importe del mes',()=>{
 const a=row('ventas_facturacion');a.primary!.label='Facturación neta del mes';
 a.supporting=[{label:'Facturación neta acumulada',value:400,unit:'USD',comparison:{value:300,label:'mismo corte anterior'}}];
 const text=factualVariants(a,()=>true)[1].text;
 expect(text).toContain('La facturación neta acumulada alcanza $ 400');expect(text).not.toContain('del mes');expect(text).not.toContain('año completo');
});

it('usa períodos diarios/semanales exactos y el ámbito seleccionado sin sumar áreas ajenas',()=>{
 const a=row();a.scope='Repuestos';a.sections=['repuestos.ventas'];a.supporting=[];
 a.temporalComparisons=[{kind:'day',label:'Ventas antes de NC',current:{from:'2026-10-27',to:'2026-10-27'},previous:{from:'2026-10-20',to:'2026-10-20'},components:[{section:'repuestos.ventas',value:10,previous:5},{section:'servicios.ventas',value:999,previous:444}]}];
 const text=factualVariants(a,()=>true)[1].text;expect(text).toContain('$ 10');expect(text).not.toContain('999');expect(text).toContain('última jornada');
 a.temporalComparisons[0].components=[];expect(factualVariants(a,()=>true)).toHaveLength(1);
});

it('omite ventanas temporales obsoletas y exige ambos tramos exactos',()=>{
 const a=row();a.supporting=[];a.temporalComparisons=[{kind:'day',label:'Ventas',current:{from:'2026-10-27',to:'2026-10-27'},previous:{from:'2026-10-20',to:'2026-10-20'},components:[{section:'repuestos.ventas',value:10,previous:5}]}];
 expect(factualVariants(a,()=>true,'2026-10-28')).toHaveLength(2);
 expect(factualVariants(a,()=>true,'2026-10-29')).toEqual([]);
 a.temporalComparisons[0].previous.to='2026-10-19';expect(factualVariants(a,()=>true)).toHaveLength(1);
});

it('conserva OS del mes pasado sin llamarlo este mes ni retroceder a junio',()=>{
 const a=row('servicios_pendientes');a.supporting=[];a.primary={label:'Mediana de resolución',value:14,unit:'days',comparison:{value:16.5,label:'agosto'}};a.time={window:{from:'2026-09-01',to:'2026-09-30'},closedMonth:true};
 const result=factualVariants(a,()=>true);expect(result).toHaveLength(1);expect(result[0].text).toContain('el mes pasado');expect(result[0].text).not.toMatch(/este mes|2026|septiembre|agosto/);expect(result[0].text).toContain('14 días');
 a.time.window={from:'2026-06-01',to:'2026-06-30'};expect(factualVariants(a,()=>true)).toEqual([]);
});

it('explica cobertura con población conciliada, no objetivo ni paréntesis',()=>{
 const a=row('clientes_cobertura_posventa');a.primary={label:'Cobertura',value:16.59,unit:'percent'};a.supporting=[{label:'Con compra',value:35,unit:'count'},{label:'Propietarios',value:211,unit:'count'}];
 const text=factualVariants(a,()=>true)[0].text;
 expect(text).toContain('35 de los 211 propietarios del parque');expect(text).toContain('cobertura de posventa');expect(text).not.toMatch(/[()]/);
 a.supporting[0].value=100;expect(factualVariants(a,()=>true)[0].text).not.toContain('100 de 211');
});
it('conserva una redacción específica para los doce temas sin fechas entre paréntesis',()=>{
 const ids=['ventas_evolucion','ventas_facturacion','maquinas_pedidos','servicios_pendientes','servicios_os_facturadas','repuestos_stock','repuestos_alertas','agenda_cumplimiento','servicios_productividad','servicios_eficiencia','clientes_retencion','clientes_cobertura_posventa'] as const;
 for(const id of ids){const a=row(id);a.supporting=[];a.primary={label:'Indicador',value:10,unit:id.includes('ventas')||id.includes('repuestos')?'USD':id==='servicios_pendientes'?'days':id==='maquinas_pedidos'?'count':'percent'};const result=factualVariants(a,()=>true);if(['maquinas_pedidos','repuestos_stock','repuestos_alertas'].includes(id)){expect(result).toEqual([]);continue;}const text=result[0].text;expect(text).not.toMatch(/[()]/);expect(text).not.toContain('Indicador');}
});

it.each(['ventas_evolucion','ventas_repuestos','ventas_servicios','ventas_maquinas','ventas_facturacion'] as const)('menciona una sola vez el período acumulado de %s y conserva la comparación',id=>{
 const a=row(id);
 if(id==='ventas_facturacion')a.supporting[0].label='Facturación neta acumulada';
 const text=factualVariants(a,()=>true).find(c=>c.id.endsWith('|accumulated'))!.text;
 expect(text.match(/acumulad[oa]/gi)).toHaveLength(1);
 expect(text).not.toMatch(/acumuladas|disponibles|[()]/);
 expect(text).toContain(id==='ventas_facturacion'?'La facturación neta acumulada alcanza $ 500':'La facturación bruta acumulada alcanza $ 500');
 expect(text).toContain('superando en $ 100 al período comparable del año anterior.');
});


it.each(['month','ytd'] as const)('no repite elegible en cobertura %s y conserva la población',periodMode=>{
 const a=row('clientes_cobertura_posventa');a.periodMode=periodMode;
 a.time={window:{from:periodMode==='month'?'2026-10-01':'2026-07-01',to:'2026-10-28'}};
 a.primary={label:'Cobertura',value:16.59,unit:'percent'};
 a.supporting=[{label:'Con compra',value:35,unit:'count'},{label:'Propietarios',value:211,unit:'count'}];
 const text=factualVariants(a,()=>true)[0].text;
 expect(text).not.toMatch(/elegible|activos/);
 expect(text).toContain('16,59%: 35 de los 211 propietarios del parque registraron compras de repuestos o servicios.');
 a.supporting[0].value=100;
 const fallback=factualVariants(a,()=>true)[0].text;
 expect(fallback).not.toMatch(/elegible|activos/);
 expect(fallback).not.toContain('100 de 211');
});

it('da 25% mas tiempo de lectura y redondea a segundos enteros',()=>{
 expect(readingDuration('breve')).toBe(10000);
 expect(readingDuration(Array(30).fill('palabra').join(' '))).toBe(15000);
 expect(readingDuration(Array(41).fill('palabra').join(' '))).toBe(21000);
});
