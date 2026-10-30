import {expect,it} from 'vitest';
import {salesCopy,topicCopy,amount} from './factualCopy';
import {factualVariants} from './factualRounds';
import type {PanoramaStory} from './panoramaStoryTypes';
const story=(id:PanoramaStory['id'],n:number,d:number,a:string,b:string):PanoramaStory=>({id,title:'',question:'',status:d===0?'empty':'ready',message:'',scope:'',sections:['repuestos.ventas'],cutoff:null,time:{window:{from:'2026-10-01',to:'2026-10-29'}},periodLabel:'',primary:{label:'Indicador',value:d?n/d*100:null,unit:'percent'},supporting:[{label:a,value:n,unit:'count'},{label:b,value:d,unit:'count'}],chart:null,breakdown:[],details:[],source:'fixture',route:''});
it.each(['ventas_evolucion','ventas_facturacion'] as const)('mantiene importes absolutos y variantes del catálogo %s',id=>{
 for(const period of ['month','ytd','day','week'] as const){
  const high=salesCopy(id,{label:'',value:120,unit:'USD',comparison:{value:100,label:''}},period)!;
  const low=salesCopy(id,{label:'',value:80,unit:'USD',comparison:{value:100,label:''}},period)!;
  expect(high).toContain('$ 120');expect(low).toContain('$ 80');expect(high).toContain('$ 20');expect(low).toContain('$ 20');expect(high).not.toMatch(/un \$|%/);expect(low).not.toMatch(/un \$|%/);
  expect(salesCopy(id,{label:'',value:100,unit:'USD',comparison:{value:100,label:''}},period)).toBeNull();
 }
 expect(salesCopy(id,{label:'',value:100,unit:'USD'},'month')).toContain('$ 100.');
 expect(salesCopy(id,{label:'',value:100,unit:'USD'},'ytd')).toContain('acumulada alcanza $ 100.');
 expect(salesCopy(id,{label:'',value:100,unit:'USD'},'day')).toBeNull();
});
it.each([
 ['servicios_os_facturadas','Facturadas a cliente','OS cerradas','Ninguna','Las 4','(2 de 4)'],
 ['agenda_cumplimiento','Completadas','Evaluables','Ninguno','Se completaron los 4','(2 de 4'],
 ['clientes_retencion','Retenidos','Cohorte base','Ninguno','Los 4','2 volvieron a comprar'],
 ['clientes_cobertura_posventa','Con compra','Propietarios','Ninguno','Todos los 4','2 de los 4'],
] as const)('conserva población, cero y totalidad exacta de %s',(id,a,b,zero,total,partial)=>{
 for(const mode of ['month','ytd'] as const){
  const s=story(id,2,4,a,b);s.periodMode=mode;expect(topicCopy(s)).toContain(partial);
  expect(topicCopy({...story(id,0,4,a,b),periodMode:mode})).toContain(zero);
  expect(topicCopy({...story(id,4,4,a,b),periodMode:mode})).toContain(total);
  expect(topicCopy(story(id,0,0,a,b))).not.toBeNull();
  const almost=story(id,99999,100000,a,b);almost.primary!.value=100;expect(topicCopy(almost)).not.toMatch(/100%|Todos|Se completaron los/);
  expect(topicCopy({...s,supporting:[]})).not.toMatch(/2 de|4/);
  expect(topicCopy({...s,status:'error'})).toBeNull();
  expect(topicCopy({...s,status:'empty',supporting:[]})).toBeNull();
 }
});
it.each(['servicios_productividad','servicios_eficiencia'] as const)('horas verificadas, cero e incompletitud %s',id=>{
 const efficiency=id==='servicios_eficiencia',a=efficiency?'Horas facturadas':'Horas trabajadas',b=efficiency?'Horas trabajadas':'Horas disponibles';
 expect(topicCopy(story(id,2,4,a,b))).toContain('2 horas');
 expect(topicCopy(story(id,0,4,a,b))).toContain(efficiency?'sin horas facturadas':'sin horas trabajadas');
 expect(topicCopy(story(id,0,0,a,b))).not.toBeNull();
 expect(topicCopy({...story(id,0,0,a,b),supporting:[]})).toBeNull();
 if(efficiency)expect(topicCopy({...story(id,0,0,a,b),details:['Datos incompletos']})).toBeNull();
});
it('no convierte una fotografía de clasificación en inventario vigente ni usa importe cero como ausencia de códigos',()=>{
 const s=story('repuestos_alertas',1,1,'Códigos expuestos','Base');s.primary={label:'',value:0,unit:'USD'};s.time={classificationDate:'2026-10-29'};
 expect(factualVariants(s,()=>true,'2026-10-29')).toEqual([]);
 s.time.inventoryCutoff='2026-10-29';const text=factualVariants(s,()=>true,'2026-10-29')[0].text;expect(text).toContain('1 códigos');expect(text).toContain('fechas ni los criterios');expect(text).not.toContain('nuevas compras');
 s.supporting[0].value=0;expect(factualVariants(s,()=>true,'2026-10-29')[0].text).toContain('no se identifican');
 s.status='error';expect(factualVariants(s,()=>true,'2026-10-29')).toEqual([]);
});
it('pedidos actuales requieren foto acreditada y cobertura completa conciliada',()=>{
 const s=story('maquinas_pedidos',1,1,'Pedidos con stock completo','Base');s.primary={label:'',value:3,unit:'count'};
 expect(factualVariants(s,()=>true,'2026-10-29')).toEqual([]);
 s.time={observedAt:'2026-10-29'};s.machineOrders={asOf:'2026-10-29',orders:3,units:3,stock:0,arrived:0,transit:0,unlinked:0,readyUnits:0,billedUnits:0,ready:[],unresolved:[]};
 expect(factualVariants(s,()=>true,'2026-10-29')[0].text).toBe('Hay 3 pedidos de máquinas pendientes.');
 s.chart={kind:'bars',title:'',unit:'count',rows:[{label:'Cobertura completa',value:1},{label:'Cobertura parcial',value:1},{label:'Sin cobertura',value:1},{label:'No clasificables',value:0}]};
 expect(topicCopy(s)).toContain('de los cuales 1 cuentan');
 s.chart.rows[3].value=1;s.chart.rows[1].value=0;expect(topicCopy(s)).toBe('Hay 3 pedidos de máquinas pendientes.');s.chart.rows[3].value=0;s.chart.rows[1].value=1;
 s.supporting[0].value=0;s.chart.rows[0].value=0;s.chart.rows[1].value=2;expect(topicCopy(s)).toContain('ninguno');
 s.supporting[0].value=3;s.chart.rows[0].value=3;s.chart.rows[1].value=0;s.chart.rows[2].value=0;expect(topicCopy(s)).toContain('Los 3 pedidos');
 s.primary.value=0;s.machineOrders.orders=0;s.status='empty';expect(factualVariants(s,()=>true,'2026-10-29')[0].text).toBe('Actualmente no se registran pedidos pendientes de máquinas.');
});
it('stock antiguo no declara ausencia por valoración cero con códigos existentes',()=>{
 const s=story('repuestos_stock',2,2,'Códigos en gris y rojo','Base');s.primary={label:'',value:0,unit:'USD'};
 expect(topicCopy(s)).toContain('2 códigos');s.supporting[0].value=0;expect(topicCopy(s)).toContain('no se registra stock');
});

it('redondea solo USD en presentacion y omite diferencias que se mostrarian como cero',()=>{
 expect(amount(443626.45,'USD')).toBe('$ 443.626');
 expect(amount(-506633.68,'USD')).toBe('$ -506.634');
 expect(amount(16.59,'percent')).toBe('16,59%');
 expect(amount(14.5,'days')).toBe('14,5 días');
 const metric={label:'',value:100.21,unit:'USD' as const,comparison:{value:100.10,label:''}};
 expect(salesCopy('ventas_evolucion',metric,'month')).toBeNull();
 expect(metric.value).toBe(100.21);
});
