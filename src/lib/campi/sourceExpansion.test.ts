import { it, expect } from 'vitest';
import { customerCohorts, validateCustomerCohorts, validateOrderComposition, withOrderComposition, withPartsExpansion } from './sourceExpansion';
import type { PanoramaStory } from './panoramaStoryTypes';
it('uses one owner base and deduplicates services/parts union',()=>{
 const rows=[{id:'a',propietario:true,base:true,actual:true,servicios:true,repuestos:true},{id:'b',propietario:true,base:false,actual:false,servicios:false,repuestos:false}];
 expect(customerCohorts(rows)).toMatchObject({owners:['a','b'],union:['a'],services:['a'],parts:['a'],retained:['a']});
 expect(()=>customerCohorts([...rows,rows[0]])).toThrow();
});
it('classifies all orders without inventing individual destinations or dropping unknowns',()=>{
 const story={primary:{value:4},supporting:[{label:'Unidades pendientes',value:6},{label:'Pedidos con stock completo',value:0}]} as PanoramaStory;
 const raw={pedidos_completos:[{id:'a',unidades:1,disponibles:1,clasificable:true,categoria:'Cobertura completa'},{id:'b',unidades:2,disponibles:1,clasificable:true,categoria:'Cobertura parcial'},{id:'c',unidades:1,disponibles:0,clasificable:true,categoria:'Sin cobertura'},{id:'d',unidades:2,disponibles:0,clasificable:false,categoria:'No clasificables'}]};
 expect(withOrderComposition(story,raw).chart?.rows.map(r=>r.value)).toEqual([1,1,1,1]);
 expect(withOrderComposition(story,{pedidos_completos:raw.pedidos_completos.slice(1)})).toBe(story);
 expect(()=>validateOrderComposition(story,{pedidos_completos:raw.pedidos_completos.map(r=>({...r,categoria:r.id==='d'?'Sin cobertura':r.categoria}))})).toThrow();
 expect(validateOrderComposition(story,raw).chart?.rows.map(r=>r.value)).toEqual([1,1,1,1]);
 expect(()=>validateOrderComposition(story,{pedidos_completos:raw.pedidos_completos.slice(1)})).toThrow();
});
it('checks customer identities and both windows before using a cohort',()=>{
 const expected={desde:'2026-10-01',hasta:'2026-10-21',prev_desde:'2026-09-01',prev_hasta:'2026-09-21',compradores_base:2,compradores_retenidos:1,propietarios_elegibles:2,propietarios_con_compra_actual:1};
 const raw={version:2,desde:expected.desde,hasta:expected.hasta,prev_desde:expected.prev_desde,prev_hasta:expected.prev_hasta,cohorte_base:['a','b'],cohorte_actual:['b','c'],retenidos:['b'],propietarios:['a','b'],propietarios_con_compra:['b'],desglose_lineas:null,desglose_estado:'pendiente_definicion_no_aditiva'};
 expect(validateCustomerCohorts(raw,expected).propietarios_con_compra).toEqual(['b']);
 expect(()=>validateCustomerCohorts({...raw,retenidos:['c']},expected)).toThrow();
 expect(()=>validateCustomerCohorts({...raw,propietarios_con_compra:['c']},expected)).toThrow();
 expect(()=>validateCustomerCohorts({...raw,hasta:'2026-10-20'},expected)).toThrow();
});
it('requires age bands and transition values to reconcile with their KPI',()=>{
 const story={id:'repuestos_stock',primary:{value:100}} as PanoramaStory;
 expect(withPartsExpansion(story,{tramos_compra:[{tramo:'366–1000 días',codigos:2,valor_usd:100}]}).detailChart?.rows[0].value).toBe(100);
 expect(()=>withPartsExpansion(story,{tramos_compra:[{tramo:'366–1000 días',codigos:2,valor_usd:99}]})).toThrow();
 const alerts={id:'repuestos_alertas',primary:{value:100}} as PanoramaStory;
 const chart=withPartsExpansion(alerts,{transiciones:[{codigo:'x',destino:'GRIS',dias_hasta:1,valor_usd:100}]}).chart;
 expect(chart?.rows).toHaveLength(4);expect(chart?.rows[0]).toMatchObject({value:100,count:1});expect(chart?.rows[3]).toMatchObject({value:0,count:0});
});
it('keeps grey and red transition values separate within each time window',()=>{
 const story={id:'repuestos_alertas',primary:{value:120}} as PanoramaStory;
 const expanded=withPartsExpansion(story,{transiciones:[
  {codigo:'g',destino:'GRIS',dias_hasta:1,valor_usd:30},
  {codigo:'r1',destino:'ROJO',dias_hasta:7,valor_usd:70},
  {codigo:'r2',destino:'ROJO',dias_hasta:19,valor_usd:20},
 ]});
 expect(expanded.chart?.rows.map(row=>row.value)).toEqual([100,0,20,0]);
 expect(expanded.changeBuckets?.[0]).toMatchObject({gris:{value:30,count:1},rojo:{value:70,count:1}});
 expect(expanded.changeBuckets?.[1]).toMatchObject({gris:{value:0,count:0},rojo:{value:0,count:0}});
 expect(expanded.changeBuckets?.[2]).toMatchObject({gris:{value:0,count:0},rojo:{value:20,count:1}});
 expect(withPartsExpansion(story,{})).toBe(story);
 expect(()=>withPartsExpansion(story,{transiciones:[{codigo:'g',destino:'GRIS',dias_hasta:1,valor_usd:119}]})).toThrow();
});
it('rejects transitions assigned to the wrong destination even when the grand total matches',()=>{
 const story={id:'repuestos_alertas',primary:{value:100},chart:{kind:'bars',rows:[{label:'Gris',value:40,count:1},{label:'Rojo',value:60,count:1}]}} as PanoramaStory;
 expect(()=>withPartsExpansion(story,{transiciones:[
  {codigo:'a',destino:'GRIS',dias_hasta:1,valor_usd:60},
  {codigo:'b',destino:'ROJO',dias_hasta:1,valor_usd:40},
 ]})).toThrow('destino');
});
